const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { resolveLoginEntry } = require('./entry-state')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

/** 把可信微信身份转换为数据库使用的稳定编号，不保存原始身份。 */
function createIdentityKey(appId, openId) {
  return `user_${crypto.createHash('sha256').update(`${appId}:${openId}`).digest('hex')}`
}

/** 封装登录判断所需的最小数据库操作。 */
function createRepository() {
  return {
    async findUserByIdentityKey(identityKey) {
      const result = await db.collection('users').where({ _id: identityKey }).limit(1).get()
      return result.data[0] || null
    },
    async ensureUser(identityKey) {
      // 固定文档编号保证同一微信身份只会对应一条记录；首次写入无需先读取不存在的文档。
      await db.collection('users').doc(identityKey).set({
        data: {
          createdAt: db.serverDate(),
        },
      })
    },
    async findHouseholdByMemberKey(identityKey) {
      // 家庭成员名单是判断归属的唯一权威数据。
      const command = db.command
      const result = await db.collection('households').where({
        memberKeys: command.all([identityKey]),
      }).limit(1).get()
      return result.data[0] || null
    },
    async findInvitationByTokenHash(tokenHash) {
      const result = await db.collection('invitations').where({ tokenHash }).limit(1).get()
      return result.data[0] || null
    },
    async findHouseholdById(householdId) {
      if (typeof householdId !== 'string' || householdId.length === 0) return null
      const result = await db.collection('households').where({ _id: householdId }).limit(1).get()
      return result.data[0] || null
    },
  }
}

/** 日志只记录有限状态和内部关联编号，不记录身份、邀请或完整错误。 */
function safeLog({ intent, status, startedAt }) {
  console.info(JSON.stringify({
    event: 'resolve_login',
    intent: intent === 'login' || intent === 'resume' ? intent : 'invalid',
    status,
    durationMs: Date.now() - startedAt,
    correlationId: crypto.randomBytes(8).toString('hex'),
  }))
}

exports.main = async (event) => {
  const startedAt = Date.now()
  const intent = event && event.intent
  const inviteToken = event && event.inviteToken
  // OPENID 和 APPID 只从微信可信调用上下文取得。
  const { OPENID: openId, APPID: appId } = cloud.getWXContext()

  try {
    const result = await resolveLoginEntry(
      { intent, inviteToken },
      { identityKey: createIdentityKey(appId, openId), repository: createRepository() },
    )
    safeLog({ intent, status: result.status, startedAt })
    return result
  } catch (error) {
    safeLog({ intent, status: 'TEMPORARY_FAILURE', startedAt })
    return { status: 'TEMPORARY_FAILURE', retryable: true }
  }
}
