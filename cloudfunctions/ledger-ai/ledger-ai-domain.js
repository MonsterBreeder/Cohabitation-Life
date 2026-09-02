// “问账本”纯业务规则：校验模型查询计划、筛选账目、固定排序、准确计算与回答校验。
// 本文件不访问数据库和模型，便于用固定数据重复验证，避免模型决定金额或访问范围。

const ALLOWED_PLAN_KEYS = new Set([
  'kind', 'dateRange', 'entryType', 'payerRole', 'categoryTerms', 'noteTerms', 'synonymTerms', 'amount', 'compareBy',
])
const ALLOWED_KINDS = new Set(['find', 'sum', 'compare', 'trend'])
const MAX_CANDIDATES = 5

class LedgerAiDomainError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'LedgerAiDomainError'
    this.code = code
  }
}

function assertStringArray(value, field) {
  if (value == null) return []
  if (!Array.isArray(value) || value.length > 12 || value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 30)) {
    throw new LedgerAiDomainError('INVALID_PLAN', `${field} 不符合约束`)
  }
  return [...new Set(value.map((item) => item.trim().toLowerCase()))]
}

function parseDay(value, endOfDay) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new LedgerAiDomainError('INVALID_PLAN', '日期格式不正确')
  }
  // 账本按中国自然日展示，模型给出的日期也按东八区边界解释，避免凌晨账目被分到前一天。
  const timestamp = Date.parse(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+08:00`)
  if (!Number.isFinite(timestamp)) throw new LedgerAiDomainError('INVALID_PLAN', '日期无效')
  return timestamp
}

/** 只接受固定白名单字段，防止模型借问题内容扩大读取范围。 */
function validateQueryPlan(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new LedgerAiDomainError('INVALID_PLAN', '查询计划为空')
  for (const key of Object.keys(input)) {
    if (!ALLOWED_PLAN_KEYS.has(key)) throw new LedgerAiDomainError('INVALID_PLAN', `不支持字段 ${key}`)
  }
  if (!ALLOWED_KINDS.has(input.kind)) throw new LedgerAiDomainError('INVALID_PLAN', '问题类型不支持')
  if (input.kind === 'trend') return { kind: 'trend' }

  let dateRange
  if (input.dateRange != null) {
    if (!input.dateRange || typeof input.dateRange !== 'object' || Object.keys(input.dateRange).some((key) => !['start', 'end'].includes(key))) {
      throw new LedgerAiDomainError('INVALID_PLAN', '日期范围不支持')
    }
    const start = parseDay(input.dateRange.start, false)
    const end = parseDay(input.dateRange.end, true)
    if (start > end) throw new LedgerAiDomainError('INVALID_PLAN', '日期范围颠倒')
    dateRange = { start, end, startLabel: input.dateRange.start, endLabel: input.dateRange.end }
  }
  if (input.entryType != null && !['expense', 'income'].includes(input.entryType)) throw new LedgerAiDomainError('INVALID_PLAN', '收支类型不支持')
  if (input.payerRole != null && !['self', 'other'].includes(input.payerRole)) throw new LedgerAiDomainError('INVALID_PLAN', '付款人不支持')

  const categoryTerms = assertStringArray(input.categoryTerms, 'categoryTerms')
  const noteTerms = assertStringArray(input.noteTerms, 'noteTerms')
  const synonymTerms = assertStringArray(input.synonymTerms, 'synonymTerms')
  let amount
  if (input.amount != null) {
    if (!input.amount || typeof input.amount !== 'object' || Object.keys(input.amount).some((key) => !['targetCents', 'toleranceCents'].includes(key))) {
      throw new LedgerAiDomainError('INVALID_PLAN', '金额条件不支持')
    }
    const targetCents = input.amount.targetCents
    const toleranceCents = input.amount.toleranceCents == null
      ? Math.max(500, Math.round(targetCents * 0.2))
      : input.amount.toleranceCents
    if (!Number.isSafeInteger(targetCents) || targetCents <= 0 || !Number.isSafeInteger(toleranceCents) || toleranceCents < 0) {
      throw new LedgerAiDomainError('INVALID_PLAN', '金额条件无效')
    }
    amount = { targetCents, toleranceCents: Math.min(toleranceCents, Math.max(5000, Math.round(targetCents * 0.5))) }
  }
  if (input.kind === 'sum' && !dateRange && !input.entryType && !input.payerRole && categoryTerms.length === 0 && noteTerms.length === 0 && !amount) {
    throw new LedgerAiDomainError('INVALID_PLAN', '金额问题需要明确范围')
  }
  if (input.kind === 'compare' && input.compareBy !== 'payer') throw new LedgerAiDomainError('INVALID_PLAN', '只支持按成员比较')
  return { kind: input.kind, dateRange, entryType: input.entryType, payerRole: input.payerRole, categoryTerms, noteTerms, synonymTerms, amount, compareBy: input.compareBy }
}

function includesTerm(text, terms) {
  const lowered = String(text || '').toLowerCase()
  return terms.filter((term) => lowered.includes(term))
}

function passesHardConditions(entry, plan) {
  if (!entry || entry.deletedAt != null) return false
  if (plan.entryType && entry.type !== plan.entryType) return false
  if (plan.payerRole && entry.payerRole !== plan.payerRole) return false
  if (plan.dateRange) {
    const time = Date.parse(entry.occurredAt)
    if (!Number.isFinite(time) || time < plan.dateRange.start || time > plan.dateRange.end) return false
  }
  return true
}

function scoreEntry(entry, plan) {
  let score = 0
  const reasons = []
  const categoryHits = includesTerm(entry.categoryName, plan.categoryTerms)
  const noteHits = includesTerm(entry.note, plan.noteTerms)
  const synonymHits = includesTerm(`${entry.note || ''} ${entry.categoryName || ''}`, plan.synonymTerms)
  if (categoryHits.length) { score += 4; reasons.push('类目相关') }
  if (noteHits.length) { score += 5; reasons.push('备注提到相关内容') }
  if (synonymHits.length) { score += 3; reasons.push('备注含有相近说法') }
  if (plan.amount && Math.abs(entry.amountCents - plan.amount.targetCents) <= plan.amount.toleranceCents) {
    score += 3
    reasons.push('金额接近')
  }
  return { score, reasons }
}

function toCandidate(entry, sourceRef, matchReasons) {
  return {
    sourceRef,
    type: entry.type,
    amountCents: entry.amountCents,
    categoryName: entry.categoryName || '其他',
    note: typeof entry.note === 'string' ? entry.note : '',
    occurredAt: entry.occurredAt,
    payerName: entry.payerName || '家庭成员',
    matchReasons,
  }
}

function fixedMessage(answer) {
  if (answer.kind === 'amount') return `共找到 ${answer.sourceCount} 笔，合计 ¥${(answer.totalCents / 100).toFixed(2)}。`
  if (answer.kind === 'comparison') return `${answer.groups[0].label} ¥${(answer.groups[0].totalCents / 100).toFixed(2)}，${answer.groups[1].label} ¥${(answer.groups[1].totalCents / 100).toFixed(2)}。`
  if (answer.kind === 'candidates') return `找到 ${answer.candidates.length} 笔可能相关的账目，请核对。`
  return answer.message || '暂时没有足够依据，请补充金额、用途或时间。'
}

/** 根据受控查询计划生成权威事实；序号只对当前回答稳定。 */
function buildLedgerAnswer(rawPlan, rawEntries) {
  const plan = validateQueryPlan(rawPlan)
  if (plan.kind === 'trend') return { kind: 'stats_redirect', message: '多月份变化请到“账本统计”中查看。' }
  const entries = (Array.isArray(rawEntries) ? rawEntries : []).filter((entry) => passesHardConditions(entry, plan))
  const scored = entries.map((entry) => ({ entry, ...scoreEntry(entry, plan) }))

  if (plan.kind === 'find') {
    const matched = scored.filter((item) => item.score >= 3).sort((a, b) => b.score - a.score || Math.abs((a.entry.amountCents || 0) - (plan.amount?.targetCents || a.entry.amountCents || 0)) - Math.abs((b.entry.amountCents || 0) - (plan.amount?.targetCents || b.entry.amountCents || 0)) || Date.parse(b.entry.occurredAt) - Date.parse(a.entry.occurredAt))
    if (!matched.length) return { kind: 'no_evidence', message: '暂时没有足够依据，请补充金额、用途或更具体的时间。', candidates: [] }
    const visible = matched.slice(0, MAX_CANDIDATES)
    const candidates = visible.map((item, index) => toCandidate(item.entry, `S${index + 1}`, item.reasons))
    // 短时会话保存全部来源的临时编号，首屏仍只返回 5 条；后续分页不会再次调用模型。
    const sourceMap = Object.fromEntries(matched.map((item, index) => [`S${index + 1}`, { entryId: item.entry.id, matchReasons: item.reasons }]))
    return { kind: 'candidates', message: fixedMessage({ kind: 'candidates', candidates }), candidates, totalMatches: matched.length, hasMore: matched.length > MAX_CANDIDATES, sourceMap }
  }

  const hasSoftConditions = plan.categoryTerms.length || plan.noteTerms.length || plan.synonymTerms.length || plan.amount
  const matched = hasSoftConditions ? scored.filter((item) => item.score >= 3) : scored
  if (!matched.length) return { kind: 'no_evidence', message: '没有找到符合条件的账目。', candidates: [] }
  if (plan.kind === 'compare') {
    const totals = { self: 0, other: 0 }
    for (const item of matched) totals[item.entry.payerRole === 'self' ? 'self' : 'other'] += item.entry.amountCents
    const groups = [{ label: '我', totalCents: totals.self }, { label: '对方', totalCents: totals.other }]
    const answer = { kind: 'comparison', groups, sourceCount: matched.length }
    const visible = matched.slice(0, MAX_CANDIDATES)
    return {
      ...answer,
      message: fixedMessage(answer),
      candidates: visible.map((item, index) => toCandidate(item.entry, `S${index + 1}`, item.reasons)),
      totalMatches: matched.length,
      hasMore: matched.length > MAX_CANDIDATES,
      sourceMap: Object.fromEntries(matched.map((item, index) => [`S${index + 1}`, { entryId: item.entry.id, matchReasons: item.reasons }])),
    }
  }
  const totalCents = matched.reduce((sum, item) => sum + item.entry.amountCents, 0)
  const answer = { kind: 'amount', totalCents, sourceCount: matched.length, range: plan.dateRange ? { start: plan.dateRange.startLabel, end: plan.dateRange.endLabel } : null }
  const visible = matched.slice(0, MAX_CANDIDATES)
  return {
    ...answer,
    message: fixedMessage(answer),
    candidates: visible.map((item, index) => toCandidate(item.entry, `S${index + 1}`, item.reasons)),
    totalMatches: matched.length,
    hasMore: matched.length > MAX_CANDIDATES,
    sourceMap: Object.fromEntries(matched.map((item, index) => [`S${index + 1}`, { entryId: item.entry.id, matchReasons: item.reasons }])),
  }
}

/** 模型仅可润色；出现未知来源或与权威总额冲突时使用固定文案。 */
function validateGeneratedAnswer(text, facts) {
  if (typeof text !== 'string' || !text.trim()) return fixedMessage(facts)
  const knownRefs = new Set((facts.candidates || []).map((item) => item.sourceRef))
  const refs = text.match(/S\d+/g) || []
  if (refs.some((ref) => !knownRefs.has(ref))) return fixedMessage(facts)
  if (/user_|household_|openid|cloud:\/\//i.test(text)) return fixedMessage(facts)
  if (facts.kind === 'candidates' && facts.candidates.length > 1 && /(唯一|就是这笔|确定是)/.test(text)) return fixedMessage(facts)
  const allowedMoney = new Set()
  for (const candidate of facts.candidates || []) allowedMoney.add(Number((candidate.amountCents / 100).toFixed(2)))
  if (facts.kind === 'amount') allowedMoney.add(Number((facts.totalCents / 100).toFixed(2)))
  if (facts.kind === 'comparison') for (const group of facts.groups || []) allowedMoney.add(Number((group.totalCents / 100).toFixed(2)))
  const moneyValues = [...text.matchAll(/(?:¥\s*)?(\d+(?:\.\d{1,2})?)\s*元?/g)]
    .filter((match) => match[0].includes('¥') || match[0].includes('元'))
    .map((match) => Number.parseFloat(match[1]))
  if (moneyValues.some((value) => !allowedMoney.has(value))) return fixedMessage(facts)
  if (facts.kind === 'amount' && !moneyValues.includes(Number((facts.totalCents / 100).toFixed(2)))) return fixedMessage(facts)
  if (facts.kind === 'comparison' && (facts.groups || []).some((group) => !moneyValues.includes(Number((group.totalCents / 100).toFixed(2))))) return fixedMessage(facts)
  const knownDates = new Set((facts.candidates || []).map((candidate) => candidate.occurredAt.slice(0, 10)))
  const mentionedDates = text.match(/\d{4}-\d{2}-\d{2}/g) || []
  if (mentionedDates.some((date) => !knownDates.has(date))) return fixedMessage(facts)
  return text.trim().slice(0, 300)
}

module.exports = { buildLedgerAnswer, validateQueryPlan, validateGeneratedAnswer, LedgerAiDomainError }
