function normalizeHostname(hostname) {
  const value = String(hostname || '').trim().toLowerCase().replace(/\.$/, '')
  if (!value || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/.test(value)) {
    return ''
  }
  return value
}

function mergeSecurityResults(images, results, checkedAt) {
  const resultByPath = new Map(
    (results || []).map(result => [result && result.path, result])
  )
  const timestamp = checkedAt || Date.now()
  return (images || []).map(image => {
    const result = resultByPath.get(image && image.path)
    if (!result) return image
    const status = ['passed', 'rejected', 'error', 'checking'].includes(result.status)
      ? result.status
      : 'error'
    const passed = status === 'passed'
    return {
      ...image,
      securityStatus: status,
      securityErrCode: passed ? '' : (result.errCode || ''),
      securityTransport: result.transport || '',
      securityMessage: passed ? '' : (result.message || result.errMsg || ''),
      securityCdnHost: passed ? '' : normalizeHostname(result.cdnHost),
      securityCheckedAt: timestamp
    }
  })
}

function summarizeSecurity(images) {
  const entries = (images || []).map((item, index) => ({ item, index }))
  const rejected = entries.filter(entry => entry.item.securityStatus === 'rejected')
  const unresolved = entries.filter(entry => entry.item.securityStatus !== 'passed')
  return {
    passed: rejected.length === 0 && unresolved.length === 0,
    rejected,
    unresolved
  }
}

module.exports = {
  normalizeHostname,
  mergeSecurityResults,
  summarizeSecurity
}
