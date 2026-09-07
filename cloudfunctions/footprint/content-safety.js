// 微信内容安全适配：检查服务不可用时宁可让用户重试，也不绕过检查保存公开内容。
class ContentSafetyError extends Error { constructor(code) { super(code); this.code = code } }

async function checkImage(buffer, _openId, api, contentType = 'image/jpeg') {
  try {
    const result = await api.security.imgSecCheck({ media: { contentType, value: buffer } })
    if (result?.errCode === 0) return 'approved'
    if ([87014, 87015].includes(result?.errCode)) return 'rejected'
    throw new ContentSafetyError('CHECK_UNAVAILABLE')
  } catch (error) {
    if ([87014, 87015].includes(error?.errCode)) return 'rejected'
    if (error instanceof ContentSafetyError) throw error
    throw new ContentSafetyError('CHECK_UNAVAILABLE')
  }
}

async function checkText(content, openId, scene, api) {
  try {
    const result = await api.security.msgSecCheck({ content, openid: openId, scene, version: 2 })
    return result?.result?.suggest === 'pass' || result?.errCode === 0
  } catch { throw new ContentSafetyError('CHECK_UNAVAILABLE') }
}

module.exports = { checkImage, checkText, ContentSafetyError }
