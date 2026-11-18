// 文件用途：登记短期聊天、请求防重和家庭计数，只保存控制事实与业务引用。
const { createHash } = require('node:crypto')

const SESSION_MS = 15 * 60_000
const REQUEST_MS = 55_000
const QUESTION_LIMIT = 10

// 分开命名空间，并保持与旧问账相同的当日次数键。
function key(...parts) {
  return createHash('sha256').update(parts.join(':')).digest('hex')
}

// 统一使用北京时间自然日，结算时沿用实际接受请求的日期。
function beijingDay(now) {
  return new Date(now + 8 * 60 * 60_000).toISOString().slice(0, 10)
}

// 只有确切不存在的记录可当作空，其他错误进入外层失败处理。
async function readDocument(collection, id) {
  try {
    return (await collection.doc(id).get()).data || null
  } catch (error) {
    if (/document.*(?:not exist|not found)|文档不存在/i.test(error?.message || error?.errMsg || '')) return null
    if (error?.errCode === 'DATABASE_DOCUMENT_NOT_EXIST') return null
    throw error
  }
}

// 所有状态都绑定真实家庭和使用者，页面不能跨范围取回。
function current(session, owner, now) {
  return Boolean(session && session.owner === owner && !session.closed && Date.parse(session.expiresAt) > now)
}

// 明确的业务拒绝用于停止事务。其他异常保留未知状态，要求按原编号查回。
class ChatWriteError extends Error {
  constructor(kind) {
    super(kind)
    this.kind = kind
  }
}

// 使用原问账的后端集合及其过期清理规则；事务中没有模型调用。
function createChatStore(db, { householdId, identityKey, maxRequests, preview = false, now = Date.now }) {
  const owner = key('life-chat-owner-v1', householdId, identityKey)
  // 手机验收使用独立的每日登记，其总额度仍在发送模型前另外核对。
  const dailyScope = preview ? 'life-chat-preview-sent-v1' : 'life-chat-sent-v1'
  const sessionKey = (sessionId) => key('life-chat-session-v1', owner, sessionId)
  const sessions = (database = db) => database.collection('ledgerAiSessions')
  const usage = (database = db) => database.collection('ledgerAiDailyUsage')
  const requestKey = (sessionId, requestId) => key('life-chat-request-v1', owner, sessionId, requestId)
  const operationKey = (operationId) => key('life-chat-operation-v1', owner, operationId)
  const canAccess = async (database) => {
    const household = await readDocument(database.collection('households'), householdId)
    return Array.isArray(household?.memberKeys) && household.memberKeys.includes(identityKey)
  }
  const registerOperation = (database, operationId, expiresAt) => operationId
    ? sessions(database).doc(operationKey(operationId)).set({ data: { owner, expiresAt, result: null } })
    : undefined
  return {
    // 在用户同意后建立这次独立页面的固定期限。
    async open(sessionId, scope) {
      const started = now()
      const state = { owner, scope, day: beijingDay(started), expiresAt: new Date(started + SESSION_MS).toISOString(), revision: 0, active: null, references: [] }
      await sessions().doc(sessionKey(sessionId)).set({ data: state })
      return state
    },

    // 查询只接受当前本人当前页面的确切编号。
    async session(sessionId) {
      const state = await readDocument(sessions(), sessionKey(sessionId))
      return current(state, owner, now()) ? state : null
    },

    // 在网络前将发送和防重事实作为同一次事务登记。
    async begin(sessionId, requestId) {
      return db.runTransaction(async (tx) => {
        if (!await canAccess(tx)) return { kind: 'forbidden' }
        const sessionIdInDb = sessionKey(sessionId)
        const state = await readDocument(sessions(tx), sessionIdInDb)
        const at = now()
        if (!current(state, owner, at)) return { kind: 'expired' }
        const receiptId = requestKey(sessionId, requestId)
        const previous = await readDocument(sessions(tx), receiptId)
        if (previous) {
          const stillRunning = state.inFlight?.requestId === requestId && state.inFlight.until > at
          const requestState = previous.state === 'running' && !stillRunning ? 'interrupted' : previous.state
          return { kind: 'duplicate', state: requestState }
        }
        if (state.inFlight?.until > at) return { kind: 'busy' }
        const day = beijingDay(at)
        const dayId = key(dailyScope, householdId, day)
        const counter = await readDocument(usage(tx), dayId)
        const count = counter?.count ?? 0
        if (!Number.isSafeInteger(count) || count < 0 || count >= maxRequests) return { kind: 'daily_limit' }
        const until = Math.min(at + REQUEST_MS, Date.parse(state.expiresAt))
        // 整体替换在途状态。云数据库会把普通对象展开为子字段，不能向已清空的 null 写入子字段。
        await sessions(tx).doc(sessionIdInDb).update({ data: { inFlight: db.command.set({ requestId, until }), active: null } })
        await usage(tx).doc(dayId).set({ data: { householdId, day, count: count + 1, updatedAt: new Date(at).toISOString() } })
        await sessions(tx).doc(receiptId).set({ data: { owner, state: 'running', expiresAt: state.expiresAt } })
        return { kind: 'accepted', state, day, until }
      })
    },

    // 成功交付才结算问账产品次数。实际模型用量已在发送前登记。
    async finish(sessionId, requestId, day, update, countQuestion) {
      return db.runTransaction(async (tx) => {
        if (!await canAccess(tx)) return { kind: 'forbidden' }
        const id = sessionKey(sessionId)
        const state = await readDocument(sessions(tx), id)
        const at = now()
        if (!current(state, owner, at) || state.inFlight?.requestId !== requestId || state.inFlight.until <= at) {
          return { kind: 'expired' }
        }
        if (countQuestion) {
          const dayId = key('ledger-ai-usage', householdId, day)
          const counter = await readDocument(usage(tx), dayId)
          const count = counter?.count ?? 0
          if (!Number.isSafeInteger(count) || count < 0 || count >= QUESTION_LIMIT) {
            await sessions(tx).doc(id).update({ data: { inFlight: null } })
            await sessions(tx).doc(requestKey(sessionId, requestId)).update({ data: { state: 'limited' } })
            return { kind: 'question_limit' }
          }
          await usage(tx).doc(dayId).set({ data: { householdId, day, count: count + 1, updatedAt: new Date(at).toISOString() } })
        }
        const { operationId, ...changes } = update
        await registerOperation(tx, operationId, state.expiresAt)
        await sessions(tx).doc(id).update({ data: { ...changes, inFlight: null, revision: state.revision + 1 } })
        await sessions(tx).doc(requestKey(sessionId, requestId)).update({ data: { state: 'finished' } })
        return { kind: 'finished' }
      })
    },

    // 修改当前待确认卡必须用上一张卡的确切摘要，小程序不能自行覆盖。
    async advance(sessionId, previous, update, countQuestion = false, remainingActions) {
      return db.runTransaction(async (tx) => {
        if (!await canAccess(tx)) return false
        const id = sessionKey(sessionId)
        const state = await readDocument(sessions(tx), id)
        if (!current(state, owner, now()) || state.active !== previous || state.inFlight) return false
        if (remainingActions && state.remainingActions !== remainingActions) return false
        if (countQuestion) {
          const at = now()
          const day = beijingDay(at)
          const dayId = key('ledger-ai-usage', householdId, day)
          const counter = await readDocument(usage(tx), dayId)
          const count = counter?.count ?? 0
          if (!Number.isSafeInteger(count) || count < 0 || count >= QUESTION_LIMIT) return 'question_limit'
          await usage(tx).doc(dayId).set({ data: { householdId, day, count: count + 1, updatedAt: new Date(at).toISOString() } })
        }
        const { operationId, ...changes } = update
        await registerOperation(tx, operationId, state.expiresAt)
        await sessions(tx).doc(id).update({ data: { ...changes, revision: state.revision + 1 } })
        return true
      })
    },

    // 查回只返回本人这个操作的最少回执，无需恢复聊天草稿。
    async recover(operationId) {
      const receipt = await readDocument(sessions(), operationKey(operationId))
      return receipt?.owner === owner && Date.parse(receipt.expiresAt) > now() ? receipt.result : null
    },

    // 未知保存只能由本人停止。写入事务也读取这个键，迟到的原请求不能再落库。
    async stopOperation(operationId) {
      return db.runTransaction(async (tx) => {
        const id = operationKey(operationId)
        const previous = await readDocument(sessions(tx), id)
        if (!previous || previous.owner !== owner) return { kind: 'unknown' }
        if (previous.result) return previous.result
        const result = { kind: 'not_saved' }
        await sessions(tx).doc(id).set({ data: {
          owner, result, expiresAt: new Date(now() + SESSION_MS).toISOString(),
        } })
        return result
      })
    },

    // 原业务在同一数据库事务中读取、修改，聊天资格和回执与业务共同提交。
    forConfirmation(sessionId, active, operationId, verifyRecord, resultOf) {
      return {
        command: db.command,
        collection: (name) => db.collection(name),
        runTransaction: (apply) => db.runTransaction(async (tx) => {
          const id = sessionKey(sessionId)
          const receiptId = operationKey(operationId)
          if (!await canAccess(tx)) throw new ChatWriteError('forbidden')
          const receipt = await readDocument(sessions(tx), receiptId)
          if (!receipt || receipt.owner !== owner) throw new ChatWriteError('expired')
          if (receipt.result) throw new ChatWriteError('already_saved')
          const state = await readDocument(sessions(tx), id)
          if (!current(state, owner, now()) || state.active !== active || state.inFlight) throw new ChatWriteError('expired')
          await verifyRecord(tx)
          const value = await apply(tx)
          const result = resultOf(value)
          if (!result) throw new ChatWriteError('record_changed')
          await sessions(tx).doc(receiptId).set({ data: {
            owner, result, expiresAt: new Date(now() + 30 * 24 * 60 * 60_000).toISOString(),
          } })
          const recentWrite = result.action === 'delete' ? null : { ref: 'W1', id: result.id, domain: result.domain }
          // 删除后最近记录为 null；保存下一条时也须整体替换，不能逐个合并字段。
          await sessions(tx).doc(id).update({ data: { active: null, revision: state.revision + 1, recentWrite: db.command.set(recentWrite) } })
          return value
        }),
      }
    },

    // 放弃当前会话并撤回在途响应；短期清理器按原到期时间处理记录。
    async close(sessionId) {
      return db.runTransaction(async (tx) => {
        const id = sessionKey(sessionId)
        const state = await readDocument(sessions(tx), id)
        if (current(state, owner, now())) {
          await sessions(tx).doc(id).update({ data: { closed: true, active: null, remainingActions: null, inFlight: null, references: [] } })
        }
      })
    },

    // 停止等待时只撤回当前请求，已登记的实际发送仍计数。
    async cancelRequest(sessionId, requestId) {
      return db.runTransaction(async (tx) => {
        const id = sessionKey(sessionId)
        const state = await readDocument(sessions(tx), id)
        if (!current(state, owner, now()) || state.inFlight?.requestId !== requestId) return false
        await sessions(tx).doc(id).update({ data: { inFlight: null } })
        await sessions(tx).doc(requestKey(sessionId, requestId)).update({ data: { state: 'cancelled' } })
        return true
      })
    },
  }
}

module.exports = { beijingDay, ChatWriteError, createChatStore, readDocument }
