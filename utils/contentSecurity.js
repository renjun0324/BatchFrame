/**
 * 用户图片内容安全检测。
 *
 * 合规原则：只有收到微信安全接口的明确通过结果，图片才可以进入编辑或导出流程。
 * 网络、云函数或接口异常一律视为未通过，绝不能降级为放行。
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

async function resolveContentType(filePath) {
  const fromPath = getContentTypeFromPath(filePath);
  if (fromPath) return fromPath;

  const info = await getImageInfo(filePath);
  return CONTENT_TYPES[String(info.type || '').toLowerCase()] || null;
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('内容安全检测超时')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * 检测一张图片；异常、超时、未知格式均返回“不通过”。
 */
async function checkSingleImage(tempFilePath) {
  let fileID = '';

  try {
    if (!wx.cloud || !wx.cloud.uploadFile || !wx.cloud.callFunction) {
      throw new Error('云开发未初始化，无法进行内容安全检测');
    }

    const contentType = await resolveContentType(tempFilePath);
    if (!contentType) {
      return {
        safe: false,
        status: 'error',
        message: '仅支持 JPG、JPEG、PNG 或 GIF 图片'
      };
    }

    const uploadResult = await withTimeout(wx.cloud.uploadFile({
      cloudPath: `temp-check/${Date.now()}-${Math.random().toString(36).slice(2)}.${contentType.split('/')[1]}`,
      filePath: tempFilePath
    }), 30000);

    fileID = uploadResult && uploadResult.fileID;
    if (!fileID) throw new Error('图片上传失败');

    const response = await withTimeout(wx.cloud.callFunction({
      name: 'checkImage',
      data: { fileID, contentType }
    }), 30000);
    const result = response && response.result;

    if (!result || result.success !== true || typeof result.safe !== 'boolean') {
      throw new Error((result && result.errMsg) || '内容安全服务返回异常');
    }

    return result.safe
      ? { safe: true, status: 'passed', message: '图片内容安全检测通过' }
      : { safe: false, status: 'rejected', message: result.message || '图片未通过内容安全检测' };
  } catch (err) {
    console.error('图片安全检测失败，已拒绝使用该图片：', err);
    return {
      safe: false,
      status: 'error',
      message: '内容安全检测未完成，请稍后重试'
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

async function checkMultipleImages(tempFilePaths, onProgress) {
  const results = [];
  let completedCount = 0;
  const concurrentLimit = 2;

  for (let i = 0; i < tempFilePaths.length; i += concurrentLimit) {
    const chunk = tempFilePaths.slice(i, i + concurrentLimit);
    const chunkResults = await Promise.all(chunk.map(async (path) => {
      const result = await checkSingleImage(path);
      completedCount += 1;
      if (onProgress) onProgress(completedCount, tempFilePaths.length);
      return { path, ...result };
    }));
    results.push(...chunkResults);
  }

  const unsafeCount = results.filter(item => !item.safe).length;
  return {
    allSafe: unsafeCount === 0,
    unsafeCount,
    results
  };
}

module.exports = { checkSingleImage, checkMultipleImages };
