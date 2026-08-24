const assert = require('assert')

function makeWx(callFunction) {
  const uploads = []
  const deleted = []
  const calls = []
  global.wx = {
    getImageInfo({ success }) {
      success({ width: 2400, height: 1600, type: 'jpg' })
    },
    compressImage({ success }) {
      success({ tempFilePath: '/tmp/review.jpg' })
    },
    cloud: {
      CDN() {
        return 'https://runtime-host.example/review.jpg?signature=redacted'
      },
      callFunction(options) {
        calls.push(options.data)
        return Promise.resolve({ result: callFunction(options.data) })
      },
      uploadFile(options) {
        uploads.push(options)
        return Promise.resolve({ fileID: 'cloud://temp-check/review.jpg' })
      },
      deleteFile(options) {
        deleted.push(options)
        return Promise.resolve()
      }
    }
  }
  return { uploads, deleted, calls }
}

function loadSecurity() {
  const modulePath = require.resolve('../utils/contentSecurity.js')
  delete require.cache[modulePath]
  return require(modulePath)
}

async function run() {
  let state = makeWx(data => {
    assert.ok(data.imgUrl)
    return { success: true, safe: true, status: 'passed', transport: 'cdn' }
  })
  let security = loadSecurity()
  let result = await security.checkSingleImage('/tmp/photo.jpg')
  assert.strictEqual(result.status, 'passed')
  assert.strictEqual(result.transport, 'cdn')
  assert.strictEqual(state.uploads.length, 0)
  assert.strictEqual(state.deleted.length, 0)

  state = makeWx(data => ({
    success: true,
    safe: false,
    status: 'rejected',
    transport: data.imgUrl ? 'cdn' : 'file-id'
  }))
  security = loadSecurity()
  result = await security.checkSingleImage('/tmp/photo.jpg')
  assert.strictEqual(result.status, 'rejected')
  assert.strictEqual(state.uploads.length, 0)

  state = makeWx(data => data.imgUrl
    ? {
      success: false,
      safe: false,
      status: 'error',
      errCode: 'UNTRUSTED_CDN_HOST',
      errMsg: '临时 CDN 域名未被允许',
      transport: 'cdn',
      cdnHost: 'runtime-host.example'
    }
    : { success: true, safe: true, status: 'passed', transport: 'file-id' })
  security = loadSecurity()
  result = await security.checkSingleImage('/tmp/photo.jpg')
  assert.strictEqual(result.status, 'passed')
  assert.strictEqual(result.transport, 'upload-fallback')
  assert.strictEqual(state.uploads.length, 1)
  assert.strictEqual(state.calls.length, 2)
  assert.strictEqual(state.deleted.length, 1)
  assert.ok(state.calls[0].imgUrl)
  assert.ok(state.calls[1].fileID)

  state = makeWx(data => ({
    success: false,
    safe: false,
    status: 'error',
    errCode: 'IMG_SEC_CHECK_ERROR',
    errMsg: '接口权限不足',
    transport: data.imgUrl ? 'cdn' : 'file-id'
  }))
  security = loadSecurity()
  result = await security.checkSingleImage('/tmp/photo.jpg')
  assert.strictEqual(result.status, 'error')
  assert.strictEqual(result.errCode, 'IMG_SEC_CHECK_ERROR')
  assert.strictEqual(state.uploads.length, 0)

  state = makeWx(data => data.imgUrl
    ? { success: false, safe: false, status: 'error', errCode: 'CDN_DOWNLOAD_TIMEOUT', transport: 'cdn' }
    : { success: false, safe: false, status: 'error', errCode: 'FILE_ID_ERROR', transport: 'file-id' })
  security = loadSecurity()
  result = await security.checkSingleImage('/tmp/photo.jpg')
  assert.strictEqual(result.status, 'error')
  assert.strictEqual(result.errCode, 'FILE_ID_ERROR')
  assert.strictEqual(result.transport, 'upload-fallback')
  assert.strictEqual(state.uploads.length, 1)
  assert.strictEqual(state.deleted.length, 1)

  state = makeWx(data => data.imgUrl
    ? {
      success: false,
      safe: false,
      status: 'error',
      errCode: -1,
      errMsg: '图片地址不是受信任的临时 CDN 地址',
      transport: 'cdn'
    }
    : { success: true, safe: true, status: 'passed', transport: 'file-id' })
  security = loadSecurity()
  result = await security.checkSingleImage('/tmp/photo.jpg')
  assert.strictEqual(result.status, 'passed')
  assert.strictEqual(result.transport, 'upload-fallback')
  assert.strictEqual(state.uploads.length, 1)

  state = makeWx(data => ({
    success: false,
    safe: false,
    status: 'error',
    errCode: -1,
    errMsg: '其他服务错误',
    transport: data.imgUrl ? 'cdn' : 'file-id'
  }))
  security = loadSecurity()
  result = await security.checkSingleImage('/tmp/photo.jpg')
  assert.strictEqual(result.status, 'error')
  assert.strictEqual(result.errCode, -1)
  assert.strictEqual(state.uploads.length, 0)

  console.log('content-security.test.js: all tests passed')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
