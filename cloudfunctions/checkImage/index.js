// 云函数：检查图片内容安全。
// CDN 只接受明确的 HTTPS 云开发域名；客户端在 CDN 传输错误时会使用 fileID 回退。
const cloud = require('wx-server-sdk')
const http = require('http')
const https = require('https')
const {
  createTransportError,
  getSafeHostname,
  getTrustedCdnSuffixes,
  validateCdnUrl,
  validateRedirectCount,
  validateContentLength
} = require('./securityTransport')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

function getErrorCode(error, fallback) {
  return (error && (error.code || error.errCode)) || fallback
}

function getErrorMessage(error, fallback) {
  return (error && (error.message || error.errMsg)) || fallback
}

function errorResponse(error, transport, startedAt) {
  const errCode = getErrorCode(error, 'SECURITY_CHECK_ERROR')
  const response = {
    success: false,
    safe: false,
    status: 'error',
    errCode,
    errMsg: getErrorMessage(error, '检测异常'),
    transport: transport || 'unknown'
  }
  if (errCode === 'UNTRUSTED_CDN_HOST' && error && error.cdnHost) {
    response.cdnHost = error.cdnHost
  }
  console.warn('[content-security] failed', {
    errCode,
    transport: response.transport,
    cdnHost: response.cdnHost || null,
    totalMs: Date.now() - startedAt
  })
  return response
}

function mapDownloadError(error) {
  if (error && error.code) return error
  return createTransportError(
    'CDN_DOWNLOAD_FAILED',
    getErrorMessage(error, '临时 CDN 图片下载失败')
  )
}

function downloadImageUrl(rawUrl, redirectCount = 0) {
  let parsed
  try {
    parsed = validateCdnUrl(rawUrl, getTrustedCdnSuffixes())
  } catch (error) {
    return Promise.reject(error)
  }

  try {
    validateRedirectCount(redirectCount)
  } catch (error) {
    return Promise.reject(error)
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, value) => {
      if (settled) return
      settled = true
      if (error) reject(mapDownloadError(error))
      else resolve(value)
    }
    const transport = parsed.protocol === 'https:' ? https : http
    const request = transport.get(
      parsed,
      { headers: { Accept: 'image/*' } },
      response => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          response.resume()
          if (redirectCount >= MAX_REDIRECTS) {
            finish(createTransportError(
              'CDN_TOO_MANY_REDIRECTS',
              '图片地址重定向次数过多'
            ))
            return
          }
          let nextUrl
          try {
            nextUrl = new URL(response.headers.location, parsed).toString()
          } catch (error) {
            finish(createTransportError('INVALID_CDN_URL', '重定向地址无效'))
            return
          }
          downloadImageUrl(nextUrl, redirectCount + 1)
            .then(value => finish(null, value))
            .catch(error => finish(error))
          return
        }

        if (response.statusCode !== 200) {
          response.resume()
          finish(createTransportError(
            'CDN_HTTP_ERROR',
            `临时 CDN 返回 HTTP ${response.statusCode}`,
            { httpStatus: response.statusCode }
          ))
          return
        }

        try {
          validateContentLength(response.headers['content-length'])
        } catch (error) {
          response.resume()
          finish(error)
          return
        }

        const chunks = []
        let total = 0
        response.on('data', chunk => {
          if (settled) return
          total += chunk.length
          if (total > MAX_IMAGE_BYTES) {
            request.destroy()
            finish(createTransportError('CDN_TOO_LARGE', '图片超过 10MB 限制'))
            return
          }
          chunks.push(chunk)
        })
        response.on('end', () => finish(null, Buffer.concat(chunks)))
        response.on('error', error => finish(error))
      }
    )
    request.setTimeout(8000, () => {
      finish(createTransportError('CDN_DOWNLOAD_TIMEOUT', '下载图片超时'))
      request.destroy()
    })
    request.on('error', error => {
      if (error && error.code === 'ECONNRESET' && settled) return
      finish(error)
    })
  })
}

function safeRequestLog(event) {
  const imgUrl = event && event.imgUrl
  return {
    hasFileID: Boolean(event && event.fileID),
    hasImgUrl: Boolean(imgUrl),
    contentType: event && event.contentType || null,
    cdnHost: imgUrl ? getSafeHostname(imgUrl) : null
  }
}

exports.main = async (event, context) => {
  const startTime = Date.now()
  const request = event || {}
  const { fileID, imgUrl, contentType } = request
  const transport = fileID ? 'file-id' : imgUrl ? 'cdn' : 'unknown'
  console.info('[content-security] request', safeRequestLog(request))

  if (!fileID && !imgUrl) {
    return errorResponse(
      createTransportError('MISSING_IMAGE_INPUT', '缺少图片参数'),
      transport,
      startTime
    )
  }

  const allowedContentTypes = ['image/jpeg', 'image/png', 'image/gif']
  if (!allowedContentTypes.includes(contentType)) {
    return errorResponse(
      createTransportError('UNSUPPORTED_CONTENT_TYPE', '不支持的图片格式'),
      transport,
      startTime
    )
  }

  try {
    let imgBuffer
    const downloadStartTime = Date.now()
    if (fileID) {
      const res = await cloud.downloadFile({ fileID })
      imgBuffer = res.fileContent
      console.info('[content-security] file-id download', {
        elapsedMs: Date.now() - downloadStartTime,
        bytes: imgBuffer && imgBuffer.length || 0
      })
    } else {
      imgBuffer = await downloadImageUrl(imgUrl)
      console.info('[content-security] cdn download', {
        cdnHost: getSafeHostname(imgUrl),
        elapsedMs: Date.now() - downloadStartTime,
        bytes: imgBuffer.length
      })
    }

    const checkStartTime = Date.now()
    const result = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType,
        value: imgBuffer
      }
    })
    const checkMs = Date.now() - checkStartTime
    const resultCode = Number(result && result.errCode)
    console.info('[content-security] imgSecCheck completed', {
      transport,
      checkMs,
      errCode: result && result.errCode
    })

    if (resultCode === 0) {
      console.info('[content-security] completed', {
        transport,
        checkMs,
        totalMs: Date.now() - startTime,
        status: 'passed'
      })
      return {
        success: true,
        safe: true,
        status: 'passed',
        transport,
        message: '图片内容安全'
      }
    }
    if (resultCode === 87014) {
      console.warn('[content-security] completed', {
        transport,
        checkMs,
        totalMs: Date.now() - startTime,
        status: 'rejected'
      })
      return {
        success: true,
        safe: false,
        status: 'rejected',
        transport,
        message: '图片包含违规内容'
      }
    }

    return errorResponse(
      createTransportError(
        result && result.errCode || 'IMG_SEC_CHECK_ERROR',
        result && result.errMsg || '检测失败'
      ),
      transport,
      startTime
    )
  } catch (error) {
    if (Number(error && (error.errCode || error.code)) === 87014) {
      return {
        success: true,
        safe: false,
        status: 'rejected',
        transport,
        message: '图片包含违规内容'
      }
    }
    return errorResponse(error, transport, startTime)
  }
}

exports._test = {
  downloadImageUrl,
  errorResponse,
  safeRequestLog
}
