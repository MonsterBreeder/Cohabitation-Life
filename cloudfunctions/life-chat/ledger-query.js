// 文件用途：沿用原问账的查找和求和规则，并按两个完整日期区间比较金额。
const { buildLedgerAnswer, validateQueryPlan, LedgerAiDomainError } = require('../ledger-ai/ledger-ai-domain')

// 新入口明确拒绝会被日期对象自动顺延的无效日期，旧入口继续使用原格式。
function checkRange(range) {
  if (range == null) return
  for (const day of [range.start, range.end]) {
    const timestamp = Date.parse(`${day}T00:00:00Z`)
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== day) {
      throw new LedgerAiDomainError('INVALID_PLAN', '日期无效')
    }
  }
}

// 处理新的比较模式；查找、合计、成员比较和统计引导仍走原规则。
function buildLifeChatLedgerAnswer(rawPlan, entries) {
  checkRange(rawPlan?.dateRange)
  checkRange(rawPlan?.otherDateRange)
  if (rawPlan?.kind !== 'compare' || rawPlan?.compareBy !== 'period') {
    return buildLedgerAnswer(rawPlan, entries)
  }

  // 两段都必须明确。每段用原求和逻辑，确保查询条件与收支口径一致。
  const { dateRange, otherDateRange, compareBy, ...conditions } = rawPlan
  if (!dateRange || !otherDateRange) throw new LedgerAiDomainError('INVALID_PLAN', '请给出两个日期范围')
  const ranges = [dateRange, otherDateRange]
  for (const range of ranges) validateQueryPlan({ ...conditions, kind: 'sum', dateRange: range })
  const answers = ranges.map((range) => buildLedgerAnswer({ ...conditions, kind: 'sum', dateRange: range }, entries))
  if (answers.every((answer) => answer.kind === 'no_evidence')) return answers[0]

  // 相交区间也分别计算金额，来源列表只展示一个相同实际条目。
  const groups = ranges.map((range, index) => ({
    label: `${range.start} 至 ${range.end}`,
    totalCents: answers[index].totalCents ?? 0,
    sourceCount: answers[index].sourceCount ?? 0,
  }))
  const seen = new Map()
  const candidates = []
  for (const answer of answers) {
    for (const [oldRef, source] of Object.entries(answer.sourceMap || {})) {
      if (seen.has(source.entryId)) continue
      const sourceRef = `S${seen.size + 1}`
      seen.set(source.entryId, { sourceRef, source })
      const visible = answer.candidates.find((item) => item.sourceRef === oldRef)
      if (candidates.length < 5 && visible) candidates.push({ ...visible, sourceRef })
    }
  }
  return {
    kind: 'comparison',
    groups,
    message: groups.map(({ label, totalCents }) => `${label} ¥${(totalCents / 100).toFixed(2)}`).join('，') + '。',
    candidates,
    sourceCount: seen.size,
    totalMatches: seen.size,
    hasMore: seen.size > candidates.length,
    sourceMap: Object.fromEntries([...seen.values()].map(({ sourceRef, source }) => [sourceRef, source])),
  }
}

module.exports = { buildLifeChatLedgerAnswer }
