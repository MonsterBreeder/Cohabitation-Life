// 每日清理：软删满 30 天的足迹，以及过期未关联、被替换或随足迹删除的照片和路线。
const cloud = require('wx-server-sdk')
const { cleanupExpired } = require('./cleanup')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 按文件检查删除结果；部分失败时保留清理记录，下一次继续重试。
async function removeFiles(fileList) {
  if (!fileList.length) return
  const result = await cloud.deleteFile({ fileList })
  const success = (item) => item.status === 0 || /not exist|not found/i.test(item.errMsg || '')
  if (!result.fileList || result.fileList.length !== fileList.length || result.fileList.some((item) => !success(item))) throw new Error('照片文件尚未全部清理')
}

exports.main = async () => {
  const now = new Date()
  const entryCutoff = new Date(now.getTime() - 30 * 86400000).toISOString()
  // 已经保存的照片不再需要上传原文件，只清理 staging，不碰正式回忆照片。
  const staging = await db.collection('footprintMedia').where({ state: _.in(['approved', 'linked']), stagingFileID: _.neq(null), createdAt: _.lt(new Date(now.getTime() - 2 * 3600000).toISOString()) }).limit(100).get()
  for (const item of staging.data) {
    try {
      await removeFiles([item.stagingFileID].filter(Boolean))
      await db.collection('footprintMedia').doc(item._id).update({ data: { stagingFileID: null } })
    } catch (error) { console.error('footprint staging cleanup failed', { resourceId: item._id, message: error.message }) }
  }
  return cleanupExpired({ now: now.toISOString(), entryCutoff, limit: 200 }, {
    findExpiredEntries: async (cutoff, limit) => (await db.collection('footprintEntries').where({ deletedAt: _.neq(null).and(_.lt(cutoff)) }).limit(limit).get()).data,
    findExpiredMedia: async (at, limit) => (await db.collection('footprintMedia').where({ expiresAt: _.neq(null).and(_.lt(at)) }).limit(limit).get()).data,
    findExpiredRoutes: async (at, limit) => (await db.collection('footprintRouteMedia').where({ expiresAt: _.neq(null).and(_.lt(at)) }).limit(limit).get()).data,
    deleteEntry: async (entry) => { await db.collection('footprintEntries').doc(entry._id).remove() },
    deleteMedia: async (item) => {
      // 先占用清理状态，和保存照片的事务互斥，不能用过期查询快照直接删文件。
      const claimed = await db.runTransaction(async (transaction) => {
        const current = (await transaction.collection('footprintMedia').doc(item._id).get()).data
        if (!current || !current.expiresAt || current.expiresAt >= now.toISOString() || current.state === 'linked') return null
        if (current.state === 'reviewing' && current.reviewLeaseUntil > now.toISOString()) return null
        await transaction.collection('footprintMedia').doc(item._id).update({ data: { state: 'cleaning', cleanupAttempts: _.inc(1) } })
        return current
      })
      if (!claimed) return
      try {
        await removeFiles([claimed.formalFileID, claimed.stagingFileID].filter(Boolean))
        await db.collection('footprintMedia').doc(item._id).remove()
      } catch (error) {
        await db.collection('footprintMedia').doc(item._id).update({ data: { cleanupError: '文件清理失败，等待下次重试' } })
        throw error
      }
    },
    deleteRoute: async (item) => {
      const claimed = await db.runTransaction(async (transaction) => {
        const current = (await transaction.collection('footprintRouteMedia').doc(item._id).get()).data
        if (!current || !current.expiresAt || current.expiresAt >= now.toISOString() || current.state === 'linked') return null
        await transaction.collection('footprintRouteMedia').doc(item._id).update({ data: { state: 'cleaning', cleanupAttempts: _.inc(1) } })
        return current
      })
      if (!claimed) return
      try {
        await removeFiles([claimed.fileID].filter(Boolean))
        await db.collection('footprintRouteMedia').doc(item._id).remove()
      } catch (error) {
        await db.collection('footprintRouteMedia').doc(item._id).update({ data: { cleanupError: '路线清理失败，等待下次重试' } })
        throw error
      }
    },
  })
}
