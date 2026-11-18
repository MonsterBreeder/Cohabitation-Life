// “问账本”数据库记录收敛：仅保留完成匹配所需字段，不包含凭证、家庭编号和内部身份编号。

function normaliseLedgerAiEntry(record, context = {}) {
  if (!record || record.deletedAt != null) return null
  const category = context.categoriesById?.[record.categoryId]
  const payerRole = record.payerMemberKey === context.selfMemberKey ? 'self' : 'other'
  const payer = context.membersByKey?.[record.payerMemberKey]
  return {
    id: record._id,
    type: record.type,
    amountCents: Number.isSafeInteger(record.amountCents) ? record.amountCents : 0,
    categoryId: record.categoryId,
    categoryName: category?.name || '其他',
    note: typeof record.note === 'string' ? record.note.slice(0, 100) : '',
    occurredAt: record.occurredAt,
    payerRole,
    payerName: payer?.nickname || (payerRole === 'self' ? '我' : '家庭成员'),
    createdAt: record.createdAt,
  }
}

// 两个问账入口使用一样的读取边界。完整性无法确认时拒绝给出合计。
async function loadLedgerAiEntries(db, householdId, dateRange) {
  const result = []
  const filter = { householdId, deletedAt: null }
  if (dateRange) {
    // 只读取用户明确请求的北京时间区间，历史账本过大时缩小日期可以继续查。
    const start = new Date(`${dateRange.start}T00:00:00+08:00`).toISOString()
    const end = new Date(`${dateRange.end}T23:59:59.999+08:00`).toISOString()
    filter.occurredAt = db.command.gte(start).and(db.command.lte(end))
  }
  for (let offset = 0; offset < 1000; offset += 100) {
    const page = await db.collection('ledgerEntries').where(filter).orderBy('occurredAt', 'desc').skip(offset).limit(100).get()
    result.push(...page.data)
    if (page.data.length < 100) return result
  }
  const error = new Error('LEDGER_RANGE_TOO_LARGE')
  error.code = 'LEDGER_RANGE_TOO_LARGE'
  throw error
}

// 只加载当前家庭的类目与展示名，用于形成既有查账口径。
async function loadLedgerAiContext(db, household, identityKey, getDoc) {
  const categoriesResult = await db.collection('ledgerCategories').where({ householdId: household._id }).limit(100).get()
  const categoriesById = Object.fromEntries(categoriesResult.data.map((item) => [item._id, item]))
  const membersByKey = {}
  for (const memberKey of household.memberKeys || []) {
    const profile = await getDoc(db.collection('users'), memberKey)
    membersByKey[memberKey] = { nickname: profile?.nickname || (memberKey === identityKey ? '我' : '家庭成员') }
  }
  return { categoriesById, membersByKey, selfMemberKey: identityKey }
}

module.exports = { normaliseLedgerAiEntry, loadLedgerAiEntries, loadLedgerAiContext }
