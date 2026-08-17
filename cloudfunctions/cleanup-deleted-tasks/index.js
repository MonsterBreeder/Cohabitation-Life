// PRD 007：每日定时清理 30 天前的软删任务
// 部署到云开发后配置每日 03:00 触发（跟 cleanup-avatar-media 同方式）。
// 单条失败不阻塞其他条；最终日志里报清理条数。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 软删保留窗口：30 天（PRD 007 §3 决策 7）
const RETENTION_DAYS = 30

// 每次最多扫 500 条；超时则下次再扫
const BATCH_LIMIT = 500

exports.main = async () => {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  // 1. 找出所有 deletedAt < cutoff 的 task
  let expiredTasks
  try {
    const result = await db.collection('tasks').where({
      deletedAt: _.lt(cutoff),
    }).limit(BATCH_LIMIT).get()
    expiredTasks = result.data
  } catch (error) {
    console.error('cleanup-deleted-tasks: query failed', error && error.message)
    return { ok: false, deleted: 0, error: 'QUERY_FAILED' }
  }

  if (!expiredTasks || expiredTasks.length === 0) {
    return { ok: true, deleted: 0, operations: 0 }
  }

  let taskDeleted = 0
  let opDeleted = 0
  const failures = []

  // 2. 每条 task 单事务内：删 task + 删它的所有 taskOperations
  for (const task of expiredTasks) {
    try {
      await db.runTransaction(async (transaction) => {
        // 先删关联的 taskOperations
        const ops = await transaction.collection('taskOperations').where({ taskId: task._id }).limit(100).get()
        for (const op of ops.data) {
          await transaction.collection('taskOperations').doc(op._id).remove()
        }
        opDeleted += ops.data.length
        // 再删 task 本身
        await transaction.collection('tasks').doc(task._id).remove()
        taskDeleted += 1
      })
    } catch (error) {
      failures.push({ taskId: task._id, message: error && error.message })
      // 单条失败不阻塞
    }
  }

  console.log('cleanup-deleted-tasks: done', {
    cutoff: cutoff.toISOString(),
    scanned: expiredTasks.length,
    deleted: taskDeleted,
    operations: opDeleted,
    failures: failures.length,
  })

  return {
    ok: failures.length === 0,
    scanned: expiredTasks.length,
    deleted: taskDeleted,
    operations: opDeleted,
    failures,
  }
}
