const net = require('net')

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_REDIRECTS = 2
const DEFAULT_TRUSTED_CDN_SUFFIXES = [
  'tcb.qcloud.la',
  'tcloudbaseapp.com',
  'tcloudbasegateway.com'
]

function createTransportError(code, message, extra) {
  const error = new Error(message)
  error.code = code
  Object.assign(error, extra || {})
  return error
}

function normalizeSuffix(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
}

function getTrustedCdnSuffixes(env) {
  const configured = String(
    (env || process.env).TRUSTED_CDN_HOST_SUFFIXES || ''
  )
    .split(',')
    .map(normalizeSuffix)
    .filter(Boolean)

  return Array.from(new Set(DEFAULT_TRUSTED_CDN_SUFFIXES.concat(configured)))
}

function isPrivateHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '')
  return host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === 'metadata' ||
    host === 'metadata.google.internal' ||
    host === 'ip6-localhost'
}

function isTrustedHostname(hostname, suffixes) {
  const host = String(hostname || '').toLowerCase().replace(/\.$/, '')
  return (suffixes || getTrustedCdnSuffixes()).some(suffix => (
    host === suffix || host.endsWith(`.${suffix}`)
  ))
}

function getSafeHostname(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/\.$/, '')
  } catch (err) {
    return null
  }
}

function validateCdnUrl(rawUrl, suffixes) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch (err) {
    throw createTransportError('INVALID_CDN_URL', '图片地址无效')
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '')
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !hostname ||
    net.isIP(hostname) ||
    isPrivateHostname(hostname)
  ) {
    throw createTransportError('INVALID_CDN_URL', '图片地址不符合安全传输规则', {
      cdnHost: hostname || undefined
    })
  }

  if (!isTrustedHostname(hostname, suffixes)) {
    throw createTransportError('UNTRUSTED_CDN_HOST', '临时 CDN 域名未被允许', {
      cdnHost: hostname
    })
  }

  return parsed
}

function validateRedirectCount(redirectCount) {
  if (redirectCount > MAX_REDIRECTS) {
    throw createTransportError('CDN_TOO_MANY_REDIRECTS', '图片地址重定向次数过多')
  }
}

function validateContentLength(length) {
  const declaredLength = Number(length || 0)
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw createTransportError('CDN_TOO_LARGE', '图片超过 10MB 限制')
  }
}

module.exports = {
  MAX_IMAGE_BYTES,
  MAX_REDIRECTS,
  DEFAULT_TRUSTED_CDN_SUFFIXES,
  createTransportError,
  getTrustedCdnSuffixes,
  getSafeHostname,
  isPrivateHostname,
  isTrustedHostname,
  validateCdnUrl,
  validateRedirectCount,
  validateContentLength
}
