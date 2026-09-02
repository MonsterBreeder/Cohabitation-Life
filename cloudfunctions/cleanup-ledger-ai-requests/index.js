// 每天清理问账本过期的短时会话和请求记录，不读取或打印其中的回答内容。
const cloud = require('wx-server-sdk')
const { isExpiredLedgerAiRecord } = require('./cleanup-domain')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const now = new Date()
  const result = await db.collection('ledgerAiSessions').where({ expiresAt: db.command.lte(now.toISOString()) }).limit(500).get()
  let deleted = 0
  const failures = []
  for (const record of result.data || []) {
    if (!isExpiredLedgerAiRecord(record, now)) continue
    try { await db.collection('ledgerAiSessions').doc(record._id).remove(); deleted += 1 } catch (error) {
      // 单条删除失败不阻塞本批其他记录，但要留下不含会话内容的失败编号便于排查。
      failures.push({ recordId: record._id, message: error instanceof Error ? error.message : 'UNKNOWN' })
    }
  }
  console.log('cleanup-ledger-ai-requests result', { scanned: result.data?.length || 0, deleted, failures: failures.length })
  return { ok: failures.length === 0, scanned: result.data?.length || 0, deleted, failures }
}
