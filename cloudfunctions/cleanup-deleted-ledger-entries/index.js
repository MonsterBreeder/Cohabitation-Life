// PRD 008：每日定时清理 30 天前的软删账目。
// 模式与 cleanup-deleted-tasks 完全一致：
//  - 每日 03:00 触发（在云开发控制台配置）
//  - 单条失败不阻塞其他条
//  - 物理删除 ledgerEntries + 连带删 ledgerOperations
//  - 凭证图（云存储）30 天物理删除账目时连带删 receipts/{householdId}/{entryId}.jpg

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const RETENTION_DAYS = 30
const BATCH_LIMIT = 500

exports.main = async () => {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  // 1. 找出所有 deletedAt < cutoff 的账目
  let expiredEntries
  try {
    const result = await db.collection('ledgerEntries').where({
      deletedAt: _.lt(cutoff),
    }).limit(BATCH_LIMIT).get()
    expiredEntries = result.data
  } catch (error) {
    console.error('cleanup-deleted-ledger-entries: query failed', error && error.message)
    return { ok: false, deleted: 0, error: 'QUERY_FAILED' }
  }

  if (!expiredEntries || expiredEntries.length === 0) {
    return { ok: true, deleted: 0, operations: 0, files: 0 }
  }

  let entryDeleted = 0
  let opDeleted = 0
  let filesDeleted = 0
  const failures = []
  const fileIdsToDelete = []

  for (const entry of expiredEntries) {
    try {
      await db.runTransaction(async (transaction) => {
        // 先删关联的 ledgerOperations
        const ops = await transaction.collection('ledgerOperations').where({ entryId: entry._id }).limit(100).get()
        for (const op of ops.data) {
          await transaction.collection('ledgerOperations').doc(op._id).remove()
        }
        opDeleted += ops.data.length
        // 再删账目本身
        await transaction.collection('ledgerEntries').doc(entry._id).remove()
        entryDeleted += 1
      })
      // 收集凭证图 fileID（账目事务外删除，云存储删除失败不影响 DB 清理）
      if (entry.receiptMediaId) {
        fileIdsToDelete.push(entry.receiptMediaId)
      }
    } catch (error) {
      failures.push({ entryId: entry._id, message: error && error.message })
      // 单条失败不阻塞
    }
  }

  // 2. 物理删除云存储凭证图（best-effort；失败不影响整体）
  if (fileIdsToDelete.length > 0) {
    try {
      const result = await cloud.deleteFile({ fileList: fileIdsToDelete })
      filesDeleted = (result && result.fileList && result.fileList.length) || 0
    } catch (error) {
      console.error('cleanup-deleted-ledger-entries: deleteFile failed', error && error.message)
      // 继续，DB 已经清理
    }
  }

  console.log('cleanup-deleted-ledger-entries: done', {
    cutoff: cutoff.toISOString(),
    scanned: expiredEntries.length,
    deleted: entryDeleted,
    operations: opDeleted,
    files: filesDeleted,
    failures: failures.length,
  })

  return {
    ok: failures.length === 0,
    scanned: expiredEntries.length,
    deleted: entryDeleted,
    operations: opDeleted,
    files: filesDeleted,
    failures,
  }
}
