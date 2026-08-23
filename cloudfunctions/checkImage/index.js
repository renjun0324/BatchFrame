// 云函数：检查图片内容安全
const cloud = require('wx-server-sdk')
const http = require('http')
const https = require('https')
const net = require('net')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_CDN_HOST = /(^|\.)((tcb\.qcloud\.la)|(tcloudbaseapp\.com)|(tcloudbasegateway\.com)|(qcloud\.com)|(myqcloud\.com))$/i

function downloadImageUrl(rawUrl, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    let parsed
    try {
      parsed = new URL(rawUrl)
    } catch (err) {
      reject(new Error('图片地址无效'))
      return
    }

    const host = parsed.hostname.toLowerCase()
    if (!['http:', 'https:'].includes(parsed.protocol) || net.isIP(host) || !ALLOWED_CDN_HOST.test(host)) {
      reject(new Error('图片地址不是受信任的临时 CDN 地址'))
      return
    }
    if (redirectCount > 2) {
      reject(new Error('图片地址重定向次数过多'))
      return
    }

    const transport = parsed.protocol === 'https:' ? https : http
    const request = transport.get(parsed, { headers: { Accept: 'image/*' } }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        downloadImageUrl(new URL(response.headers.location, parsed).toString(), redirectCount + 1)
          .then(resolve)
          .catch(reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`临时 CDN 返回 HTTP ${response.statusCode}`))
        return
      }

      const declaredLength = Number(response.headers['content-length'] || 0)
      if (declaredLength > MAX_IMAGE_BYTES) {
        response.resume()
        reject(new Error('图片超过 10MB 限制'))
        return
      }

      const chunks = []
      let total = 0
      response.on('data', chunk => {
        total += chunk.length
        if (total > MAX_IMAGE_BYTES) {
          request.destroy()
          reject(new Error('图片超过 10MB 限制'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    })
    request.setTimeout(8000, () => request.destroy(new Error('下载图片超时')))
    request.on('error', reject)
  })
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const startTime = Date.now()
  
  try {
    console.log('=== 开始图片安全检测 ===')
    console.log('请求参数:', JSON.stringify(event))
    
    // 获取图片文件路径或Buffer
    const { fileID, imgUrl, contentType } = event
    
    if (!fileID && !imgUrl) {
      console.error('错误：缺少图片参数')
      return {
        success: false,
        status: 'error',
        errCode: -1,
        errMsg: '缺少图片参数'
      }
    }

    let imgBuffer

    // 如果传入的是云存储fileID，先下载图片
    if (fileID) {
      console.log('步骤1：下载图片...', fileID)
      const downloadStartTime = Date.now()
      
      const res = await cloud.downloadFile({
        fileID: fileID,
      })
      
      imgBuffer = res.fileContent
      const downloadTime = Date.now() - downloadStartTime
      console.log(`步骤1完成：图片下载成功，耗时 ${downloadTime}ms，大小 ${imgBuffer.length} bytes`)
    } else if (imgUrl) {
      console.log('步骤1：从临时 CDN 下载图片...')
      imgBuffer = await downloadImageUrl(imgUrl)
      console.log(`步骤1完成：图片下载成功，大小 ${imgBuffer.length} bytes`)
    }

    // 调用内容安全检测API
    console.log('步骤2：调用微信安全检测API...')
    const checkStartTime = Date.now()
    
    const allowedContentTypes = ['image/jpeg', 'image/png', 'image/gif']
    if (!allowedContentTypes.includes(contentType)) {
      return {
        success: false,
        status: 'error',
        errCode: -3,
        errMsg: '不支持的图片格式'
      }
    }

    const result = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType,
        value: imgBuffer
      }
    })
    
    const checkTime = Date.now() - checkStartTime
    console.log(`步骤2完成：检测完成，耗时 ${checkTime}ms`)
    console.log('检测结果详情:', JSON.stringify(result))

    const totalTime = Date.now() - startTime
    console.log(`=== 总耗时 ${totalTime}ms ===`)

    // 检测结果判断
    // errCode = 0 表示检测通过
    // errCode = 87014 表示检测到违规内容
    if (result.errCode === 0) {
      console.log('✅ 图片安全')
      return {
        success: true,
        safe: true,
        status: 'passed',
        message: '图片内容安全'
      }
    } else if (result.errCode === 87014) {
      console.warn('⚠️ 检测到违规内容')
      return {
        success: true,
        safe: false,
        status: 'rejected',
        message: '图片包含违规内容'
      }
    } else {
      console.error('❌ 检测失败，错误码:', result.errCode)
      return {
        success: false,
        status: 'error',
        errCode: result.errCode,
        errMsg: result.errMsg || '检测失败'
      }
    }

  } catch (err) {
    const totalTime = Date.now() - startTime
    console.error(`❌ 图片安全检测异常，耗时 ${totalTime}ms`)
    console.error('错误详情:', err)
    console.error('错误堆栈:', err.stack)

    // SDK 版本不同可能将明确违规作为异常抛出，仍需保留 rejected 语义。
    if (Number(err && err.errCode) === 87014) {
      return {
        success: true,
        safe: false,
        status: 'rejected',
        message: '图片包含违规内容'
      }
    }
    
    return {
      success: false,
      status: 'error',
      errCode: err.errCode || -1,
      errMsg: err.errMsg || err.message || '检测异常'
    }
  }
}
