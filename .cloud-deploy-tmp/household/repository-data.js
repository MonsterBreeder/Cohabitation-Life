/** 云数据库文档编号只用于定位，不能作为普通字段再次写入。 */
function withoutDocumentId(record) {
  const { _id, ...data } = record
  return data
}

module.exports = { withoutDocumentId }
