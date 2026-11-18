// 文件用途：按家庭读取真实账目并生成稳定的短引用，点击时重新核对原记录。
const { createHash } = require('node:crypto')
const { normaliseLedgerAiEntry, loadLedgerAiEntries, loadLedgerAiContext } = require('../ledger-ai/repository-data')
const { readDocument } = require('./chat-store')

// 只使用实际保存字段判断变化，避免同一毫秒内不同内容持有同一个引用版本。
function fingerprint(record) {
  return createHash('sha256').update(JSON.stringify([
    record._id, record.updatedAt, record.deletedAt, record.type, record.categoryId, record.occurredAt,
    record.amountCents, record.note, record.payerMemberKey, record.receiptMediaId, record.mealPeriod,
  ])).digest('hex')
}

// 查询及回读共享当轮可信家庭范围，相关显示资料按需读取一次。
function createChatLedger(db, household, identityKey) {
  let contextPromise
  const context = () => (contextPromise ??= loadLedgerAiContext(db, household, identityKey, readDocument))
  return {
    async records(query) {
      const ranges = query.compareBy === 'period' && query.dateRange && query.otherDateRange
        ? [query.dateRange, query.otherDateRange] : [query.dateRange]
      const [groups, display] = await Promise.all([Promise.all(ranges.map((range) => loadLedgerAiEntries(db, household._id, range))), context()])
      const records = [...new Map(groups.flat().map((record) => [record._id, record])).values()]
      return records.filter((record) => record.householdId === household._id && record.deletedAt == null)
        .map((record) => ({ normalised: normaliseLedgerAiEntry(record, display), fingerprint: fingerprint(record) }))
    },

    async source(reference) {
      if (reference.domain !== 'ledger') return null
      const record = await readDocument(db.collection('ledgerEntries'), reference.id)
      if (!record || record.householdId !== household._id || record.deletedAt != null ||
        (reference.fingerprint && fingerprint(record) !== reference.fingerprint)) return null
      const row = normaliseLedgerAiEntry(record, await context())
      return {
        ref: reference.ref, entryId: row.id, fingerprint: fingerprint(record), amountCents: row.amountCents, type: row.type,
        category: row.categoryName, categoryName: row.categoryName, note: row.note, occurredAt: row.occurredAt,
        payerName: row.payerName, date: new Date(Date.parse(row.occurredAt) + 8 * 60 * 60_000).toISOString().slice(0, 10),
      }
    },
  }
}

module.exports = { createChatLedger, fingerprint }
