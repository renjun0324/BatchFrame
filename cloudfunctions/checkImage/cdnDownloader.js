const http = require('http')
const https = require('https')
const {
  MAX_IMAGE_BYTES,
  MAX_REDIRECTS,
  createTransportError,
  getTrustedCdnSuffixes,
  validateCdnUrl,
  validateRedirectCount,
  validateContentLength
} = require('./securityTransport')

function getErrorMessage(error, fallback) {
  return (error && (error.message || error.errMsg)) || fallback
}

function mapDownloadError(error) {
  if (error && error.code) return error
  return createTransportError(
    'CDN_DOWNLOAD_FAILED',
    getErrorMessage(error, '临时 CDN 图片下载失败')
  )
}

function downloadImageUrl(rawUrl, options) {
  const settings = options || {}
  const redirectCount = Number(settings.redirectCount || 0)
  const trustedSuffixes = settings.trustedSuffixes || getTrustedCdnSuffixes()
  let parsed
  try {
    parsed = validateCdnUrl(rawUrl, trustedSuffixes)
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
    const get = settings.get || (parsed.protocol === 'https:' ? https.get : http.get)
    const request = get.call(parsed.protocol === 'https:' ? https : http, parsed, {
      headers: { Accept: 'image/*' }
    }, response => {
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
        downloadImageUrl(nextUrl, {
          ...settings,
          redirectCount: redirectCount + 1,
          trustedSuffixes
        }).then(value => finish(null, value)).catch(error => finish(error))
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
    })
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

module.exports = { downloadImageUrl }
