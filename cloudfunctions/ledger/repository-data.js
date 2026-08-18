// 家庭共同流水账的 repository 层。
// 与 task/repository-data 模式一致：每个函数都是 async + 返回纯数据 + 允许依赖注入。
// 这里不实现真正的 db 读写（云端运行时由 ledger/index.js 注入），
// 只做：(1) 字段过滤（deletedAt IS NULL 软删过滤）；(2) 字段白名单收敛。

function withoutDocumentId(record) {
  const { _id, ...rest } = record
  return rest
}

/** 过滤 active 账目：deletedAt 字段不存在或为 null。 */
function filterActive(records) {
  if (!Array.isArray(records)) return []
  return records.filter((r) => r && r.deletedAt == null)
}

/** 把 DB 记录 normalise 为前端 summary。 */
function normaliseEntry(record) {
  if (!record) return null
  return {
    id: record._id,
    type: record.type,
    amountCents: typeof record.amountCents === 'number' ? record.amountCents : 0,
    categoryId: record.categoryId,
    note: typeof record.note === 'string' ? record.note : '',
    occurredAt: record.occurredAt,
    receiptMediaId: record.receiptMediaId || null,
    payer: record.payer,
    createdAt: record.createdAt,
  }
}

function normaliseEntryDetail(record) {
  const summary = normaliseEntry(record)
  if (!summary) return null
  return {
    ...summary,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt || null,
  }
}

function normaliseCategory(record) {
  if (!record) return null
  return {
    id: record._id,
    key: record.key,
    name: record.name,
    iconKey: record.iconKey,
    colorKey: record.colorKey,
    isCustom: record.isCustom === true,
    sortOrder: typeof record.sortOrder === 'number' ? record.sortOrder : 999,
  }
}

module.exports = {
  withoutDocumentId,
  filterActive,
  normaliseEntry,
  normaliseEntryDetail,
  normaliseCategory,
}
