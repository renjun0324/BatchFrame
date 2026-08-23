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

  try {
    if (!wx.cloud || !wx.cloud.uploadFile || !wx.cloud.callFunction) {
      throw new Error('云开发未初始化，无法进行内容安全检测');
    }

    const startedAt = Date.now();
    const info = await withTimeout(getImageInfo(tempFilePath), 10000);
    const contentType = await resolveContentType(tempFilePath, info);
    if (!contentType) {
      return {
        safe: false,
        status: 'error',
        message: '仅支持 JPG、JPEG、PNG 或 GIF 图片'
      };
    }

    const reviewPath = await compressForSecurity(tempFilePath, info);
    const reviewContentType = reviewPath === tempFilePath ? contentType : 'image/jpeg';
    const uploadStartedAt = Date.now();
    const uploadResult = await withTimeout(wx.cloud.uploadFile({
      cloudPath: `temp-check/${Date.now()}-${Math.random().toString(36).slice(2)}.${reviewContentType.split('/')[1]}`,
      filePath: reviewPath
    }), 30000);

    fileID = uploadResult && uploadResult.fileID;
    if (!fileID) throw new Error('图片上传失败');
    const uploadMs = Date.now() - uploadStartedAt;
    console.info('[content-security] upload completed', {
      path: tempFilePath,
      uploadMs
    });

    const checkStartedAt = Date.now();
    const response = await withTimeout(wx.cloud.callFunction({
      name: 'checkImage',
      data: { fileID, contentType: reviewContentType }
    }), 30000);
    const checkMs = Date.now() - checkStartedAt;
    const result = response && response.result;

    if (!result || result.success !== true || typeof result.safe !== 'boolean') {
      throw new Error((result && result.errMsg) || '内容安全服务返回异常');
    }

    const status = result.status || (result.safe ? 'passed' : 'rejected');
    if (!['passed', 'rejected'].includes(status) || (status === 'passed') !== result.safe) {
      throw new Error('内容安全服务状态不一致');
    }
    console.info('[content-security] completed', {
      path: tempFilePath,
      uploadMs,
      checkMs,
      totalMs: Date.now() - startedAt,
      status
    });
    return {
      safe: result.safe,
      status,
      message: result.message || (result.safe ? '图片内容安全检测通过' : '图片未通过内容安全检测')
    };
  } catch (err) {
    console.error('[content-security] error', {
      path: tempFilePath,
      errCode: err && err.errCode,
      message: err && (err.errMsg || err.message)
    });
    return {
      safe: false,
      status: 'error',
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

module.exports = { checkSingleImage, checkMultipleImages };
