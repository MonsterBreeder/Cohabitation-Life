/** 文件用途：仅回收明确过期的无正文记账回执，不接触正式账目或原创建去重事实。 */
/** 逐条核对版本和期限，未知格式不猜测接管。 */
async function cleanupBatches(
  /**
   * 仅操作当前业务集合的仓储能力，正式写入仍需事务核对。
   */
  repository,
  /**
   * 可信时钟的当前毫秒值，用于核对原期限而非刷新期限。
   */
  now,
) {
  /**
   * 本轮查到的有限原记录，逐条核对后才回收。
   */
  const records = await repository.expired(now, 100)

  /**
   * 实际成功回收的数量，不把尝试次数当作成功。
   */
  let deleted = 0

  /**
   * 本轮实际失败的数量，失败不能计入已完成。
   */
  let failed = 0

  /**
   * 当前原始记录，只在核对版本、范围和期限后使用。
   */
  for (const record of records) {
    if (
      !record ||
      record.v !== 1 ||
      !/^lbatch_[A-Za-z0-9_-]{43}$/.test(record._id || '') ||
      !Number.isSafeInteger(record.expiresAt) ||
      record.expiresAt > now
    )
      continue
    try {
      await repository.remove(record._id, record.expiresAt)
      deleted++
    } catch {
      failed++
    }
  }
  return { scanned: records.length, deleted, failed }
}
module.exports = { cleanupBatches }
