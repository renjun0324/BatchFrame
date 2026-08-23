const assert = require('assert')
const {
  DEFAULT_TRUSTED_CDN_SUFFIXES,
  getTrustedCdnSuffixes,
  isTrustedHostname,
  validateCdnUrl,
  validateRedirectCount,
  validateContentLength,
  MAX_IMAGE_BYTES,
  MAX_REDIRECTS
} = require('../cloudfunctions/checkImage/securityTransport')

function expectCode(fn, code) {
  assert.throws(fn, error => error && error.code === code)
}

function run() {
  assert.deepStrictEqual(getTrustedCdnSuffixes({}), DEFAULT_TRUSTED_CDN_SUFFIXES)
  assert.strictEqual(isTrustedHostname('bucket.tcb.qcloud.la'), true)
  assert.strictEqual(isTrustedHostname('tcb.qcloud.la.attacker.com'), false)
  assert.strictEqual(isTrustedHostname('nottcb.qcloud.la'), false)
  assert.strictEqual(isTrustedHostname('qcloud.la.attacker.com'), false)
  assert.strictEqual(
    isTrustedHostname('review.example.test', ['example.test']),
    true
  )

  assert.strictEqual(
    validateCdnUrl('https://bucket.tcb.qcloud.la/review.jpg').hostname,
    'bucket.tcb.qcloud.la'
  )
  assert.strictEqual(
    validateCdnUrl('https://bucket.tcb.qcloud.la./review.jpg').hostname,
    'bucket.tcb.qcloud.la.'
  )
  expectCode(() => validateCdnUrl('http://bucket.tcb.qcloud.la/review.jpg'), 'INVALID_CDN_URL')
  expectCode(() => validateCdnUrl('https://127.0.0.1/review.jpg'), 'INVALID_CDN_URL')
  expectCode(() => validateCdnUrl('https://localhost/review.jpg'), 'INVALID_CDN_URL')
  expectCode(() => validateCdnUrl('https://user:pass@bucket.tcb.qcloud.la/review.jpg'), 'INVALID_CDN_URL')
  expectCode(() => validateCdnUrl('https://bucket.tcb.qcloud.la:8443/review.jpg'), 'INVALID_CDN_URL')
  expectCode(() => validateCdnUrl('https://evil-tcb.qcloud.la.attacker.com/review.jpg'), 'UNTRUSTED_CDN_HOST')
  expectCode(() => validateCdnUrl('https://nottcb.qcloud.la/review.jpg'), 'UNTRUSTED_CDN_HOST')
  expectCode(() => validateCdnUrl('not a url'), 'INVALID_CDN_URL')
  expectCode(() => validateRedirectCount(MAX_REDIRECTS + 1), 'CDN_TOO_MANY_REDIRECTS')
  validateRedirectCount(MAX_REDIRECTS)
  expectCode(() => validateContentLength(MAX_IMAGE_BYTES + 1), 'CDN_TOO_LARGE')
  validateContentLength(MAX_IMAGE_BYTES)

  console.log('check-image-security.test.js: all tests passed')
}

run()
