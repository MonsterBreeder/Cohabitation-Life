// 文件用途：限制聊天操作，串起睦录身份范围、模型理解和真实账目读取。
const { randomUUID } = require('node:crypto')
const { LedgerAiDomainError } = require('../ledger-ai/ledger-ai-domain')
const { buildLifeChatLedgerAnswer } = require('./ledger-query')
const { cardKey } = require('./credentials')
const { beijingDay, ChatWriteError } = require('./chat-store')

const SCOPES = new Set(['all', 'ledger', 'task', 'footprint'])
const TOKEN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const REFERENCE = /^R[1-9]\d{0,3}$/
const ACTION_LABELS = {
  ledger_query: '查账', ledger_create: '记账', ledger_update: '修改账目',
  task_create: '记事项', task_update: '修改事项', task_delete: '删除事项',
  footprint_create: '记足迹', footprint_update: '修改足迹', footprint_delete: '删除足迹',
}

// 页面只接收展示字段。原账编号仅在单独打开并重新核对记录时返还。
function publicCandidate({ entryId, fingerprint, ...candidate }) {
  return candidate
}

// 给模型的清单只含临时编号、业务类和短展示名，由后台现查资料组装。
async function modelReferences(state, ledger, mutations) {
  const allowed = []
  if (state.recentWrite) {
    const label = await mutations.recentLabel(state.recentWrite)
    if (label) allowed.push({ ref: state.recentWrite.ref, domain: state.recentWrite.domain, label: label.slice(0, 120) })
  }
  for (const source of state.references.slice(0, 12 - allowed.length)) {
    if (source.domain !== 'ledger') continue
    const row = await ledger.source(source)
    if (row) allowed.push({ ref: source.ref, domain: source.domain, label: `${row.date} ${row.category} ${row.note} ¥${(row.amountCents / 100).toFixed(2)}`.slice(0, 120) })
  }
  return allowed
}

// 真实账目结果和短引用不经过模型润色，金额与可点开的来源共用同一批记录。
async function answerQuestion(item, state, ledger) {
  if (item.target?.ref) {
    const references = state.recentWrite ? [state.recentWrite, ...state.references] : state.references
    const reference = references.find((source) => source.ref === item.target.ref && source.domain === 'ledger')
    const row = reference && await ledger.source(reference)
    return row ? {
      response: { kind: 'answer', message: `${row.date} ${row.category} ¥${(row.amountCents / 100).toFixed(2)}。`, candidates: [{ ...publicCandidate(row), ref: 'R1' }], hasMore: false, referenceVersion: state.revision + 1 },
      references: [{ ref: 'R1', id: row.entryId, domain: 'ledger', fingerprint: row.fingerprint }],
      countQuestion: true,
    } : { response: { kind: 'record_changed' } }
  }
  const records = item.query.kind === 'trend' ? [] : await ledger.records(item.query)
  const { sourceMap = {}, ...answer } = buildLifeChatLedgerAnswer(item.query, records.map((row) => row.normalised))
  const byId = new Map(records.map((row) => [row.normalised.id, row]))
  const references = Object.values(sourceMap).map((source, index) => {
    const row = byId.get(source.entryId)
    return { ref: `R${index + 1}`, id: source.entryId, domain: 'ledger', fingerprint: row.fingerprint }
  })
  const candidates = (answer.candidates || []).map(({ sourceRef, ...candidate }) => ({
    ...candidate, ref: `R${sourceRef.slice(1)}`, date: beijingDay(Date.parse(candidate.occurredAt)),
  }))
  if (answer.kind === 'stats_redirect') return { response: { kind: 'stats', message: answer.message } }
  return { response: { ...answer, kind: 'answer', candidates, referenceVersion: state.revision + 1 }, references, countQuestion: true }
}

// 新账沿用原草稿入口，其他写入建议由业务模块生成核对卡。
async function handleSuggestion(item, state, dependencies) {
  if (item.action === 'ledger_query') return answerQuestion(item, state, dependencies.ledger)
  if (item.action === 'ledger_create') return { response: { kind: 'ledger_draft', text: item.evidence } }
  return dependencies.mutations.prepare(item, state)
}

// 待选项显示原话片段；剩余项只在同一聊天继续时重新发出操作卡。
function actionOptions(items) {
  return items.map((item) => `${ACTION_LABELS[item.action]} · ${item.evidence}`.slice(0, 150))
}

// 无明文草稿落库。最新卡片、引用版本和问账次数一同发布给当前页面。
function publish(sessionId, state, result, credentials) {
  const update = result.references ? { references: result.references, referenceVersion: state.revision + 1 } : {}
  const response = { ...result.response }
  if (result.remaining?.length) {
    const credential = credentials.seal(sessionId, { purpose: 'action', items: result.remaining, nonce: randomUUID() })
    update.remainingActions = cardKey(credential)
    response.remainingActions = { credential, count: result.remaining.length }
  }
  update.active = null
  if (result.payload) {
    const credential = credentials.seal(sessionId, { ...result.payload, nonce: randomUUID() })
    update.active = cardKey(credential)
    if (result.payload.purpose === 'write') update.operationId = result.payload.operationId
    response.credential = credential
  }
  return { update, response }
}

// 预览失败和真正保存结果未知使用不同反馈，避免重复尝试写入。
function failure(error, defaultKind) {
  if (error instanceof ChatWriteError) return { kind: error.kind }
  if (error instanceof LedgerAiDomainError) return { kind: 'clarify', question: '请补充要查的时间或账目线索。' }
  const kinds = {
    LEDGER_RANGE_TOO_LARGE: 'narrow_scope', TASK_TERMINAL: 'terminal',
    TASK_FORBIDDEN: 'forbidden', LEDGER_FORBIDDEN: 'forbidden', NO_HOME: 'forbidden',
    TASK_NOT_FOUND: 'record_changed', FOOTPRINT_NOT_FOUND: 'record_changed', LEDGER_NOT_FOUND: 'record_changed',
    TASK_DUPLICATE_OPERATION: 'record_changed', FOOTPRINT_CONFLICT: 'record_changed',
    FOOTPRINT_INVALID: 'invalid_request', TASK_INVALID_REQUEST: 'invalid_request',
    FOOTPRINT_CONTENT_REJECTED: 'content_rejected', CHECK_UNAVAILABLE: 'content_check_unavailable',
  }
  return { kind: kinds[error?.code] || defaultKind }
}

// 本次理解只允许原文字和当前有效引用，结果等待实际会话核对才能返回。
async function ask(event, dependencies) {
  const { store, now, interpret, ledger } = dependencies
  const text = typeof event.text === 'string' ? event.text.trim() : ''
  const context = event.context ?? []
  if (!TOKEN.test(event.requestId ?? '') || !text || text.length > 2_000 || !Array.isArray(context) ||
    context.length > 3 || context.some((line) => typeof line !== 'string' || !line.trim() || line.length > 600)) return { kind: 'invalid_request' }
  if (/^(?:可以|好(?:的)?|确认(?:修改|新增|删除|保存|记账)?|删吧|改吧|保存|记吧)[。！! ]*$/.test(text)) {
    const state = await store.session(event.sessionId)
    return state ? { kind: 'clarify', question: state.active ? '请在卡片上点击确认。' : '请说一下要处理哪条记录。' } : { kind: 'expired' }
  }
  const reservation = await store.begin(event.sessionId, event.requestId)
  if (reservation.kind !== 'accepted') return reservation
  const { state, day, until } = reservation
  let result = { response: { kind: 'unavailable' } }
  try {
    const references = await modelReferences(state, ledger, dependencies.mutations)
    const timeoutMs = until - now()
    if (timeoutMs <= 0) return { kind: 'expired' }
    const decision = await interpret({ version: 1, scope: state.scope, text, day: state.day, references, context, timeoutMs })
    if (decision.kind === 'suggestions' && decision.suggestions.length === 1) {
      const item = decision.suggestions[0]
      result = await handleSuggestion(item.action === 'ledger_create' ? { ...item, evidence: text } : item, state, dependencies)
    } else if (decision.kind === 'suggestions' && state.remainingActions) {
      result = { response: { kind: 'clarify', question: '还有上一条消息的待处理事项。请先点「继续处理」，再发送这句话。' } }
    } else if (decision.kind === 'suggestions') {
      result = {
        response: { kind: 'choose_action', options: actionOptions(decision.suggestions) },
        payload: { purpose: 'action', items: decision.suggestions },
      }
    } else result = { response: decision }
  } catch (error) {
    result = { response: failure(error, 'unavailable') }
  }
  const { update, response } = publish(event.sessionId, state, result, dependencies.credentials)
  const committed = await store.finish(event.sessionId, event.requestId, day, update, result.countQuestion === true)
  return committed.kind === 'finished' ? response : committed
}

// 用户明确点选、选图或确认只推进同一张签封，注册更新用一次事务。
async function actOnCard(event, state, dependencies) {
  const { store, credentials, mutations } = dependencies
  const opened = credentials.open(event.sessionId, event.credential)
  if (!opened) return { kind: 'invalid_request' }
  const active = cardKey(event.credential)
  if (event.action === 'resume_actions' && opened.purpose === 'action') {
    const changed = state.active === active || (state.remainingActions === active &&
      await store.advance(event.sessionId, state.active, { active, remainingActions: null }, false, active))
    return changed
      ? { kind: 'choose_action', options: actionOptions(opened.items), credential: event.credential }
      : { kind: 'expired' }
  }
  if (event.action === 'confirm' && opened.purpose === 'write') {
    if (state.active !== active) return await store.recover(opened.operationId) || { kind: 'expired' }
    try {
      return await mutations.confirm(event.sessionId, active, opened)
    } catch (error) {
      return await store.recover(opened.operationId) || failure(error, 'unknown')
    }
  }
  if (state.active !== active) return { kind: 'expired' }
  if (event.action === 'cancel') return { kind: await store.advance(event.sessionId, active, { active: null }) ? 'cancelled' : 'expired' }
  let result
  try {
    if (event.action === 'pick_place' && opened.purpose === 'map' && event.place) {
      result = await mutations.prepare(opened.item, state, opened.id, event.place)
    } else if (event.action === 'choose' && Number.isSafeInteger(event.index) && event.index >= 0) {
      if (opened.purpose === 'action' && opened.items[event.index]) {
        const selected = await handleSuggestion(opened.items[event.index], state, dependencies)
        result = { ...selected, remaining: opened.items.filter((_, index) => index !== event.index) }
      }
      if (opened.purpose === 'record' && opened.ids[event.index]) result = await mutations.prepare(opened.item, state, opened.ids[event.index])
      if (opened.purpose === 'map' && opened.knownId && event.index === 0) result = await mutations.prepareKnownPlace(opened, state)
    }
  } catch (error) {
    return failure(error, 'unavailable')
  }
  if (!result) return { kind: 'invalid_request' }
  const { update, response } = publish(event.sessionId, state, result, credentials)
  const changed = await store.advance(event.sessionId, active, update, result.countQuestion === true)
  if (changed === 'question_limit') return { kind: 'question_limit' }
  return changed ? response : { kind: 'expired' }
}

// 网关只调用这里列出的业务路径；模型不能直接触发保存。
async function handleChat(event, dependencies) {
  if (!event || Buffer.byteLength(JSON.stringify(event)) > 16_384) return { kind: 'invalid_request' }
  const { store, ledger } = dependencies
  if (event.action === 'status') return { kind: 'ready', version: 1 }
  if (event.action === 'recover' || event.action === 'stop_operation') {
    if (!TOKEN.test(event.operationId ?? '')) return { kind: 'invalid_request' }
    if (event.action === 'stop_operation') return store.stopOperation(event.operationId)
    return await store.recover(event.operationId) || { kind: 'unknown' }
  }
  if (event.action === 'open') {
    if (event.consent !== 1 || !SCOPES.has(event.scope)) return { kind: 'invalid_request' }
    const sessionId = randomUUID()
    await store.open(sessionId, event.scope)
    return { kind: 'opened', sessionId }
  }
  if (!TOKEN.test(event.sessionId ?? '')) return { kind: 'invalid_request' }
  if (event.action === 'close') {
    await store.close(event.sessionId)
    return { kind: 'closed' }
  }
  if (event.action === 'ask') return ask(event, dependencies)
  if (event.action === 'cancel_request') {
    if (!TOKEN.test(event.requestId ?? '')) return { kind: 'invalid_request' }
    return { kind: await store.cancelRequest(event.sessionId, event.requestId) ? 'cancelled' : 'expired' }
  }
  const state = await store.session(event.sessionId)
  if (!state) return { kind: 'expired' }
  if (['confirm', 'cancel', 'choose', 'pick_place', 'resume_actions'].includes(event.action)) return actOnCard(event, state, dependencies)
  if (event.action !== 'source' && event.action !== 'sources') return { kind: 'invalid_request' }
  if (state.referenceVersion !== event.referenceVersion) return { kind: 'record_changed' }
  if (event.action === 'source') {
    if (!REFERENCE.test(event.ref ?? '')) return { kind: 'invalid_request' }
    const source = state.references.find((item) => item.ref === event.ref)
    const row = source && await ledger.source(source)
    return row ? { kind: 'source', entryId: row.entryId } : { kind: 'record_changed' }
  }
  const offset = event.offset
  if (!Number.isSafeInteger(offset) || offset < 5 || offset > 995 || offset % 5) return { kind: 'invalid_request' }
  const candidates = []
  for (const source of state.references.slice(offset, offset + 5)) {
    const row = await ledger.source(source)
    if (row) {
      candidates.push(publicCandidate(row))
    }
  }
  return { kind: 'sources', candidates, hasMore: state.references.length > offset + 5, nextOffset: offset + 5 }
}

module.exports = { handleChat }
