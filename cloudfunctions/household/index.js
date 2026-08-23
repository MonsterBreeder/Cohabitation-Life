const cloud = require('wx-server-sdk')
const cloudbase = require('@cloudbase/node-sdk')
const cloudbaseStorage = require('@cloudbase/node-sdk/lib/storage')
const crypto = require('crypto')
const { createHousehold, confirmHousehold, getCurrentHousehold, updateHousehold, updateProfile, HouseholdDomainError } = require('./household-domain')
const { withoutDocumentId } = require('./repository-data')
const { prepareAvatar, checkAvatar, getAvatarUrl, AvatarMediaError } = require('./avatar-media')
const { checkImage, checkText } = require('./content-safety')
const { swapHouseholdAvatar, swapProfileAvatar } = require('./avatar-swap')
const { createInvitation, previewInvitation, joinInvitation, removeOtherMember } = require('./invitation-domain')
// PRD 008：household 云函数独立实现 8 个固定类目的初始化（不 require('../ledger/ledger-domain')，
// 因为 household 部署时只打包自身目录，跨目录引用会在云开发运行时 443 失败）。
// repository 通过 findCategoriesByHousehold + addCategory 写入 ledgerCategories 集合。

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
let cloudbaseApp

async function resolveCloudFileID(cloudPath) {
  if (!cloudbaseApp) cloudbaseApp = cloudbase.init({ env: process.env.TCB_ENV || process.env.SCF_NAMESPACE })
  const metadata = await cloudbaseStorage.getUploadMetadata(cloudbaseApp, { cloudPath })
  const fileID = metadata && metadata.data && metadata.data.fileId
  if (typeof fileID !== 'string') throw new Error('cloud storage file id unavailable')
  return fileID
}

function createIdentityKey(appId, openId) {
  return `user_${crypto.createHash('sha256').update(`${appId}:${openId}`).digest('hex')}`
}

async function getDocument(collection, id) {
  try {
    const result = await collection.doc(id).get()
    return result.data || null
  } catch (error) {
    // 云数据库在文档不存在时会抛错，这里只把“无数据”转换为空结果。
    if (error && (error.errCode === -1 || /not exist|not found/i.test(error.message || ''))) return null
    throw error
  }
}

function createRepository() {
  const avatarCollection = db.collection('avatarMedia')
  const avatarMedia = {
    get: (id) => getDocument(avatarCollection, id),
    create: (record) => avatarCollection.doc(record._id).set({ data: withoutDocumentId(record) }),
    update: (id, data) => avatarCollection.doc(id).update({ data }),
    markReplaced: (id, replacedAt) => avatarCollection.doc(id).update({ data: { state: 'replaced', replacedAt, expiresAt: replacedAt } }),
    findReusablePending: async (ownerKey) => {
      const result = await avatarCollection.where({ ownerKey, state: 'prepared' }).limit(20).get()
      const currentTime = Date.now()
      return result.data
        .filter((item) => (item.stagingPath || item.secret) && new Date(item.expiresAt).getTime() > currentTime)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] || null
    },
    reserveSlot: (ownerKey, purpose, createdAt, expiresAt) => db.runTransaction(async (transaction) => {
      for (let slot = 0; slot < 3; slot += 1) {
        const slotId = `slot_${crypto.createHash('sha256').update(`${ownerKey}:${slot}`).digest('hex')}`
        const current = await getDocument(transaction.collection('avatarUploadSlots'), slotId)
        if (current && current.expiresAt && new Date(current.expiresAt).getTime() > Date.now()) continue
        const resourceId = `avatar_${crypto.randomBytes(16).toString('hex')}`
        const secret = crypto.randomBytes(20).toString('hex')
        await transaction.collection('avatarUploadSlots').doc(slotId).set({ data: { ownerKey, resourceId, expiresAt } })
        await transaction.collection('avatarMedia').doc(resourceId).set({ data: { ownerKey, purpose, state: 'prepared', createdAt, expiresAt, slotId, secret } })
        return { resourceId, secret }
      }
      return null
    }),
  }
  const repository = {
    avatarMedia,
    async findHouseholdsByMemberKey(identityKey) {
      const result = await db.collection('households').where({ memberKeys: db.command.all([identityKey]) }).limit(2).get()
      return result.data
    },
    async findInvitationByTokenHash(tokenHash) {
      const result = await db.collection('invitations').where({ tokenHash }).limit(1).get()
      return result.data[0] || null
    },
    getOperation: (id) => getDocument(db.collection('householdOperations'), id),
    getHousehold: (id) => getDocument(db.collection('households'), id),
    getUser: (id) => getDocument(db.collection('users'), id),
    updateHousehold: (id, data) => db.collection('households').doc(id).update({ data }),
    updateUser: (id, data) => db.collection('users').doc(id).update({ data }),
    // PRD 008：household 云函数独立初始化 8 个固定类目时用的 repository 适配。
    // 直接读写 ledgerCategories 集合；权限由"所有用户不可读写"规则保证，household 云函数本身有管理员权限。
    async findCategoriesByHousehold(householdId) {
      const result = await db.collection('ledgerCategories').where({ householdId }).limit(50).get()
      return result.data
    },
    addCategory: (data) => db.collection('ledgerCategories').add({ data: withoutDocumentId(data) }),
    runTransaction(work) {
      return db.runTransaction(async (transaction) => work({
        getCreationLock: (id) => getDocument(transaction.collection('householdCreationLocks'), id),
        getMembershipLock: (id) => getDocument(transaction.collection('householdCreationLocks'), id),
        getHousehold: (id) => getDocument(transaction.collection('households'), id),
        createHousehold: (record) => transaction.collection('households').doc(record._id).set({ data: withoutDocumentId(record) }),
        createCreationLock: (record) => transaction.collection('householdCreationLocks').doc(record._id).set({ data: withoutDocumentId(record) }),
        setMembershipLock: (record) => transaction.collection('householdCreationLocks').doc(record._id).set({ data: withoutDocumentId(record) }),
        deleteMembershipLock: (id) => transaction.collection('householdCreationLocks').doc(id).remove(),
        createOperation: (record) => transaction.collection('householdOperations').doc(record._id).set({ data: withoutDocumentId(record) }),
        setHousehold: (record) => transaction.collection('households').doc(record._id).set({ data: withoutDocumentId(record) }),
        deleteHousehold: (id) => transaction.collection('households').doc(id).remove(),
        getInvitation: (id) => getDocument(transaction.collection('invitations'), id),
        setInvitation: (record) => transaction.collection('invitations').doc(record._id).set({ data: withoutDocumentId(record) }),
        getUser: (id) => getDocument(transaction.collection('users'), id),
        setUser: (record) => transaction.collection('users').doc(record._id).set({ data: withoutDocumentId(record) }),
      }))
    },
  }
  const transactionAdapter = (transaction) => ({
    getHousehold: (id) => getDocument(transaction.collection('households'), id),
    getUser: (id) => getDocument(transaction.collection('users'), id),
    updateHousehold: (id, data) => transaction.collection('households').doc(id).update({ data }),
    updateUser: (id, data) => transaction.collection('users').doc(id).update({ data }),
    markReplacedIfUnreferenced: async (resourceId, replacedAt, householdId, identityKey) => {
      const [home, user] = await Promise.all([getDocument(transaction.collection('households'), householdId), getDocument(transaction.collection('users'), identityKey)])
      if (home?.avatar?.resourceId === resourceId || user?.avatar?.resourceId === resourceId) return
      await transaction.collection('avatarMedia').doc(resourceId).update({ data: { state: 'replaced', replacedAt, expiresAt: replacedAt } })
    },
  })
  repository.swapHouseholdAvatar = (input) => db.runTransaction((transaction) => swapHouseholdAvatar(input, transactionAdapter(transaction), input.now))
  repository.swapProfileAvatar = (input) => db.runTransaction((transaction) => swapProfileAvatar(input, transactionAdapter(transaction), input.now))
  return repository
}

function avatarDependencies(identityKey, openId, repository) {
  const ownerHash = crypto.createHash('sha256').update(identityKey).digest('hex')
  return {
    identityKey, openId, ownerHash, repository: {
      ...repository.avatarMedia,
      findHouseholdsByMemberKey: repository.findHouseholdsByMemberKey,
      getUser: repository.getUser,
      isMemberProfileAvatar: async (memberKeys, resourceId) => {
        if (!Array.isArray(memberKeys) || memberKeys.length === 0) return false
        const result = await db.collection('users').where({ _id: db.command.in(memberKeys), 'avatar.resourceId': resourceId }).limit(1).get()
        return result.data.length > 0
      },
      countRecent: async (ownerKey, since) => (await db.collection('avatarMedia').where({ ownerKey, createdAt: db.command.gte(since) }).count()).total,
    },
    storage: {
      download: (fileID) => cloud.downloadFile({ fileID }),
      upload: (cloudPath, fileContent) => cloud.uploadFile({ cloudPath, fileContent }),
      remove: (fileList) => cloud.deleteFile({ fileList }),
      resolveFileID: resolveCloudFileID,
      tempUrl: (fileList) => cloud.getTempFileURL({ fileList }),
    },
    checkImage: (buffer, currentOpenId, contentType) => checkImage(buffer, currentOpenId, cloud.openapi, contentType),
    now: () => db.serverDate(),
    since: () => new Date(Date.now() - 60 * 60 * 1000),
    expiry: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
  }
}

exports.main = async (event) => {
  const context = cloud.getWXContext()
  try {
    const identityKey = createIdentityKey(context.APPID, context.OPENID)
    const repository = createRepository()
    const dependencies = {
      identityKey,
      repository,
      now: () => new Date(),
      createHouseholdId: () => `home_${crypto.randomBytes(16).toString('hex')}`,
      checkText: (content) => checkText(content, context.OPENID, 1, cloud.openapi),
    }
    const media = avatarDependencies(identityKey, context.OPENID, repository)
    if (event && event.action === 'prepareAvatar') return await prepareAvatar(event, media)
    if (event && event.action === 'checkAvatar') return await checkAvatar(event, media)
    if (event && event.action === 'getAvatarUrl') return await getAvatarUrl(event, media)
    // 首页查询不接收家庭编号，只按微信云端确认的当前身份查找归属。
    if (event && event.action === 'get') return await getCurrentHousehold(dependencies)
    if (event && event.action === 'updateHousehold') return await updateHousehold(event, dependencies)
    if (event && event.action === 'updateProfile') return await updateProfile(event, dependencies)
    if (event && event.action === 'createInvite') return await createInvitation(event, dependencies)
    if (event && event.action === 'previewInvite') return await previewInvitation(event, dependencies)
    if (event && event.action === 'joinInvite') return await joinInvitation(event, dependencies)
    if (event && event.action === 'removeOtherMember') return await removeOtherMember(event, dependencies)
    if (event && event.action === 'confirm') return await confirmHousehold(event, dependencies)
    if (!event || event.action !== 'create') throw new HouseholdDomainError('INVALID_REQUEST')
    return await createHousehold(event, dependencies)
  } catch (error) {
    if (error instanceof HouseholdDomainError || error instanceof AvatarMediaError) {
      return { status: error.code, retryable: error.retryable }
    }
    console.error('household action failed', {
      action: event && event.action,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    return { status: 'TEMPORARY_FAILURE', retryable: true }
  }
}
