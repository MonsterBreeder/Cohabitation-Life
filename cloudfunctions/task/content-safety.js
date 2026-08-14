class ContentSafetyError extends Error {
  constructor(code) { super(code); this.code = code }
}

async function checkImage(buffer, openId, api, contentType = 'image/png') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ContentSafetyError('INVALID_MEDIA')
  try {
    const result = await api.security.imgSecCheck({ media: { contentType, value: buffer } })
    if (result && result.errCode === 0) return 'approved'
    if (result && [87014, 87015].includes(result.errCode)) return 'rejected'
    throw new ContentSafetyError('CHECK_UNAVAILABLE')
  } catch (error) {
    if (error && [87014, 87015].includes(error.errCode)) return 'rejected'
    if (error instanceof ContentSafetyError) throw error
    throw new ContentSafetyError('CHECK_UNAVAILABLE')
  }
}
async function checkText(content, openId, scene, api) {
  try {
    const result = await api.security.msgSecCheck({ content, openid: openId, scene, version: 2 })
    if (result?.result?.suggest === 'pass' || result?.errCode === 0) return true
    return false
  } catch { throw new ContentSafetyError('CHECK_UNAVAILABLE') }
}

module.exports = { checkImage, checkText, ContentSafetyError }
