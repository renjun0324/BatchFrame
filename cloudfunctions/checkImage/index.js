// 云函数：检查图片内容安全
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

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
      console.error('错误：不支持临时文件路径')
      return {
        success: false,
        errCode: -2,
        errMsg: '暂不支持临时文件路径，请先上传到云存储'
      }
    }

    // 调用内容安全检测API
    console.log('步骤2：调用微信安全检测API...')
    const checkStartTime = Date.now()
    
    const allowedContentTypes = ['image/jpeg', 'image/png', 'image/gif']
    if (!allowedContentTypes.includes(contentType)) {
      return {
        success: false,
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
        message: '图片内容安全'
      }
    } else if (result.errCode === 87014) {
      console.warn('⚠️ 检测到违规内容')
      return {
        success: true,
        safe: false,
        message: '图片包含违规内容'
      }
    } else {
      console.error('❌ 检测失败，错误码:', result.errCode)
      return {
        success: false,
        errCode: result.errCode,
        errMsg: result.errMsg || '检测失败'
      }
    }

  } catch (err) {
    const totalTime = Date.now() - startTime
    console.error(`❌ 图片安全检测异常，耗时 ${totalTime}ms`)
    console.error('错误详情:', err)
    console.error('错误堆栈:', err.stack)
    
    return {
      success: false,
      errCode: err.errCode || -1,
      errMsg: err.errMsg || err.message || '检测异常'
    }
  }
}
