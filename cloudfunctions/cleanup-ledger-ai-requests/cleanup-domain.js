// 问账本临时记录清理规则：服务端时间超过 expiresAt 即可物理删除。
function isExpiredLedgerAiRecord(record, now = new Date()) {
  if (!record || typeof record.expiresAt !== 'string') return false
  const expiresAt = Date.parse(record.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime()
}
module.exports = { isExpiredLedgerAiRecord }
