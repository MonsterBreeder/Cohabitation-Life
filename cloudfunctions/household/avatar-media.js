const crypto = require('crypto')
const MAX_BYTES = 5 * 1024 * 1024
const PURPOSES = new Set(['household', 'profile'])
const RESOURCE_ID = /^avatar_[a-f0-9]{32}$/

class AvatarMediaError extends Error { constructor(code, retryable = false) { super(code); this.code = code; this.retryable = retryable } }
const digest = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')
function detectImageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: 'image/png', extension: 'png' }
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { mime: 'image/jpeg', extension: 'jpg' }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', extension: 'webp' }
  return null
}

async function prepareAvatar(input, deps) {
  if (!PURPOSES.has(input && input.purpose)) throw new AvatarMediaError('INVALID_REQUEST')
  // 优先复用尚未完成的上传，避免检查失败后反复占用新的名额。
  const reusable = await deps.repository.findReusablePending(deps.identityKey)
  if (reusable) {
    const cloudPath = reusable.stagingPath || `avatar-staging/${deps.ownerHash}/${reusable.secret}/${reusable._id}.png`
    await deps.repository.update(reusable._id, { purpose: input.purpose, stagingPath: cloudPath })
    return { status: 'UPLOAD_READY', retryable: false, resourceId: reusable._id, cloudPath }
  }
  if (await deps.repository.countRecent(deps.identityKey, deps.since()) >= 12) throw new AvatarMediaError('RATE_LIMITED', true)
  const reservation = await deps.repository.reserveSlot(deps.identityKey, input.purpose, deps.now(), deps.expiry())
  if (!reservation) throw new AvatarMediaError('RESOURCE_LIMIT', true)
  const resourceId = reservation.resourceId
  const cloudPath = `avatar-staging/${deps.ownerHash}/${reservation.secret}/${resourceId}.png`
  await deps.repository.update(resourceId, { stagingPath: cloudPath })
  return { status: 'UPLOAD_READY', retryable: false, resourceId, cloudPath }
}

async function checkAvatar(input, deps) {
  if (!RESOURCE_ID.test(input && input.resourceId || '')) throw new AvatarMediaError('INVALID_REQUEST')
  const record = await deps.repository.get(input.resourceId)
  if (!record || record.ownerKey !== deps.identityKey) throw new AvatarMediaError('MEDIA_NOT_FOUND')
  if (record.state === 'approved') return { status: 'APPROVED', retryable: false, resourceId: record._id, digest: record.digest }
  if (record.state === 'rejected') return { status: 'REJECTED', retryable: false }
  const fileID = input && input.fileID
  if (typeof fileID !== 'string' || !fileID.startsWith('cloud://') || !fileID.endsWith(`/${record.stagingPath}`)) throw new AvatarMediaError('INVALID_MEDIA')
  const downloaded = await deps.storage.download(fileID)
  const buffer = downloaded.fileContent
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_BYTES) throw new AvatarMediaError('INVALID_MEDIA')
  const imageType = detectImageType(buffer)
  if (!imageType) throw new AvatarMediaError('INVALID_MEDIA')
  const verdict = await deps.checkImage(buffer, deps.openId, imageType.mime)
  if (verdict !== 'approved') {
    await deps.repository.update(record._id, { state: 'rejected', reviewedAt: deps.now() })
    // 不论通过还是拒绝，检查结束都要释放 slot，否则调试场景会占满 3 个 slot
    // 直至 expiresAt 过期（24h）。avatarMedia 记录里的 slotId 是 reserveSlot 时写入的。
    await deps.repository.cleanupSlot(record.slotId)
    return { status: 'REJECTED', retryable: false }
  }
  const contentDigest = digest(buffer)
  const formalPath = `avatar-private/${deps.ownerHash}/${crypto.randomBytes(24).toString('hex')}/${record._id}-${contentDigest}.${imageType.extension}`
  const uploaded = await deps.storage.upload(formalPath, buffer)
  const formalFileID = uploaded && uploaded.fileID
  if (typeof formalFileID !== 'string' || !formalFileID.startsWith('cloud://') || !formalFileID.endsWith(`/${formalPath}`)) throw new AvatarMediaError('TEMPORARY_FAILURE', true)
  await deps.repository.update(record._id, { state: 'approved', formalPath, formalFileID, digest: contentDigest, reviewedAt: deps.now(), stagingPath: null })
  await deps.repository.cleanupSlot(record.slotId)
  await deps.storage.remove([record.stagingPath])
  return { status: 'APPROVED', retryable: false, resourceId: record._id, digest: contentDigest }
}

/**
 * 释放当前身份下所有未过期的 avatar upload slot，并把残留 prepared 状态的
 * avatarMedia 标记为 replaced（避免下次 prepareAvatar 复用过期引用）。
 * 用途：调试过程中多次 prepareAvatar 把 3 个 slot 都占满且用户没走到 saveProfile，
 * 导致 RESOURCE_LIMIT 持续 24h；用户主动调用本函数可立即恢复。
 */
async function releaseSlots(input, deps) {
  // 删除当前身份的所有 avatarUploadSlots 记录；不区分过期与否，一次清干净。
  await deps.repository.releaseAllSlots(deps.identityKey)
  const pending = await deps.repository.findPendingForRelease(deps.identityKey)
  const now = deps.now()
  await Promise.all(pending.map((record) => deps.repository.update(record._id, { state: 'replaced', replacedAt: now, expiresAt: now, stagingPath: null })))
  return { status: 'RELEASED', retryable: false, releasedSlots: 3, releasedPending: pending.length }
}

async function validateAvatarReference(avatar, purpose, identityKey, repository) {
  if (!avatar || avatar.kind !== 'custom' || !RESOURCE_ID.test(avatar.resourceId || '') || !/^[a-f0-9]{64}$/.test(avatar.digest || '')) return null
  const record = await repository.get(avatar.resourceId)
  if (!record || record.ownerKey !== identityKey || record.purpose !== purpose || record.state !== 'approved' || record.digest !== avatar.digest || !record.formalPath) return null
  return { kind: 'custom', resourceId: record._id, digest: record.digest }
}

async function getAvatarUrl(input, deps) {
  const record = await deps.repository.get(input && input.resourceId)
  if (!record || record.state !== 'approved') throw new AvatarMediaError('MEDIA_NOT_FOUND')
  const homes = await deps.repository.findHouseholdsByMemberKey(deps.identityKey)
  if (homes.length !== 1) throw new AvatarMediaError('NO_HOME')
  const home = homes[0]
  const ownProfile = await deps.repository.getUser(deps.identityKey)
  const referenced = home.avatar?.resourceId === record._id || ownProfile?.avatar?.resourceId === record._id || await deps.repository.isMemberProfileAvatar(home.memberKeys || [], record._id)
  if (!referenced) throw new AvatarMediaError('MEDIA_FORBIDDEN')
  let formalFileID = record.formalFileID
  // 旧记录只保存了相对路径，首次读取时补齐完整文件地址，用户无需重新上传。
  if (typeof formalFileID !== 'string' || !formalFileID.startsWith('cloud://') || !formalFileID.endsWith(`/${record.formalPath}`)) {
    formalFileID = await deps.storage.resolveFileID(record.formalPath)
    if (typeof formalFileID !== 'string' || !formalFileID.startsWith('cloud://') || !formalFileID.endsWith(`/${record.formalPath}`)) throw new AvatarMediaError('TEMPORARY_FAILURE', true)
    await deps.repository.update(record._id, { formalFileID })
  }
  const result = await deps.storage.tempUrl([formalFileID])
  const item = result.fileList && result.fileList[0]
  if (!item || !item.tempFileURL) throw new AvatarMediaError('TEMPORARY_FAILURE', true)
  return { status: 'URL_READY', retryable: false, url: item.tempFileURL }
}

module.exports = { prepareAvatar, checkAvatar, validateAvatarReference, getAvatarUrl, releaseSlots, AvatarMediaError, MAX_BYTES, detectImageType }
