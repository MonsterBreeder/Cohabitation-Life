// 家庭足迹领域规则：地点去重、共同权限、幂等新增、版本冲突和软删除都在云端决定。
const crypto = require('crypto')

const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{16,128}$/
const ID_PATTERN = /^footprint_[a-f0-9]{32}$/
const PHOTO_ID_PATTERN = /^footphoto_[a-f0-9]{32}$/
const MEMORY_MAX = 300

class FootprintDomainError extends Error {
  constructor(code, retryable = false) { super(code); this.code = code; this.retryable = retryable }
}

const makeEntryId = () => `footprint_${crypto.randomBytes(16).toString('hex')}`
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
// 凭证按操作者、家庭和动作隔离，另一位成员不能复用同一个凭证读回他人的操作结果。
const operationId = (householdId, identityKey, kind, requestId) => `footop_${hash(`${householdId}:${identityKey}:${kind}:${requestId}`)}`

function validateCredential(value) {
  if (typeof value !== 'string' || !CREDENTIAL_PATTERN.test(value)) throw new FootprintDomainError('FOOTPRINT_INVALID')
}

function normaliseText(value, maxLength, required = false) {
  if (typeof value !== 'string') throw new FootprintDomainError('FOOTPRINT_INVALID')
  const normalised = value.normalize('NFKC').trim().replace(/[ \t]+/g, ' ')
  const length = [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(normalised)].length
  if ((required && length === 0) || length > maxLength) throw new FootprintDomainError('FOOTPRINT_INVALID')
  return normalised
}

function normalisePlace(value) {
  if (!value || typeof value !== 'object') throw new FootprintDomainError('FOOTPRINT_INVALID')
  const name = normaliseText(value.name, 100, true)
  const address = normaliseText(value.address || '', 200)
  const latitude = value.latitude
  const longitude = value.longitude
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new FootprintDomainError('FOOTPRINT_INVALID')
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new FootprintDomainError('FOOTPRINT_INVALID')
  return { name, address, latitude: Number(latitude.toFixed(6)), longitude: Number(longitude.toFixed(6)) }
}

function placeKey(place) {
  return hash(`${place.name}|${place.address}|${place.latitude.toFixed(6)}|${place.longitude.toFixed(6)}`)
}

function normaliseVisitedAt(value, now) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FootprintDomainError('FOOTPRINT_INVALID')
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new FootprintDomainError('FOOTPRINT_INVALID')
  // 云函数时区不固定，按中国日期校验，避免凌晨把今天误判成未来。
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)
  if (value > today || value < '2000-01-01') throw new FootprintDomainError('FOOTPRINT_INVALID')
  return value
}

function normalisePhotoIds(value) {
  if (!Array.isArray(value) || value.length > 3) throw new FootprintDomainError('FOOTPRINT_INVALID')
  const ids = value.map((id) => {
    if (typeof id !== 'string' || !PHOTO_ID_PATTERN.test(id)) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
    return id
  })
  if (new Set(ids).size !== ids.length) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
  return ids
}

function safePhoto(photo) {
  return photo ? { resourceId: photo._id || photo.resourceId, digest: photo.digest, ...(photo.url ? { url: photo.url } : {}) } : null
}

function safeCreator(profile, isSelf, hasLeft) {
  const avatar = profile?.avatar?.kind === 'custom'
    ? { kind: 'custom', resourceId: profile.avatar.resourceId, digest: profile.avatar.digest }
    : { kind: 'builtin', id: profile?.avatar?.id || 'person-neutral' }
  return { nickname: profile?.nickname || (hasLeft ? '已离开成员' : '家庭成员'), avatar, isSelf, ...(hasLeft ? { hasLeft: true } : {}) }
}

function safeEntry(entry, photos = []) {
  const cover = entry.photoRefs?.[0] || photos[0] || entry.coverPhoto || null
  return {
    id: entry._id,
    placeKey: entry.placeKey,
    place: entry.place,
    visitedAt: entry.visitedAt,
    memory: entry.memory,
    coverPhoto: safePhoto(cover),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    editVersion: entry.editVersion,
  }
}

async function assertMember(dependencies, expectedHouseholdId) {
  const home = await dependencies.repository.findHouseholdByMember(dependencies.identityKey)
  if (!home || !Array.isArray(home.memberKeys) || !home.memberKeys.includes(dependencies.identityKey)) {
    throw new FootprintDomainError('NO_HOME')
  }
  // 客户端家庭编号只作为防误写约束，不能用于决定归属或授权。
  if (expectedHouseholdId && expectedHouseholdId !== home._id) throw new FootprintDomainError('NO_HOME')
  return home
}

async function validatePhotos(photoIds, householdId, identityKey, repository) {
  if (photoIds.length === 0) return []
  const photos = await repository.findMediaByIds(photoIds)
  if (photos.length !== photoIds.length) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
  const map = new Map(photos.map((photo) => [photo._id, photo]))
  return photoIds.map((id) => {
    const photo = map.get(id)
    if (!photo || photo.ownerKey !== identityKey || photo.householdId !== householdId || photo.state !== 'approved' || !photo.digest) {
      throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
    }
    return photo
  })
}

/** 首页和足迹首页共用的轻量概览。 */
async function getSummary(_input, dependencies) {
  const home = await assertMember(dependencies)
  const [summary, membership] = await Promise.all([
    dependencies.repository.getSummary(home._id), dependencies.repository.getMembershipLock(dependencies.identityKey),
  ])
  const joinedAt = membership?.joinedAt || membership?.createdAt
  const showPreJoinHistoryNotice = Boolean(joinedAt && !membership?.footprintHistoryNoticeAcknowledgedAt
    && await dependencies.repository.hasEntryCreatedBefore(home._id, new Date(joinedAt).toISOString()))
  return { status: 'LOADED', retryable: false, summary, showPreJoinHistoryNotice }
}

async function getOverview(input, dependencies) {
  const home = await assertMember(dependencies)
  const pageSize = Math.min(100, Math.max(1, Number(input?.placesPageSize) || 100))
  const entriesPageSize = Math.min(20, Math.max(1, Number(input?.entriesPageSize) || 20))
  const [summary, places, entries, membership] = await Promise.all([
    dependencies.repository.getSummary(home._id),
    dependencies.repository.listPlaces(home._id, null, pageSize),
    dependencies.repository.listEntries(home._id, null, entriesPageSize),
    dependencies.repository.getMembershipLock(dependencies.identityKey),
  ])
  const joinedAt = membership?.joinedAt || membership?.createdAt
  const hasPreJoinHistory = Boolean(joinedAt && !membership?.footprintHistoryNoticeAcknowledgedAt
    && await dependencies.repository.hasEntryCreatedBefore(home._id, joinedAt))
  return {
    status: 'LOADED', retryable: false,
    summary, places: places.items, placesCursor: places.cursor,
    entries: entries.items, entriesCursor: entries.cursor,
    showPreJoinHistoryNotice: hasPreJoinHistory,
  }
}

async function listEntries(input, dependencies) {
  const home = await assertMember(dependencies)
  if (input?.placeKey && !/^[a-f0-9]{64}$/.test(input.placeKey)) throw new FootprintDomainError('FOOTPRINT_INVALID')
  const pageSize = Math.min(20, Math.max(1, Number(input?.pageSize) || 20))
  const result = await dependencies.repository.listEntries(home._id, input?.cursor || null, pageSize, input?.placeKey || null)
  return { status: 'LISTED', retryable: false, entries: result.items, cursor: result.cursor }
}

async function listPlaces(input, dependencies) {
  const home = await assertMember(dependencies)
  const pageSize = Math.min(100, Math.max(1, Number(input?.pageSize) || 100))
  const result = await dependencies.repository.listPlaces(home._id, input?.cursor || null, pageSize)
  return { status: 'LISTED', retryable: false, places: result.items, cursor: result.cursor }
}

async function getEntry(input, dependencies) {
  if (typeof input?.entryId !== 'string' || !ID_PATTERN.test(input.entryId)) throw new FootprintDomainError('FOOTPRINT_INVALID')
  const home = await assertMember(dependencies)
  const entry = await dependencies.repository.getEntry(input.entryId)
  if (!entry || entry.deletedAt || entry.householdId !== home._id) throw new FootprintDomainError('FOOTPRINT_NOT_FOUND')
  const [photos, profile, count] = await Promise.all([
    dependencies.repository.findLinkedMedia(entry.photoResourceIds || [], entry._id),
    dependencies.repository.getUser(entry.creatorKey),
    dependencies.repository.countActiveByPlace(home._id, entry.placeKey),
  ])
  const summary = safeEntry(entry, photos)
  return {
    status: 'LOADED', retryable: false,
    detail: { ...summary, photos: photos.map(safePhoto), creator: safeCreator(profile, entry.creatorKey === dependencies.identityKey, !home.memberKeys.includes(entry.creatorKey)), samePlaceCount: count },
  }
}

async function createEntry(input, dependencies) {
  validateCredential(input?.requestId)
  const home = await assertMember(dependencies, input.expectedHouseholdId)
  const opId = operationId(home._id, dependencies.identityKey, 'create', input.requestId)
  const existingOperation = await dependencies.repository.getOperation(opId)
  if (existingOperation?.entryId) {
    const existing = await dependencies.repository.getEntry(existingOperation.entryId)
    if (existing && !existing.deletedAt && existing.householdId === home._id) return { status: 'CREATED', retryable: false, entry: safeEntry(existing) }
    throw new FootprintDomainError('FOOTPRINT_NOT_FOUND')
  }
  const place = normalisePlace(input.place)
  const visitedAt = normaliseVisitedAt(input.visitedAt, dependencies.now())
  const memory = normaliseText(input.memory || '', MEMORY_MAX)
  const photoIds = normalisePhotoIds(input.photoResourceIds || [])
  if (dependencies.checkText && !(await dependencies.checkText(`${place.name}\n${place.address}\n${memory}`))) {
    throw new FootprintDomainError('FOOTPRINT_CONTENT_REJECTED')
  }
  const photos = await validatePhotos(photoIds, home._id, dependencies.identityKey, dependencies.repository)
  const now = dependencies.now().toISOString()
  const record = {
    _id: makeEntryId(), householdId: home._id, placeKey: placeKey(place), place, visitedAt, memory,
    photoResourceIds: photoIds,
    // 记录只保存资源编号和摘要，列表可直接展示首图信息；正式文件地址仍需成员身份换取。
    photoRefs: photos.map((photo) => ({ resourceId: photo._id, digest: photo.digest })),
    creatorKey: dependencies.identityKey, createdAt: now, updatedAt: now,
    editVersion: 1, deletedAt: null, deletedBy: null,
  }
  const committed = await dependencies.repository.createEntryWithOperation(record, {
    _id: opId, entryId: record._id, kind: 'create', createdAt: now,
  }, photos, dependencies.identityKey)
  return { status: 'CREATED', retryable: false, entry: safeEntry(committed) }
}

async function updateEntry(input, dependencies) {
  validateCredential(input?.operationToken)
  if (typeof input?.entryId !== 'string' || !ID_PATTERN.test(input.entryId)) throw new FootprintDomainError('FOOTPRINT_INVALID')
  if (!Number.isInteger(input.editVersion) || input.editVersion < 1) throw new FootprintDomainError('FOOTPRINT_INVALID')
  const home = await assertMember(dependencies, input.expectedHouseholdId)
  const opId = operationId(home._id, dependencies.identityKey, 'update', input.operationToken)
  const operation = await dependencies.repository.getOperation(opId)
  const existing = await dependencies.repository.getEntry(input.entryId)
  if (!existing || existing.deletedAt || existing.householdId !== home._id) throw new FootprintDomainError('FOOTPRINT_NOT_FOUND')
  // 超时重试先回查已提交凭证，再比较版本；成功的旧请求不应变成冲突。
  if (operation) {
    if (operation.entryId !== existing._id) throw new FootprintDomainError('FOOTPRINT_INVALID')
    return { status: 'UPDATED', retryable: false, entry: safeEntry(existing) }
  }
  if (existing.editVersion !== input.editVersion) throw new FootprintDomainError('FOOTPRINT_CONFLICT')
  const place = normalisePlace(input.place)
  const visitedAt = normaliseVisitedAt(input.visitedAt, dependencies.now())
  const memory = normaliseText(input.memory || '', MEMORY_MAX)
  const photoIds = normalisePhotoIds(input.photoResourceIds || [])
  if (dependencies.checkText && !(await dependencies.checkText(`${place.name}\n${place.address}\n${memory}`))) {
    throw new FootprintDomainError('FOOTPRINT_CONTENT_REJECTED')
  }
  const newPhotos = photoIds.filter((id) => !(existing.photoResourceIds || []).includes(id))
  const approvedPhotos = await validatePhotos(newPhotos, home._id, dependencies.identityKey, dependencies.repository)
  const now = dependencies.now().toISOString()
  const existingRefs = new Map((existing.photoRefs || []).map((photo) => [photo.resourceId, photo]))
  const approvedRefs = new Map(approvedPhotos.map((photo) => [photo._id, { resourceId: photo._id, digest: photo.digest }]))
  const photoRefs = photoIds.map((id) => approvedRefs.get(id) || existingRefs.get(id)).filter(Boolean)
  if (photoRefs.length !== photoIds.length) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
  const updates = { place, placeKey: placeKey(place), visitedAt, memory, photoResourceIds: photoIds, photoRefs, updatedAt: now, editVersion: existing.editVersion + 1 }
  const updated = await dependencies.repository.updateEntryVersioned(existing, updates, approvedPhotos, dependencies.identityKey, { _id: opId, entryId: existing._id, kind: 'update', createdAt: now })
  if (!updated) throw new FootprintDomainError('FOOTPRINT_CONFLICT')
  return { status: 'UPDATED', retryable: false, entry: safeEntry(updated) }
}

async function deleteEntry(input, dependencies) {
  validateCredential(input?.operationToken)
  if (typeof input?.entryId !== 'string' || !ID_PATTERN.test(input.entryId)) throw new FootprintDomainError('FOOTPRINT_INVALID')
  const home = await assertMember(dependencies)
  const existing = await dependencies.repository.getEntry(input.entryId)
  if (!existing || existing.householdId !== home._id) throw new FootprintDomainError('FOOTPRINT_NOT_FOUND')
  if (existing.deletedAt) return { status: 'DELETED', retryable: false, entryId: existing._id, deletedAt: existing.deletedAt }
  const deletedAt = dependencies.now().toISOString()
  const committedAt = await dependencies.repository.softDeleteEntry(existing, deletedAt, dependencies.identityKey)
  return { status: 'DELETED', retryable: false, entryId: existing._id, deletedAt: committedAt }
}

async function acknowledgeHistoryNotice(_input, dependencies) {
  await assertMember(dependencies)
  await dependencies.repository.acknowledgeHistoryNotice(dependencies.identityKey, dependencies.now().toISOString())
  return { status: 'ACKNOWLEDGED', retryable: false }
}

module.exports = {
  FootprintDomainError, normalisePlace, normaliseVisitedAt, placeKey, safeEntry,
  getSummary, getOverview, listEntries, listPlaces, getEntry, createEntry, updateEntry, deleteEntry, acknowledgeHistoryNotice,
}
