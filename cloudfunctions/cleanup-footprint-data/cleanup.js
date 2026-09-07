// 足迹清理规则保持纯函数，便于验证 30 天软删和短期无主照片两个窗口。
async function cleanupExpired(input, dependencies) {
  const expiredEntries = await dependencies.findExpiredEntries(input.entryCutoff, input.limit)
  const expiredMedia = await dependencies.findExpiredMedia(input.now, input.limit)
  let entriesDeleted = 0
  let mediaDeleted = 0
  const failures = []
  for (const entry of expiredEntries) {
    try { await dependencies.deleteEntry(entry); entriesDeleted += 1 } catch (error) { failures.push({ kind: 'entry', id: entry._id, message: error?.message }) }
  }
  for (const item of expiredMedia) {
    try { await dependencies.deleteMedia(item); mediaDeleted += 1 } catch (error) { failures.push({ kind: 'media', id: item._id, message: error?.message }) }
  }
  return { ok: failures.length === 0, entriesDeleted, mediaDeleted, failures }
}
module.exports = { cleanupExpired }
