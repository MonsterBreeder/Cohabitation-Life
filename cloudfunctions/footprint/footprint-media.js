// 足迹照片采用“预约—上传—审核—关联”流程，未经审核或跨家庭的文件不能进入足迹记录。
const crypto = require('crypto')
const { FootprintDomainError } = require('./footprint-domain')

const MAX_BYTES = 3 * 1024 * 1024
const PHOTO_ID = /^footphoto_[a-f0-9]{32}$/
const digest = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')

function detectJpeg(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9
}

async function preparePhoto(_input, dependencies) {
  const home = await dependencies.repository.findHouseholdByMember(dependencies.identityKey)
  if (!home) throw new FootprintDomainError('NO_HOME')
  const resourceId = `footphoto_${crypto.randomBytes(16).toString('hex')}`
  const secret = crypto.randomBytes(24).toString('hex')
  const stagingPath = `footprint-staging/${dependencies.ownerHash}/${secret}/${resourceId}.jpg`
  // 上传开始前保存完整文件编号，即使客户端在上传后断线，清理任务仍能找到原文件。
  const stagingFileID = await dependencies.storage.resolveFileID(stagingPath)
  const formalPath = `footprint-private/${dependencies.ownerHash}/${secret}/${resourceId}.jpg`
  const formalFileID = await dependencies.storage.resolveFileID(formalPath)
  await dependencies.repository.reserveMedia({
    _id: resourceId, ownerKey: dependencies.identityKey, householdId: home._id, state: 'prepared', stagingPath,
    stagingFileID, formalPath, formalFileID,
    createdAt: dependencies.now().toISOString(), expiresAt: dependencies.expiry().toISOString(),
  })
  return { status: 'UPLOAD_READY', retryable: false, resourceId, cloudPath: stagingPath }
}

async function reviewPhoto(input, dependencies) {
  if (!PHOTO_ID.test(input?.resourceId || '')) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
  const stored = await dependencies.repository.getMedia(input.resourceId)
  if (!stored || input.fileID !== stored.stagingFileID) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
  const media = await dependencies.repository.claimMediaReview(input.resourceId, dependencies.identityKey, dependencies.now().toISOString())
  if (media.state === 'approved' || media.state === 'linked') return { status: 'APPROVED', retryable: false, resourceId: media._id, digest: media.digest }
  try {
  const downloaded = await dependencies.storage.download(input.fileID)
  const buffer = downloaded.fileContent
  if (!detectJpeg(buffer) || buffer.length > MAX_BYTES || !isPrivateJpeg(buffer)) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
  const approved = await dependencies.checkImage(buffer, dependencies.openId, 'image/jpeg')
  if (!approved) {
    await dependencies.repository.finishMediaReview(media._id, media.reviewLease, { state: 'rejected', reviewedAt: dependencies.now().toISOString() }, dependencies.identityKey)
    throw new FootprintDomainError('FOOTPRINT_MEDIA_REJECTED')
  }
  const contentDigest = digest(buffer)
  const uploaded = await dependencies.storage.upload(media.formalPath, buffer)
  if (uploaded?.fileID !== media.formalFileID) throw new FootprintDomainError('TEMPORARY_FAILURE', true)
  await dependencies.repository.finishMediaReview(media._id, media.reviewLease, { state: 'approved', digest: contentDigest, reviewedAt: dependencies.now().toISOString() }, dependencies.identityKey)
  // 临时文件由清理任务处理；清理失败不能把已经通过审核的照片报告成失败。
  return { status: 'APPROVED', retryable: false, resourceId: media._id, digest: contentDigest }
  } catch (error) {
    await dependencies.repository.finishMediaReview(media._id, media.reviewLease, { state: 'prepared' }, dependencies.identityKey).catch(() => undefined)
    throw error
  }
}

/** 云端再次检查 JPEG 段，拒绝携带 EXIF/XMP/注释和超大尺寸的伪造客户端上传。 */
function isPrivateJpeg(buffer) {
  let offset = 2
  let hasFrame = false
  while (offset + 2 <= buffer.length) {
    if (buffer[offset++] !== 0xff) return false
    while (buffer[offset] === 0xff) offset += 1
    const marker = buffer[offset++]
    if (marker === 0xd9) return hasFrame && offset === buffer.length
    if (marker === 0xe1 || marker === 0xed || marker === 0xfe) return false
    if (offset + 2 > buffer.length) return false
    const length = buffer.readUInt16BE(offset)
    if (length < 2 || offset + length > buffer.length) return false
    if (marker === 0xc0 || marker === 0xc2) {
      if (length < 8) return false
      const height = buffer.readUInt16BE(offset + 3)
      const width = buffer.readUInt16BE(offset + 5)
      if (width < 1 || height < 1 || width > 1600 || height > 1600) return false
      hasFrame = true
    }
    offset += length
    if (marker === 0xda) {
      if (!hasFrame) return false
      // 扫描压缩数据时跳过转义和重启标记，再检查后续段，防止把 EXIF 藏在渐进扫描后。
      while (offset + 1 < buffer.length) {
        if (buffer[offset] !== 0xff) { offset += 1; continue }
        const next = buffer[offset + 1]
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { offset += 2; continue }
        break
      }
    }
  }
  return false
}

async function abandonPhotos(input, dependencies) {
  const ids = input?.resourceIds
  if (!Array.isArray(ids) || ids.length > 6 || ids.some((id) => typeof id !== 'string' || !PHOTO_ID.test(id))) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
  await dependencies.repository.abandonMedia(ids, dependencies.identityKey, dependencies.now().toISOString())
  return { status: 'ABANDONED', retryable: false }
}

async function getPhotoUrls(input, dependencies) {
  const ids = input?.resourceIds
  if (!Array.isArray(ids) || ids.length > 6 || ids.some((id) => typeof id !== 'string' || !PHOTO_ID.test(id))) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
  const home = await dependencies.repository.findHouseholdByMember(dependencies.identityKey)
  if (!home) throw new FootprintDomainError('NO_HOME')
  const media = await dependencies.repository.findVisibleMedia(ids, home._id)
  const fileIds = media.map((item) => item.formalFileID).filter(Boolean)
  const urlMap = await dependencies.storage.tempUrls(fileIds)
  return { status: 'URLS_READY', retryable: false, photos: media.map((item) => ({ resourceId: item._id, digest: item.digest, url: urlMap[item.formalFileID] })).filter((item) => item.url) }
}

module.exports = { preparePhoto, reviewPhoto, getPhotoUrls, abandonPhotos, detectJpeg, isPrivateJpeg, MAX_BYTES }
