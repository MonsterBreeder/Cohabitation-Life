// 私有路线资源：客户端只上传规范 JSON，云端重新校验后才能与共同记录关联。
const crypto = require('crypto')
const { FootprintDomainError } = require('./footprint-domain')

const ROUTE_ID_PATTERN = /^footroute_[a-f0-9]{32}$/
const MAX_ROUTE_BYTES = 5 * 1024 * 1024
const makeRouteId = () => `footroute_${crypto.randomBytes(16).toString('hex')}`

async function currentHome(dependencies) {
  const home = await dependencies.repository.findHouseholdByMember(dependencies.identityKey)
  if (!home?.memberKeys?.includes(dependencies.identityKey)) throw new FootprintDomainError('NO_HOME')
  return home
}

function normaliseRoute(value) {
  if (!value || value.version !== 1 || !['kml', 'tracking'].includes(value.source) || !Array.isArray(value.segments) || value.segments.length < 1 || value.segments.length > 100) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
  let pointCount = 0
  const segments = value.segments.map((segment) => {
    if (!segment || !Array.isArray(segment.points) || segment.points.length < 2) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
    pointCount += segment.points.length
    const points = segment.points.map((point) => {
      if (!point || !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 || !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180 || (point.altitude !== undefined && !Number.isFinite(point.altitude))) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
      return { latitude: Number(point.latitude.toFixed(7)), longitude: Number(point.longitude.toFixed(7)), ...(point.altitude === undefined ? {} : { altitude: Number(point.altitude.toFixed(1)) }) }
    })
    return { altitudeMode: segment.altitudeMode === 'absolute' ? 'absolute' : 'untrusted', points }
  })
  if (pointCount > 20000) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
  return { route: { version: 1, source: value.source, segments }, pointCount, segmentCount: segments.length }
}

async function prepareRoute(_input, dependencies) {
  const home = await currentHome(dependencies)
  const id = makeRouteId()
  const cloudPath = `footprint-routes/${dependencies.ownerHash}/${id}.json`
  const fileID = await dependencies.storage.resolveFileID(cloudPath)
  const now = dependencies.now().toISOString()
  const record = { _id: id, householdId: home._id, ownerKey: dependencies.identityKey, cloudPath, fileID, state: 'prepared', createdAt: now, updatedAt: now, expiresAt: dependencies.expiry().toISOString(), entryId: null }
  await dependencies.repository.reserveRouteMedia(record)
  return { status: 'PREPARED', retryable: false, resourceId: id, cloudPath }
}

async function reviewRoute(input, dependencies) {
  if (typeof input?.resourceId !== 'string' || !ROUTE_ID_PATTERN.test(input.resourceId)) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
  const home = await currentHome(dependencies)
  const record = await dependencies.repository.getRouteMedia(input.resourceId)
  if (!record || record.ownerKey !== dependencies.identityKey || record.householdId !== home._id || record.expiresAt <= dependencies.now().toISOString()) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
  // 审核回执丢失时直接返回同一摘要，重试不能把已经批准的路线误判为坏文件。
  if (record.state === 'approved') {
    return { status: 'APPROVED', retryable: false, resourceId: record._id, digest: record.digest, pointCount: record.pointCount, segmentCount: record.segmentCount }
  }
  if (record.state !== 'prepared') throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
  const downloaded = await dependencies.storage.download(record.fileID)
  const buffer = downloaded?.fileContent
  if (!Buffer.isBuffer(buffer) || buffer.length < 2 || buffer.length > MAX_ROUTE_BYTES) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
  let parsed
  try { parsed = JSON.parse(buffer.toString('utf8')) } catch { throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID') }
  const normalised = normaliseRoute(parsed)
  // 重新序列化并覆盖上传文件，确保保存的是云端认可的白名单结构。
  const canonical = Buffer.from(JSON.stringify(normalised.route))
  const digest = crypto.createHash('sha256').update(canonical).digest('hex')
  await dependencies.storage.upload(record.cloudPath, canonical)
  const now = dependencies.now().toISOString()
  await dependencies.repository.updateRouteMedia(record._id, { state: 'approved', digest, byteSize: canonical.length, pointCount: normalised.pointCount, segmentCount: normalised.segmentCount, updatedAt: now })
  return { status: 'APPROVED', retryable: false, resourceId: record._id, digest, pointCount: normalised.pointCount, segmentCount: normalised.segmentCount }
}

async function getRouteUrl(input, dependencies) {
  if (typeof input?.resourceId !== 'string' || !ROUTE_ID_PATTERN.test(input.resourceId)) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
  const home = await currentHome(dependencies)
  const route = await dependencies.repository.findVisibleRoute(input.resourceId, home._id)
  if (!route) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
  const urls = await dependencies.storage.tempUrls([route.fileID])
  const url = urls[route.fileID]
  if (!url) throw new FootprintDomainError('TEMPORARY_FAILURE', true)
  return { status: 'LOADED', retryable: false, resourceId: route._id, digest: route.digest, url }
}

async function abandonRoute(input, dependencies) {
  if (typeof input?.resourceId !== 'string' || !ROUTE_ID_PATTERN.test(input.resourceId)) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
  await currentHome(dependencies)
  await dependencies.repository.abandonRouteMedia(input.resourceId, dependencies.identityKey, dependencies.now().toISOString())
  return { status: 'ABANDONED', retryable: false }
}

module.exports = { prepareRoute, reviewRoute, getRouteUrl, abandonRoute, normaliseRoute }
