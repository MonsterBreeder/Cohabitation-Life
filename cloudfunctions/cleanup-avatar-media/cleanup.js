async function cleanupExpired(records, dependencies) {
  const result = { scanned: records.length, deleted: 0, failed: 0 }
  for (const record of records) {
    try {
      if (await dependencies.isReferenced(record._id)) continue
      const paths = [record.stagingPath, record.formalPath].filter(Boolean)
      if (paths.length) await dependencies.remove(paths)
      await dependencies.markDeleted(record._id)
      result.deleted += 1
    } catch {
      result.failed += 1
      await dependencies.markRetry(record._id)
    }
  }
  return result
}
module.exports = { cleanupExpired }
