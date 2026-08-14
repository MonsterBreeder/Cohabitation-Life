const cloud = require('wx-server-sdk')
const { cleanupExpired } = require('./cleanup')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const collection = db.collection('avatarMedia')
  const expired = await collection.where({ state: db.command.in(['prepared', 'rejected', 'replaced']), expiresAt: db.command.lte(new Date()) }).limit(50).get()
  return cleanupExpired(expired.data, {
    isReferenced: async (id) => {
      const [homes, users] = await Promise.all([
        db.collection('households').where({ 'avatar.resourceId': id }).limit(1).get(),
        db.collection('users').where({ 'avatar.resourceId': id }).limit(1).get(),
      ])
      return homes.data.length > 0 || users.data.length > 0
    },
    remove: (fileList) => cloud.deleteFile({ fileList }),
    markDeleted: (id) => collection.doc(id).update({ data: { state: 'deleted', deletedAt: db.serverDate(), stagingPath: null, formalPath: null } }),
    markRetry: (id) => collection.doc(id).update({ data: { cleanupFailures: db.command.inc(1), lastCleanupFailureAt: db.serverDate() } }),
  })
}
