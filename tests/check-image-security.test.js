const assert = require('assert')
const { EventEmitter } = require('events')
const Module = require('module')
const { downloadImageUrl } = require('../cloudfunctions/checkImage/cdnDownloader')
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

function makeResponse(spec) {
  const response = new EventEmitter()
  response.statusCode = spec.statusCode
  response.headers = spec.headers || {}
  response.resume = () => {}
  return response
}

function makeGet(specs) {
  const queue = specs.slice()
  const calls = []
  const get = (url, options, callback) => {
    calls.push({ url: String(url), options })
    const spec = queue.shift()
    if (!spec) throw new Error('unexpected mock request')
    const request = new EventEmitter()
    request.setTimeout = () => {}
    request.destroy = () => {}
    process.nextTick(() => {
      const response = makeResponse(spec)
      callback(response)
      if (spec.data) spec.data.forEach(chunk => response.emit('data', chunk))
      if (spec.error) response.emit('error', spec.error)
      if (spec.end !== false) response.emit('end')
    })
    return request
  }
  get.calls = calls
  return get
}

async function runDownloadTests() {
  let get = makeGet([
    { statusCode: 200, data: [Buffer.from('hello')] }
  ])
  let buffer = await downloadImageUrl(
    'https://bucket.tcb.qcloud.la/review.jpg',
    { get }
  )
  assert.strictEqual(buffer.toString(), 'hello')
  assert.strictEqual(get.calls.length, 1)

  get = makeGet([
    { statusCode: 200, data: [Buffer.alloc(MAX_IMAGE_BYTES + 1)] }
  ])
  await assert.rejects(
    downloadImageUrl('https://bucket.tcb.qcloud.la/review.jpg', { get }),
    error => error && error.code === 'CDN_TOO_LARGE'
  )

  get = makeGet([
    {
      statusCode: 302,
      headers: { location: 'https://bucket.tcb.qcloud.la/redirected.jpg' },
      data: []
    },
    { statusCode: 200, data: [Buffer.from('redirected')] }
  ])
  buffer = await downloadImageUrl(
    'https://bucket.tcb.qcloud.la/review.jpg',
    { get }
  )
  assert.strictEqual(buffer.toString(), 'redirected')
  assert.strictEqual(get.calls.length, 2)

  get = makeGet([
    { statusCode: 302, headers: { location: 'https://bucket.tcb.qcloud.la/2' } },
    { statusCode: 302, headers: { location: 'https://bucket.tcb.qcloud.la/3' } },
    { statusCode: 302, headers: { location: 'https://bucket.tcb.qcloud.la/4' } }
  ])
  await assert.rejects(
    downloadImageUrl('https://bucket.tcb.qcloud.la/1', { get }),
    error => error && error.code === 'CDN_TOO_MANY_REDIRECTS'
  )

  get = makeGet([
    { statusCode: 302, headers: { location: 'https://attacker.example/redirected.jpg' } }
  ])
  await assert.rejects(
    downloadImageUrl('https://bucket.tcb.qcloud.la/review.jpg', { get }),
    error => error && error.code === 'UNTRUSTED_CDN_HOST'
  )
  assert.strictEqual(get.calls.length, 1)
}

async function runCloudFunctionTests() {
  let imageCheckResult = { errCode: 0 }
  const cloud = {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    downloadFile: async () => ({ fileContent: Buffer.from('image') }),
    openapi: {
      security: {
        imgSecCheck: async () => imageCheckResult
      }
    }
  }
  const originalLoad = Module._load
  Module._load = function load(request, parent, isMain) {
    if (request === 'wx-server-sdk') return cloud
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const modulePath = require.resolve('../cloudfunctions/checkImage/index.js')
    delete require.cache[modulePath]
    const checkImage = require(modulePath)
    let result = await checkImage.main({
      imgUrl: 'https://untrusted.example/review.jpg',
      contentType: 'image/jpeg'
    })
    assert.strictEqual(result.status, 'error')
    assert.strictEqual(result.errCode, 'UNTRUSTED_CDN_HOST')
    assert.strictEqual(result.transport, 'cdn')

    result = await checkImage.main({ fileID: 'cloud://review.jpg', contentType: 'image/jpeg' })
    assert.strictEqual(result.status, 'passed')
    assert.strictEqual(result.transport, 'file-id')

    imageCheckResult = { errCode: 87014, errMsg: 'rejected' }
    result = await checkImage.main({ fileID: 'cloud://review.jpg', contentType: 'image/jpeg' })
    assert.strictEqual(result.status, 'rejected')
    assert.strictEqual(result.safe, false)
  } finally {
    Module._load = originalLoad
  }
}

async function run() {
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

  await runDownloadTests()
  await runCloudFunctionTests()

  console.log('check-image-security.test.js: all tests passed')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
