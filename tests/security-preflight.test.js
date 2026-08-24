const assert = require('assert')
const {
  mergeSecurityResults,
  normalizeHostname,
  summarizeSecurity
} = require('../utils/securityPreflight')

function run() {
  assert.strictEqual(normalizeHostname('Bucket.TCB.QCLOUD.LA.'), 'bucket.tcb.qcloud.la')
  assert.strictEqual(normalizeHostname('https://bucket.tcb.qcloud.la/path'), '')
  assert.strictEqual(
    summarizeSecurity([{ securityStatus: 'passed' }, { securityStatus: 'passed' }]).passed,
    true
  )

  const images = [
    { id: 'a', path: '/a.jpg', securityStatus: 'error', securityErrCode: 'OLD' },
    { id: 'b', path: '/b.jpg', securityStatus: 'passed' }
  ]
  let merged = mergeSecurityResults(images, [
    {
      path: '/a.jpg',
      status: 'passed',
      transport: 'upload-fallback',
      errCode: 'OLD',
      cdnHost: 'not-used.example',
      message: 'old error'
    }
  ], 123)
  assert.strictEqual(merged[0].securityStatus, 'passed')
  assert.strictEqual(merged[0].securityErrCode, '')
  assert.strictEqual(merged[0].securityMessage, '')
  assert.strictEqual(merged[0].securityCheckedAt, 123)

  merged = mergeSecurityResults(merged, [
    {
      path: '/a.jpg',
      status: 'error',
      errCode: 'CDN_DOWNLOAD_TIMEOUT',
      transport: 'upload-fallback',
      cdnHost: 'bucket.tcb.qcloud.la',
      message: '检测失败'
    }
  ], 456)
  assert.strictEqual(merged[0].securityStatus, 'error')
  assert.strictEqual(merged[0].securityErrCode, 'CDN_DOWNLOAD_TIMEOUT')
  assert.strictEqual(merged[0].securityTransport, 'upload-fallback')
  assert.strictEqual(merged[0].securityCdnHost, 'bucket.tcb.qcloud.la')

  let summary = summarizeSecurity(merged)
  assert.strictEqual(summary.passed, false)
  assert.strictEqual(summary.unresolved.length, 1)
  assert.strictEqual(summary.rejected.length, 0)

  merged = mergeSecurityResults(merged, [
    { path: '/a.jpg', status: 'rejected', errCode: 'IMG_SEC_REJECTED', transport: 'cdn' }
  ], 789)
  summary = summarizeSecurity(merged)
  assert.strictEqual(summary.passed, false)
  assert.strictEqual(summary.rejected.length, 1)
  assert.strictEqual(summary.unresolved.length, 1)

  const missing = mergeSecurityResults(merged, [], 999)
  assert.strictEqual(missing[1].securityStatus, 'passed')
  const incomplete = mergeSecurityResults([
    { path: '/missing.jpg', securityStatus: 'checking' }
  ], [], 999)
  assert.strictEqual(summarizeSecurity(incomplete).unresolved.length, 1)

  console.log('security-preflight.test.js: all tests passed')
}

run()
