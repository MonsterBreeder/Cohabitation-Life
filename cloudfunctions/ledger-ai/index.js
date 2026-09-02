// “问账本”云函数入口：验证微信身份和家庭归属，控制家庭每日次数，再调用体验模型解析问题。
// 日志只记录动作、状态与耗时，不记录问题、回答、账目、家庭编号或成员编号。
const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const { buildLedgerAnswer, validateGeneratedAnswer, LedgerAiDomainError } = require('./ledger-ai-domain')
const { normaliseLedgerAiEntry } = require('./repository-data')
const { createModelAdapter, describeModelFailure } = require('./model-adapter')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const MAX_DAILY_QUESTIONS = 10
const SESSION_IDLE_MS = 30 * 60 * 1000
const SESSION_MAX_MS = 2 * 60 * 60 * 1000

function opaqueId(...parts) {
  return crypto.createHash('sha256').update(parts.join(':')).digest('hex')
}
function identityFromContext(context) {
  return `user_${crypto.createHash('sha256').update(`${context.APPID}:${context.OPENID}`).digest('hex')}`
}
function isToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{12,100}$/.test(value)
}
function isMissingDocumentError(error) {
  return Boolean(error && (error.errCode === -1 || /not exist|not found/i.test(error.message || '')))
}
function beijingDay(now = new Date()) { return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) }
function isObviousTrend(question) {
  return /(趋势|变化|这几个月|近[三六十]?个?月|为什么.*(变多|变少)|预测)/.test(question)
}
async function getDoc(collection, id) {
  try { const result = await collection.doc(id).get(); return result.data || null } catch (error) {
    if (isMissingDocumentError(error)) return null
    throw error
  }
}
async function getTransactionDoc(collection, id) {
  try { const result = await collection.doc(id).get(); return result.data || null } catch (error) {
    // 只把“记录不存在”当作空值，权限、网络等真实错误必须让事务失败并交给外层处理。
    if (isMissingDocumentError(error)) return null
    throw error
  }
}
async function loadEntries(householdId) {
  const result = []
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await db.collection('ledgerEntries').where({ householdId, deletedAt: null }).orderBy('occurredAt', 'desc').skip(offset).limit(100).get()
    result.push(...page.data)
    if (page.data.length < 100) return result
  }
  throw new Error('LEDGER_RANGE_TOO_LARGE')
}
async function loadEntryContext(household, identityKey) {
  const categoriesResult = await db.collection('ledgerCategories').where({ householdId: household._id }).limit(100).get()
  const categoriesById = Object.fromEntries(categoriesResult.data.map((item) => [item._id, item]))
  const membersByKey = {}
  for (const memberKey of household.memberKeys || []) {
    const profile = await getDoc(db.collection('users'), memberKey)
    membersByKey[memberKey] = { nickname: profile?.nickname || (memberKey === identityKey ? '我' : '家庭成员') }
  }
  return { categoriesById, membersByKey, selfMemberKey: identityKey }
}
function sessionExpired(session, nowMs) {
  return !session || nowMs - Date.parse(session.lastActiveAt) > SESSION_IDLE_MS || nowMs - Date.parse(session.createdAt) > SESSION_MAX_MS
}
async function remainingQuestions(householdId, now = new Date()) {
  const usageId = opaqueId('ledger-ai-usage', householdId, beijingDay(now))
  const record = await getDoc(db.collection('ledgerAiDailyUsage'), usageId)
  return Math.max(0, MAX_DAILY_QUESTIONS - (Number.isInteger(record?.count) ? record.count : 0))
}
function referencedCandidate(question) {
  const match = question.match(/(?:第\s*)?([1-5一二三四五])\s*笔/)
  if (!match) return 0
  return ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 })[match[1]] || Number(match[1]) || 0
}
function sourceMeta(session, sourceRef) {
  const value = session?.sourceMap?.[sourceRef]
  // 兼容测试期间产生的旧短时记录；新记录同时保存匹配原因供分页展示。
  return typeof value === 'string' ? { entryId: value, matchReasons: [] } : value
}
function candidateFromEntry(current, sourceRef, matchReasons = []) {
  return { sourceRef, type: current.type, amountCents: current.amountCents, categoryName: current.categoryName, note: current.note, occurredAt: current.occurredAt, payerName: current.payerName, matchReasons }
}
async function reserveQuestion({ householdId, identityKey, sessionId, requestId, now }) {
  const day = beijingDay(now)
  const usageId = opaqueId('ledger-ai-usage', householdId, day)
  const requestDocId = opaqueId('ledger-ai-request', identityKey, sessionId, requestId)
  return db.runTransaction(async (transaction) => {
    const requests = transaction.collection('ledgerAiSessions')
    const usage = transaction.collection('ledgerAiDailyUsage')
    const previous = await getTransactionDoc(requests, requestDocId)
    if (previous?.state === 'completed') return { cached: previous.response, remaining: previous.remainingQuestions }
    if (previous?.state === 'processing') return { processing: true }
    const usageRecord = await getTransactionDoc(usage, usageId)
    const count = Number.isInteger(usageRecord?.count) ? usageRecord.count : 0
    if (count >= MAX_DAILY_QUESTIONS) return { limited: true, remaining: 0 }
    const nextCount = count + 1
    await usage.doc(usageId).set({ data: { householdId, day, count: nextCount, updatedAt: now.toISOString() } })
    await requests.doc(requestDocId).set({ data: { identityKey, householdId, sessionId, requestId, state: 'processing', createdAt: now.toISOString(), lastActiveAt: now.toISOString(), expiresAt: new Date(now.getTime() + SESSION_MAX_MS).toISOString() } })
    return { requestDocId, usageId, remaining: MAX_DAILY_QUESTIONS - nextCount, sessionDocId: opaqueId('ledger-ai-current-session', identityKey, sessionId), identityKey, householdId, sessionId }
  })
}
async function finishRequest(reservation, response, sourceMap, now) {
  await db.collection('ledgerAiSessions').doc(reservation.requestDocId).update({ data: { state: 'completed', response, remainingQuestions: reservation.remaining, lastActiveAt: now.toISOString() } })
  const previous = await getDoc(db.collection('ledgerAiSessions'), reservation.sessionDocId)
  const createdAt = previous?.createdAt || now.toISOString()
  await db.collection('ledgerAiSessions').doc(reservation.sessionDocId).set({ data: { kind: 'session', identityKey: reservation.identityKey, householdId: reservation.householdId, sessionId: reservation.sessionId, sourceMap, createdAt, lastActiveAt: now.toISOString(), expiresAt: new Date(Date.parse(createdAt) + SESSION_MAX_MS).toISOString() } })
}
async function releaseQuestion(reservation, now) {
  await db.runTransaction(async (transaction) => {
    const usage = transaction.collection('ledgerAiDailyUsage')
    const record = await getTransactionDoc(usage, reservation.usageId)
    await usage.doc(reservation.usageId).update({ data: { count: Math.max(0, (record?.count || 1) - 1), updatedAt: now.toISOString() } })
    await transaction.collection('ledgerAiSessions').doc(reservation.requestDocId).update({ data: { state: 'failed', lastActiveAt: now.toISOString() } })
  })
}
function mapFailure(error) {
  const message = error instanceof Error ? error.message : String(error)
  if (/quota|token|balance|insufficient/i.test(message)) return { status: 'PLATFORM_QUOTA_EXHAUSTED', retryable: false, errorMessage: '体验额度暂不可用，原账本功能不受影响。' }
  if (error instanceof LedgerAiDomainError) return { status: 'INVALID_REQUEST', retryable: false, errorMessage: '这句话暂时无法安全理解，请换一种更具体的说法。' }
  return { status: 'MODEL_UNAVAILABLE', retryable: true, errorMessage: '问账本暂时没有回答，请稍后重试。' }
}

exports.main = async (event) => {
  const startedAt = Date.now()
  const action = event?.action
  let loggedStatus = 'TEMPORARY_FAILURE'
  try {
    const identityKey = identityFromContext(cloud.getWXContext())
    const householdId = typeof event?.householdId === 'string' ? event.householdId : ''
    if (!householdId) return { status: 'INVALID_REQUEST', retryable: false, errorMessage: '缺少家庭信息。' }
    const household = await getDoc(db.collection('households'), householdId)
    if (!household || !Array.isArray(household.memberKeys) || !household.memberKeys.includes(identityKey)) return { status: 'FORBIDDEN', retryable: false, errorMessage: '你已经没有这个家庭的访问权限。' }
    const enabled = process.env.LEDGER_AI_ENABLED === 'true'
    if (action === 'status') {
      const remaining = enabled ? await remainingQuestions(householdId) : 0
      loggedStatus = enabled ? (remaining > 0 ? 'READY' : 'DAILY_LIMIT_REACHED') : 'DISABLED'
      return { status: loggedStatus, retryable: false, remainingQuestions: remaining }
    }
    if (!enabled) return { status: 'DISABLED', retryable: false, remainingQuestions: 0 }
    if (action === 'source') {
      if (!isToken(event.sessionId) || typeof event.sourceRef !== 'string' || !/^S(?:[1-9]\d{0,2}|1000)$/.test(event.sourceRef)) return { status: 'INVALID_REQUEST', retryable: false, errorMessage: '候选编号不正确。' }
      const sessionDocId = opaqueId('ledger-ai-current-session', identityKey, event.sessionId)
      const session = await getDoc(db.collection('ledgerAiSessions'), sessionDocId)
      if (sessionExpired(session, Date.now()) || session.identityKey !== identityKey || session.householdId !== householdId) return { status: 'EXPIRED', retryable: false, errorMessage: '本次结果已经过期，请重新查找。' }
      const entryId = sourceMeta(session, event.sourceRef)?.entryId
      const record = entryId ? await getDoc(db.collection('ledgerEntries'), entryId) : null
      if (!record || record.deletedAt != null || record.householdId !== householdId) return { status: 'CANDIDATE_CHANGED', retryable: false, errorMessage: '这笔账已经发生变化，请重新查找。' }
      await db.collection('ledgerAiSessions').doc(sessionDocId).update({ data: { lastActiveAt: new Date().toISOString() } })
      loggedStatus = 'SOURCE_RESOLVED'
      return { status: 'SOURCE_RESOLVED', retryable: false, entryId }
    }
    if (action === 'sources') {
      const offset = event?.offset
      if (!isToken(event.sessionId) || !Number.isInteger(offset) || offset < 5 || offset > 995 || offset % 5 !== 0) return { status: 'INVALID_REQUEST', retryable: false, errorMessage: '分页位置不正确。' }
      const sessionDocId = opaqueId('ledger-ai-current-session', identityKey, event.sessionId)
      const session = await getDoc(db.collection('ledgerAiSessions'), sessionDocId)
      const now = new Date()
      if (sessionExpired(session, now.getTime()) || session.identityKey !== identityKey || session.householdId !== householdId) return { status: 'EXPIRED', retryable: false, errorMessage: '本次结果已经过期，请重新查找。' }
      const context = await loadEntryContext(household, identityKey)
      const candidates = []
      let scanned = 0
      for (let index = offset + 1; index <= offset + 5; index += 1) {
        const sourceRef = `S${index}`
        const meta = sourceMeta(session, sourceRef)
        if (!meta) break
        scanned += 1
        const record = await getDoc(db.collection('ledgerEntries'), meta.entryId)
        if (!record || record.deletedAt != null || record.householdId !== householdId) continue
        const current = normaliseLedgerAiEntry(record, context)
        if (current) candidates.push(candidateFromEntry(current, sourceRef, meta.matchReasons))
      }
      const nextOffset = offset + scanned
      const hasMore = Boolean(sourceMeta(session, `S${nextOffset + 1}`))
      await db.collection('ledgerAiSessions').doc(sessionDocId).update({ data: { lastActiveAt: now.toISOString() } })
      loggedStatus = 'SOURCES_RESOLVED'
      return { status: 'SOURCES_RESOLVED', retryable: false, candidates, nextOffset, hasMore }
    }
    if (action !== 'ask' || !isToken(event.sessionId) || !isToken(event.requestId) || typeof event.question !== 'string') return { status: 'INVALID_REQUEST', retryable: false, errorMessage: '问题格式不正确。' }
    const question = event.question.trim()
    if (!question || [...question].length > 200) return { status: 'INVALID_REQUEST', retryable: false, errorMessage: '问题需要控制在 1 到 200 个字以内。' }
    if (isObviousTrend(question)) return { status: 'ANSWERED', retryable: false, remainingQuestions: await remainingQuestions(householdId), answer: { kind: 'stats_redirect', message: '多月份变化请到“账本统计”中查看。' } }

    const now = new Date()
    const reservation = await reserveQuestion({ householdId, identityKey, sessionId: event.sessionId, requestId: event.requestId, now })
    if (reservation.cached) return reservation.cached
    if (reservation.processing) return { status: 'TEMPORARY_FAILURE', retryable: true, errorMessage: '这次提问仍在处理中，请稍后重试。' }
    if (reservation.limited) return { status: 'DAILY_LIMIT_REACHED', retryable: false, remainingQuestions: 0 }
    try {
      const candidateIndex = referencedCandidate(question)
      if (candidateIndex > 0) {
        const session = await getDoc(db.collection('ledgerAiSessions'), reservation.sessionDocId)
        if (sessionExpired(session, now.getTime())) {
          await releaseQuestion(reservation, now)
          return { status: 'EXPIRED', retryable: false, errorMessage: '本次结果已经过期，请重新查找。', remainingQuestions: reservation.remaining + 1 }
        }
        const entryId = sourceMeta(session, `S${candidateIndex}`)?.entryId
        const record = entryId ? await getDoc(db.collection('ledgerEntries'), entryId) : null
        if (!record || record.deletedAt != null || record.householdId !== householdId) {
          await releaseQuestion(reservation, now)
          return { status: 'CANDIDATE_CHANGED', retryable: false, errorMessage: '这笔账已经发生变化，请重新查找。', remainingQuestions: reservation.remaining + 1 }
        }
        const context = await loadEntryContext(household, identityKey)
        const current = normaliseLedgerAiEntry(record, context)
        const candidate = candidateFromEntry(current, 'S1')
        const answer = { kind: 'candidates', message: `第 ${candidateIndex} 笔是 ${current.occurredAt.slice(0, 10)} 的${current.categoryName}账目，金额 ¥${(current.amountCents / 100).toFixed(2)}。`, candidates: [candidate], totalMatches: 1, hasMore: false }
        const response = { status: 'ANSWERED', retryable: false, remainingQuestions: reservation.remaining, answer }
        await finishRequest(reservation, response, { S1: { entryId, matchReasons: [] } }, now)
        return response
      }
      const model = createModelAdapter()
      const plan = await model.planQuestion(question, beijingDay(now))
      if (plan.kind === 'trend') {
        await releaseQuestion(reservation, now)
        return { status: 'ANSWERED', retryable: false, remainingQuestions: reservation.remaining + 1, answer: { kind: 'stats_redirect', message: '多月份变化请到“账本统计”中查看。' } }
      }
      const [records, context] = await Promise.all([loadEntries(householdId), loadEntryContext(household, identityKey)])
      const safeEntries = records.map((record) => normaliseLedgerAiEntry(record, context)).filter(Boolean)
      const builtAnswer = buildLedgerAnswer(plan, safeEntries)
      const { sourceMap = {}, ...answer } = builtAnswer
      // 检索完成后只把页面可展示的有限事实交给模型组织一句话，并再次校验金额、日期和来源。
      if (['candidates', 'amount', 'comparison'].includes(answer.kind)) {
        const generated = await model.composeAnswer(answer)
        answer.message = validateGeneratedAnswer(generated, answer)
      }
      const response = { status: 'ANSWERED', retryable: false, remainingQuestions: reservation.remaining, answer }
      await finishRequest(reservation, response, sourceMap, now)
      loggedStatus = 'ANSWERED'
      return response
    } catch (error) {
      await releaseQuestion(reservation, now)
      // 记录可排查的平台错误类型，但主动移除问题正文和云端编号，避免日志泄露账本线索。
      console.warn('ledger-ai model failed', { action, ...describeModelFailure(error, question), durationMs: Date.now() - startedAt })
      const failure = mapFailure(error)
      loggedStatus = failure.status
      return failure
    }
  } catch (error) {
    console.error('ledger-ai failed', { action, status: loggedStatus, durationMs: Date.now() - startedAt, code: error instanceof Error ? error.name : 'UNKNOWN' })
    return { status: 'TEMPORARY_FAILURE', retryable: true, errorMessage: '问账本暂时不可用，请稍后重试。' }
  } finally {
    console.log('ledger-ai result', { action, status: loggedStatus, durationMs: Date.now() - startedAt })
  }
}
