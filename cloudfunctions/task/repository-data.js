/** 云数据库文档编号只用于定位，不能作为普通字段再次写入。 */
function withoutDocumentId(record) {
  const { _id, ...data } = record
  return data
}

/** 评论 id：c_ + 32 hex chars，便于和 task id 区分。 */
function commentId() {
  return `c_${require('crypto').randomBytes(16).toString('hex')}`
}

module.exports = { withoutDocumentId, commentId }
