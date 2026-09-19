// 共同徒步领域规则：家庭归属、缺失资料、幂等保存和路线关联全部由云端决定。
const crypto = require('crypto')
const { FootprintDomainError, normalisePlace, normalisePhotoIds, validatePhotos } = require('./footprint-domain')

const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{16,128}$/
const ROUTE_ID_PATTERN = /^footroute_[a-f0-9]{32}$/
const makeEntryId = () => `footprint_${crypto.randomBytes(16).toString('hex')}`
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')

function text(value, max, required = false) {
  if (typeof value !== 'string') throw new FootprintDomainError('FOOTPRINT_INVALID')
  const result = value.normalize('NFKC').trim().replace(/[ \t]+/g, ' ')
  if ((required && !result) || [...result].length > max) throw new FootprintDomainError('FOOTPRINT_INVALID')
  return result
}

async function homeFor(dependencies, expectedHouseholdId) {
  const home = await dependencies.repository.findHouseholdByMember(dependencies.identityKey)
  if (!home?.memberKeys?.includes(dependencies.identityKey) || (expectedHouseholdId && expectedHouseholdId !== home._id)) throw new FootprintDomainError('NO_HOME')
  return home
}

function optionalDate(value, now) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FootprintDomainError('FOOTPRINT_INVALID')
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)
  if (value > today || value < '2000-01-01' || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new FootprintDomainError('FOOTPRINT_INVALID')
  return value
}

function optionalNumber(value, max) {
  if (value == null) return null
  if (!Number.isFinite(value) || value < 0 || value > max) throw new FootprintDomainError('FOOTPRINT_INVALID')
  return Number(value)
}

function routeDistance(route) {
  const radius = 6371008.8
  const radians = (value) => value * Math.PI / 180
  return route.segments.reduce((total, segment) => total + segment.points.slice(1).reduce((sum, point, index) => {
    const previous = segment.points[index]
    const lat = radians(point.latitude - previous.latitude); const lon = radians(point.longitude - previous.longitude)
    const a = Math.sin(lat / 2) ** 2 + Math.cos(radians(previous.latitude)) * Math.cos(radians(point.latitude)) * Math.sin(lon / 2) ** 2
    return sum + 2 * radius * Math.asin(Math.min(1, Math.sqrt(a)))
  }, 0), 0)
}

function routeElevation(route) {
  const trusted = route.segments.filter((segment) => segment.altitudeMode === 'absolute')
  const values = trusted.flatMap((segment) => segment.points.map((point) => point.altitude).filter(Number.isFinite))
  if (values.length < 2) return { elevationGainMeters: null, highestAltitudeMeters: null, lowestAltitudeMeters: null }
  let gain = 0
  for (const segment of trusted) {
    const altitudes = segment.points.map((point) => point.altitude).filter(Number.isFinite)
    for (let index = 1; index < altitudes.length; index += 1) {
      const delta = altitudes[index] - altitudes[index - 1]
      if (delta >= 3) gain += delta
    }
  }
  return { elevationGainMeters: Number(gain.toFixed(1)), highestAltitudeMeters: Math.max(...values), lowestAltitudeMeters: Math.min(...values) }
}

function safeHike(entry) {
  return { id: entry._id, entryKind: 'hike', name: entry.name, hikedAt: entry.hikedAt || null, place: entry.place || null, mapPoint: entry.mapPoint || null, memory: entry.memory || '', metrics: entry.metrics, hasRoute: Boolean(entry.routeResourceId), coverPhoto: entry.photoRefs?.[0] || null, createdAt: entry.createdAt, updatedAt: entry.updatedAt, editVersion: entry.editVersion }
}

async function listHikes(input, dependencies) {
  const home = await homeFor(dependencies)
  const pageSize = Math.min(100, Math.max(1, Number(input?.pageSize) || 20))
  const result = await dependencies.repository.listHikes(home._id, input?.cursor || null, pageSize)
  return { status: 'LISTED', retryable: false, entries: result.items, cursor: result.cursor }
}

async function getHike(input, dependencies) {
  if (typeof input?.entryId !== 'string' || !/^footprint_[a-f0-9]{32}$/.test(input.entryId)) throw new FootprintDomainError('FOOTPRINT_INVALID')
  const home = await homeFor(dependencies)
  const entry = await dependencies.repository.getEntry(input.entryId)
  if (!entry || entry.deletedAt || entry.entryKind !== 'hike' || entry.householdId !== home._id) throw new FootprintDomainError('FOOTPRINT_NOT_FOUND')
  const photos = await dependencies.repository.findLinkedMedia(entry.photoResourceIds || [], entry._id)
  return {
    status: 'LOADED',
    retryable: false,
    detail: {
      ...safeHike(entry),
      routeResourceId: entry.routeResourceId || null,
      photos: photos.map((photo) => ({ resourceId: photo._id, digest: photo.digest })),
    },
  }
}

async function createHike(input, dependencies) {
  if (typeof input?.requestId !== 'string' || !CREDENTIAL_PATTERN.test(input.requestId)) throw new FootprintDomainError('FOOTPRINT_INVALID')
  const home = await homeFor(dependencies, input.expectedHouseholdId)
  const operationId = `footop_${hash(`${home._id}:${dependencies.identityKey}:create-hike:${input.requestId}`)}`
  const previous = await dependencies.repository.getOperation(operationId)
  if (previous?.entryId) {
    const existing = await dependencies.repository.getEntry(previous.entryId)
    if (existing && !existing.deletedAt && existing.householdId === home._id) return { status: 'CREATED', retryable: false, entry: safeHike(existing) }
  }
  const routeId = input.routeResourceId == null ? null : input.routeResourceId
  if (routeId != null && (typeof routeId !== 'string' || !ROUTE_ID_PATTERN.test(routeId))) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
  const route = routeId ? await dependencies.repository.getRouteMedia(routeId) : null
  if (routeId && (!route || route.state !== 'approved' || route.ownerKey !== dependencies.identityKey || route.householdId !== home._id || !route.digest)) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
  const place = input.place == null ? null : normalisePlace(input.place)
  if (!route && !place) throw new FootprintDomainError('FOOTPRINT_INVALID')
  const name = text(input.name || '', 50, !route)
  const hikedAt = optionalDate(input.hikedAt, dependencies.now())
  const memory = text(input.memory || '', 300)
  const durationSeconds = optionalNumber(input.durationSeconds, 6_000_000)
  const manualDistance = optionalNumber(input.distanceMeters, 1_000_000)
  let distanceMeters = manualDistance
  let routeValue = null
  if (route) {
    const downloaded = await dependencies.storage.download(route.fileID)
    try { routeValue = JSON.parse(downloaded.fileContent.toString('utf8')) } catch { throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID') }
    distanceMeters = routeDistance(routeValue)
  }
  const elevation = routeValue ? routeElevation(routeValue) : { elevationGainMeters: null, highestAltitudeMeters: null, lowestAltitudeMeters: null }
  const metrics = { distanceMeters: distanceMeters == null ? null : Number(distanceMeters.toFixed(1)), durationSeconds, averageSpeedKmh: distanceMeters != null && durationSeconds > 0 ? Number(((distanceMeters / 1000) / (durationSeconds / 3600)).toFixed(2)) : null, ...elevation }
  if (dependencies.checkText && !(await dependencies.checkText(`${name}\n${place?.name || ''}\n${place?.address || ''}\n${memory}`))) throw new FootprintDomainError('FOOTPRINT_CONTENT_REJECTED')
  const now = dependencies.now().toISOString()
  const photoIds = normalisePhotoIds(input.photoResourceIds || [])
  const photos = await validatePhotos(photoIds, home._id, dependencies.identityKey, dependencies.repository)
  const firstRoutePoint = routeValue?.segments?.[0]?.points?.[0]
  const mapPoint = firstRoutePoint
    ? { latitude: firstRoutePoint.latitude, longitude: firstRoutePoint.longitude, source: 'route' }
    : place ? { latitude: place.latitude, longitude: place.longitude, source: 'place' } : null
  const record = { _id: makeEntryId(), householdId: home._id, entryKind: 'hike', name, hikedAt, sortDate: hikedAt || now.slice(0, 10), place, mapPoint, memory, metrics, routeResourceId: route?._id || null, routeDigest: route?.digest || null, routePointCount: route?.pointCount || 0, routeSegmentCount: route?.segmentCount || 0, photoResourceIds: photoIds, photoRefs: photos.map((photo) => ({ resourceId: photo._id, digest: photo.digest })), creatorKey: dependencies.identityKey, createdAt: now, updatedAt: now, editVersion: 1, deletedAt: null, deletedBy: null }
  const committed = await dependencies.repository.createEntryWithOperation(record, { _id: operationId, entryId: record._id, kind: 'create-hike', createdAt: now }, photos, dependencies.identityKey, route)
  return { status: 'CREATED', retryable: false, entry: safeHike(committed) }
}

async function updateHike(input, dependencies) {
  if (typeof input?.operationToken !== 'string' || !CREDENTIAL_PATTERN.test(input.operationToken)) throw new FootprintDomainError('FOOTPRINT_INVALID')
  if (typeof input?.entryId !== 'string' || !/^footprint_[a-f0-9]{32}$/.test(input.entryId) || !Number.isInteger(input.editVersion) || input.editVersion < 1) throw new FootprintDomainError('FOOTPRINT_INVALID')
  const home = await homeFor(dependencies, input.expectedHouseholdId)
  const operationId = `footop_${hash(`${home._id}:${dependencies.identityKey}:update-hike:${input.operationToken}`)}`
  const existing = await dependencies.repository.getEntry(input.entryId)
  if (!existing || existing.deletedAt || existing.entryKind !== 'hike' || existing.householdId !== home._id) throw new FootprintDomainError('FOOTPRINT_NOT_FOUND')
  const previous = await dependencies.repository.getOperation(operationId)
  if (previous) {
    if (previous.entryId !== existing._id) throw new FootprintDomainError('FOOTPRINT_INVALID')
    return { status: 'UPDATED', retryable: false, entry: safeHike(existing) }
  }
  if (existing.editVersion !== input.editVersion) throw new FootprintDomainError('FOOTPRINT_CONFLICT')

  const routeId = input.routeResourceId == null ? null : input.routeResourceId
  if (routeId != null && (typeof routeId !== 'string' || !ROUTE_ID_PATTERN.test(routeId))) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
  const route = routeId ? await dependencies.repository.getRouteMedia(routeId) : null
  const keepsRoute = Boolean(route && routeId === existing.routeResourceId && route.state === 'linked' && route.entryId === existing._id)
  const addsRoute = Boolean(route && route.state === 'approved' && route.ownerKey === dependencies.identityKey && route.householdId === home._id && route.digest)
  if (routeId && !keepsRoute && !addsRoute) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
  const place = input.place == null ? null : normalisePlace(input.place)
  if (!route && !place) throw new FootprintDomainError('FOOTPRINT_INVALID')
  const name = text(input.name || '', 50, !route)
  const hikedAt = optionalDate(input.hikedAt, dependencies.now())
  const memory = text(input.memory || '', 300)
  const durationSeconds = optionalNumber(input.durationSeconds, 6_000_000)
  const manualDistance = optionalNumber(input.distanceMeters, 1_000_000)
  let distanceMeters = manualDistance
  let routeValue = null
  if (route) {
    const downloaded = await dependencies.storage.download(route.fileID)
    try { routeValue = JSON.parse(downloaded.fileContent.toString('utf8')) } catch { throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID') }
    distanceMeters = routeDistance(routeValue)
  }
  const elevation = routeValue ? routeElevation(routeValue) : { elevationGainMeters: null, highestAltitudeMeters: null, lowestAltitudeMeters: null }
  const metrics = { distanceMeters: distanceMeters == null ? null : Number(distanceMeters.toFixed(1)), durationSeconds, averageSpeedKmh: distanceMeters != null && durationSeconds > 0 ? Number(((distanceMeters / 1000) / (durationSeconds / 3600)).toFixed(2)) : null, ...elevation }
  if (dependencies.checkText && !(await dependencies.checkText(`${name}\n${place?.name || ''}\n${place?.address || ''}\n${memory}`))) throw new FootprintDomainError('FOOTPRINT_CONTENT_REJECTED')
  const photoIds = normalisePhotoIds(input.photoResourceIds || [])
  const newPhotoIds = photoIds.filter((id) => !(existing.photoResourceIds || []).includes(id))
  const approvedPhotos = await validatePhotos(newPhotoIds, home._id, dependencies.identityKey, dependencies.repository)
  const existingRefs = new Map((existing.photoRefs || []).map((photo) => [photo.resourceId, photo]))
  const approvedRefs = new Map(approvedPhotos.map((photo) => [photo._id, { resourceId: photo._id, digest: photo.digest }]))
  const photoRefs = photoIds.map((id) => approvedRefs.get(id) || existingRefs.get(id)).filter(Boolean)
  if (photoRefs.length !== photoIds.length) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
  const now = dependencies.now().toISOString()
  const firstRoutePoint = routeValue?.segments?.[0]?.points?.[0]
  const mapPoint = firstRoutePoint
    ? { latitude: firstRoutePoint.latitude, longitude: firstRoutePoint.longitude, source: 'route' }
    : place ? { latitude: place.latitude, longitude: place.longitude, source: 'place' } : null
  const updates = {
    name, hikedAt, sortDate: hikedAt || existing.sortDate || now.slice(0, 10), place, mapPoint, memory, metrics,
    routeResourceId: route?._id || null, routeDigest: route?.digest || null,
    routePointCount: route?.pointCount || 0, routeSegmentCount: route?.segmentCount || 0,
    photoResourceIds: photoIds, photoRefs, updatedAt: now, editVersion: existing.editVersion + 1,
  }
  const updated = await dependencies.repository.updateEntryVersioned(
    existing,
    updates,
    approvedPhotos,
    dependencies.identityKey,
    { _id: operationId, entryId: existing._id, kind: 'update-hike', createdAt: now },
    addsRoute ? route : null,
  )
  if (!updated) throw new FootprintDomainError('FOOTPRINT_CONFLICT')
  return { status: 'UPDATED', retryable: false, entry: safeHike(updated) }
}

module.exports = { listHikes, getHike, createHike, updateHike, safeHike, routeDistance }
