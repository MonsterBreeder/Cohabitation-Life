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

module.exports = { normaliseLedgerAiEntry }
