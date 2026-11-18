// 文件用途：给页面待选和确认内容发放仅同一会话可用的签封，后台只登记摘要。
const { createHash, createHmac, timingSafeEqual } = require('node:crypto')

// 签封的原文在页面内存往返；真实云端密钥只保存在服务端配置。
function createChatCredentials(secret) {
  const sign = (body) => createHmac('sha256', secret).update(body).digest('base64url')
  return {
    seal(sessionId, value) {
      const body = Buffer.from(JSON.stringify({ sessionId, ...value })).toString('base64url')
      return `${body}.${sign(body)}`
    },
    open(sessionId, value) {
      if (typeof value !== 'string' || value.length > 12_000 || !/^[\w-]+\.[\w-]{43}$/.test(value)) return null
      const [body, signature] = value.split('.')
      if (!timingSafeEqual(Buffer.from(sign(body)), Buffer.from(signature))) return null
      try {
        const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
        return decoded.sessionId === sessionId ? decoded : null
      } catch {
        return null
      }
    },
  }
}

// 事务只与这张确切卡的签封摘要比较，数据库无需保存待写正文。
function cardKey(credential) {
  return createHash('sha256').update(credential).digest('hex')
}

module.exports = { cardKey, createChatCredentials }
