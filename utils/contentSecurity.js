/**
 * 用户图片内容安全检测。
 *
 * 合规原则：只有收到微信安全接口的明确通过结果，图片才可以进入导出流程。
 * 检测异常只代表服务没有完成，不把它伪装成违规；导出前会再次重试异常图片。
 */

const CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif'
};

const CDN_TRANSPORT_ERRORS = new Set([
  'UNTRUSTED_CDN_HOST',
  'INVALID_CDN_URL',
  'CDN_HTTP_ERROR',
  'CDN_TOO_LARGE',
  'CDN_TOO_MANY_REDIRECTS',
  'CDN_DOWNLOAD_TIMEOUT',
  'CDN_DOWNLOAD_FAILED'
]);
const LEGACY_UNTRUSTED_CDN_MESSAGE = '图片地址不是受信任的临时 CDN 地址';

function getContentTypeFromPath(filePath) {
  const match = String(filePath || '').split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
  return match ? CONTENT_TYPES[match[1].toLowerCase()] : null;
}

function getImageInfo(filePath) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: filePath,
      success: resolve,
      fail: reject
    });
  });
}

async function resolveContentType(filePath, imageInfo) {
  const fromPath = getContentTypeFromPath(filePath);
  if (fromPath) return fromPath;

  const info = imageInfo || await getImageInfo(filePath);
  return CONTENT_TYPES[String(info.type || '').toLowerCase()] || null;
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('内容安全检测超时')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function getResultErrorCode(result) {
  return result && (result.errCode || result.code);
}

function isCdnTransportError(result) {
  const code = getResultErrorCode(result);
  if (typeof code === 'string' && (
    CDN_TRANSPORT_ERRORS.has(code) || code.startsWith('CDN_')
  )) return true;
  return (code === -1 || code === '-1') &&
    (result && (result.errMsg || result.message)) === LEGACY_UNTRUSTED_CDN_MESSAGE;
}

function createResultError(result) {
  const error = new Error(
    (result && (result.errMsg || result.message)) ||
    '内容安全服务返回异常'
  );
  error.errCode = getResultErrorCode(result) || 'SECURITY_CHECK_ERROR';
  error.transport = result && result.transport;
  error.cdnHost = result && result.cdnHost;
  return error;
}

async function callSecurityFunction(data) {
  const response = await withTimeout(wx.cloud.callFunction({
    name: 'checkImage',
    data
  }), 30000);
  return response && response.result;
}

async function uploadReviewCopy(reviewPath, contentType) {
  if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
    throw Object.assign(new Error('审核副本上传能力不可用'), {
      errCode: 'UPLOAD_UNAVAILABLE',
      transport: 'upload-fallback'
    });
  }
  const extension = contentType === 'image/png' ? 'png' : 'jpg';
  const uploadResult = await withTimeout(wx.cloud.uploadFile({
    cloudPath: `temp-check/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`,
    filePath: reviewPath
  }), 30000);
  const fileID = uploadResult && uploadResult.fileID;
  if (!fileID) {
    throw Object.assign(new Error('审核副本上传失败'), {
      errCode: 'UPLOAD_FAILED',
      transport: 'upload-fallback'
    });
  }
  return fileID;
}

function normalizeSecurityResult(result, transport) {
  if (!result || result.success !== true || typeof result.safe !== 'boolean') {
    throw createResultError(result || {
      errCode: 'SECURITY_CHECK_ERROR',
      transport
    });
  }
  const status = result.status || (result.safe ? 'passed' : 'rejected');
  if (!['passed', 'rejected'].includes(status) ||
      (status === 'passed') !== result.safe) {
    throw Object.assign(new Error('内容安全服务状态不一致'), {
      errCode: 'SECURITY_CHECK_ERROR',
      transport: result.transport || transport,
      cdnHost: result.cdnHost
    });
  }
  return {
    safe: result.safe,
    status,
    message: result.message || (result.safe ? '图片内容安全检测通过' : '图片未通过内容安全检测'),
    errCode: result.errCode,
    transport: transport || result.transport,
    cdnHost: result.cdnHost
  };
}

async function checkByFileId(reviewPath, contentType) {
  const uploadStartedAt = Date.now();
  const fileID = await uploadReviewCopy(reviewPath, contentType);
  const uploadMs = Date.now() - uploadStartedAt;
  let result;
  let checkMs = 0;
  try {
    const checkStartedAt = Date.now();
    result = await callSecurityFunction({ fileID, contentType });
    checkMs = Date.now() - checkStartedAt;
    return {
      result: normalizeSecurityResult(result, 'upload-fallback'),
      fileID,
      uploadMs,
      checkMs
    };
  } catch (error) {
    error.fileID = fileID;
    error.transport = 'upload-fallback';
    error.uploadMs = uploadMs;
    error.checkMs = checkMs;
    throw error;
  }
}

function compressForSecurity(filePath, info) {
  if (typeof wx.compressImage !== 'function') return Promise.resolve(filePath);

  const width = Number(info && info.width) || 0;
  const height = Number(info && info.height) || 0;
  if (!width || !height) return Promise.reject(new Error('无法读取图片尺寸'));

  const scale = Math.min(1, 1024 / Math.max(width, height));
  const compressedWidth = Math.max(1, Math.round(width * scale));
  const compressedHeight = Math.max(1, Math.round(height * scale));
  const startedAt = Date.now();

  return withTimeout(new Promise((resolve, reject) => {
    wx.compressImage({
      src: filePath,
      quality: 75,
      compressedWidth,
      compressedHeight,
      success: result => resolve(result && result.tempFilePath),
      fail: reject
    });
  }), 30000).then(reviewPath => {
    if (!reviewPath) throw new Error('审核副本生成失败');
    console.info('[content-security] review copy', {
      source: filePath,
      width: compressedWidth,
      height: compressedHeight,
      elapsedMs: Date.now() - startedAt
    });
    return reviewPath;
  });
}

/**
 * 检测一张图片；异常、超时、未知格式均返回 error，只有明确违规才返回 rejected。
 */
async function checkSingleImage(tempFilePath) {
  let fileID = '';
  let transport = 'unknown';
  let reviewCopyMs = 0;
  let uploadMs = 0;
  let checkMs = 0;
  const startedAt = Date.now();

  try {
    if (!wx.cloud || !wx.cloud.callFunction) {
      throw new Error('云开发未初始化，无法进行内容安全检测');
    }

    const info = await withTimeout(getImageInfo(tempFilePath), 10000);
    const contentType = await resolveContentType(tempFilePath, info);
    if (!contentType) {
      return {
        safe: false,
        status: 'error',
        errCode: 'UNSUPPORTED_CONTENT_TYPE',
        transport,
        message: '仅支持 JPG、JPEG、PNG 或 GIF 图片'
      };
    }

    const reviewCopyStartedAt = Date.now();
    const reviewPath = await compressForSecurity(tempFilePath, info);
    reviewCopyMs = Date.now() - reviewCopyStartedAt;
    const reviewContentType = reviewPath === tempFilePath ? contentType : 'image/jpeg';
    let normalizedResult;
    if (typeof wx.cloud.CDN === 'function') {
      transport = 'cdn';
      let cdnResult;
      try {
        const imgUrl = wx.cloud.CDN({ type: 'filePath', filePath: reviewPath });
        if (!imgUrl) {
          throw Object.assign(new Error('审核副本 CDN 地址生成失败'), {
            errCode: 'INVALID_CDN_URL',
            transport: 'cdn'
          });
        }
        const checkStartedAt = Date.now();
        cdnResult = await callSecurityFunction({
          imgUrl,
          contentType: reviewContentType
        });
        checkMs = Date.now() - checkStartedAt;
      } catch (error) {
        if (!isCdnTransportError(error)) throw error;
        cdnResult = {
          success: false,
          status: 'error',
          errCode: getResultErrorCode(error),
          errMsg: error.message,
          transport: 'cdn',
          cdnHost: error.cdnHost
        };
      }

      if (!isCdnTransportError(cdnResult)) {
        normalizedResult = normalizeSecurityResult(cdnResult, 'cdn');
      } else {
        console.warn('[content-security] CDN transport failed, using upload fallback', {
          path: tempFilePath,
          errCode: getResultErrorCode(cdnResult),
          cdnHost: cdnResult.cdnHost || null
        });
        const fallback = await checkByFileId(reviewPath, reviewContentType);
        fileID = fallback.fileID;
        normalizedResult = fallback.result;
        uploadMs = fallback.uploadMs;
        checkMs = fallback.checkMs;
        transport = 'upload-fallback';
      }
    } else {
      transport = 'upload-fallback';
      const fallback = await checkByFileId(reviewPath, reviewContentType);
      fileID = fallback.fileID;
      normalizedResult = fallback.result;
      uploadMs = fallback.uploadMs;
      checkMs = fallback.checkMs;
    }

    console.info('[content-security] completed', {
      path: tempFilePath,
      reviewCopyMs,
      uploadMs: uploadMs || undefined,
      checkMs,
      totalMs: Date.now() - startedAt,
      transport,
      status: normalizedResult.status
    });
    return normalizedResult;
  } catch (err) {
    fileID = fileID || (err && err.fileID) || '';
    console.error('[content-security] error', {
      path: tempFilePath,
      errCode: getResultErrorCode(err) || 'SECURITY_CHECK_ERROR',
      transport: err && err.transport || transport,
      cdnHost: err && err.cdnHost || null,
      reviewCopyMs,
      uploadMs: err && err.uploadMs || uploadMs || undefined,
      checkMs: err && err.checkMs || checkMs,
      totalMs: Date.now() - startedAt,
      message: err && (err.errMsg || err.message)
    });
    return {
      safe: false,
      status: 'error',
      errCode: getResultErrorCode(err) || 'SECURITY_CHECK_ERROR',
      transport: err && err.transport || transport,
      cdnHost: err && err.cdnHost,
      message: '内容安全检测未完成，可稍后重试'
    };
  } finally {
    if (fileID && wx.cloud && wx.cloud.deleteFile) {
      try {
        await wx.cloud.deleteFile({ fileList: [fileID] });
      } catch (err) {
        // 清理失败不影响“拒绝优先”结果；云端需通过生命周期规则定期清理 temp-check/。
        console.warn('删除内容安全临时文件失败：', err);
      }
    }
  }
}

async function checkMultipleImages(tempFilePaths, onProgress, onResult) {
  const results = [];
  let completedCount = 0;
  const concurrentLimit = 4;

  for (let i = 0; i < tempFilePaths.length; i += concurrentLimit) {
    const chunk = tempFilePaths.slice(i, i + concurrentLimit);
    const chunkResults = await Promise.all(chunk.map(async (path) => {
      const result = await checkSingleImage(path);
      completedCount += 1;
      if (onProgress) onProgress(completedCount, tempFilePaths.length);
      const item = { path, ...result };
      if (onResult) onResult(item);
      return item;
    }));
    results.push(...chunkResults);
  }

  return { results };
}

module.exports = {
  checkSingleImage,
  checkMultipleImages,
  callSecurityFunction,
  createResultError,
  isCdnTransportError,
  uploadReviewCopy
};
