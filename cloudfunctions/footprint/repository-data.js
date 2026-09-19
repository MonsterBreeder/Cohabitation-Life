// 云数据库适配层：所有集合只允许云函数访问，页面不能绕过家庭权限直接查询。
const crypto = require('crypto')
const { FootprintDomainError } = require('./footprint-domain')
function withoutId(record) { const { _id, ...data } = record; return data }

// 游标记录稳定排序键，不使用容易被新增、删除挤动的偏移量。
function encodeCursor(value) { return Buffer.from(JSON.stringify(value)).toString('base64url') }
function decodeCursor(cursor, kind) {
  if (cursor == null) return null
  try {
    if (typeof cursor !== 'string' || cursor.length > 600 || !/^[\w-]+$/.test(cursor)) throw new Error()
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString())
    if (value.kind !== kind || typeof value.id !== 'string') throw new Error()
    if (kind === 'places' && !/^[a-f0-9]{64}$/.test(value.id)) throw new Error()
    if (kind === 'entries' && (!/^footprint_[a-f0-9]{32}$/.test(value.id) || !/^\d{4}-\d{2}-\d{2}$/.test(value.visitedAt) || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value.createdAt))) throw new Error()
    if (kind === 'timeline' && (!/^footprint_[a-f0-9]{32}$/.test(value.id) || !/^\d{4}-\d{2}-\d{2}$/.test(value.sortDate) || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value.createdAt))) throw new Error()
    if (kind === 'hikes' && (!/^footprint_[a-f0-9]{32}$/.test(value.id) || !/^\d{4}-\d{2}-\d{2}$/.test(value.sortDate) || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value.createdAt))) throw new Error()
    return value
  } catch { throw new FootprintDomainError('FOOTPRINT_INVALID') }
}

/** 两种记录共用日期、创建时间和编号三段排序，保证下一页从最后一条之后继续。 */
function mergeTimelineRows(placeRows, hikeRows, limit) {
  const combined = [
    ...placeRows.map((item) => ({ raw: item, summary: toSummary(item), sortDate: item.visitedAt })),
    ...hikeRows.map((item) => ({ raw: item, summary: toHikeSummary(item), sortDate: item.sortDate })),
  ].sort((left, right) => right.sortDate.localeCompare(left.sortDate)
    || right.raw.createdAt.localeCompare(left.raw.createdAt)
    || right.raw._id.localeCompare(left.raw._id))
  const page = combined.slice(0, limit)
  const last = page[page.length - 1]
  return {
    items: page.map((item) => item.summary),
    cursor: combined.length > limit
      ? encodeCursor({ kind: 'timeline', id: last.raw._id, sortDate: last.sortDate, createdAt: last.raw.createdAt })
      : null,
  }
}

function createRepository(db) {
  const _ = db.command
  const $ = db.command.aggregate
  const entries = db.collection('footprintEntries')
  const media = db.collection('footprintMedia')
  const routeMedia = db.collection('footprintRouteMedia')
  const operations = db.collection('footprintOperations')

  const get = async (collection, id) => {
    try { return (await collection.doc(id).get()).data || null } catch (error) {
      // 连接故障不能伪装成“记录不存在”，否则会绕过幂等检查。
      if (/document.*(?:not exist|not found)|DOCUMENT_NOT_EXIST/i.test(error.message || error.errMsg || '')) return null
      throw error
    }
  }

  async function checkMember(transaction, householdId, actor) {
    const home = await get(transaction.collection('households'), householdId)
    if (!home?.memberKeys?.includes(actor)) throw new FootprintDomainError('NO_HOME')
  }
  async function checkPhotos(transaction, photos, householdId, actor, at) {
    for (const photo of photos) {
      const current = await get(transaction.collection('footprintMedia'), photo._id)
      if (!current || current.state !== 'approved' || current.ownerKey !== actor || current.householdId !== householdId || current.expiresAt <= at || current.digest !== photo.digest) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
    }
  }

  return {
    findHouseholdByMember: async (identityKey) => {
      const result = await db.collection('households').where({ memberKeys: _.all([identityKey]) }).limit(2).get()
      return result.data.length === 1 ? result.data[0] : null
    },
    getMembershipLock: (identityKey) => get(db.collection('householdCreationLocks'), `create_${crypto.createHash('sha256').update(identityKey).digest('hex')}`),
    acknowledgeHistoryNotice: (identityKey, at) => db.collection('householdCreationLocks').doc(`create_${crypto.createHash('sha256').update(identityKey).digest('hex')}`).update({ data: { footprintHistoryNoticeAcknowledgedAt: at } }),
    getUser: (id) => get(db.collection('users'), id),
    getEntry: (id) => get(entries, id),
    getOperation: (id) => get(operations, id),
    hasEntryCreatedBefore: async (householdId, at) => (await entries.where({ householdId, deletedAt: null, createdAt: _.lt(at) }).limit(1).get()).data.length > 0,
    countActiveByPlace: async (householdId, placeKey) => (await entries.where({ householdId, placeKey, deletedAt: null }).count()).total,
    getSummary: async (householdId) => {
      // 只有具有 placeKey 的地点足迹参与地点数量；徒步不会伪装成“去过一个地方”。
      const grouped = await entries.aggregate().match({ householdId, deletedAt: null, placeKey: _.exists(true) }).group({ _id: '$placeKey' }).count('placeCount').end()
      const latest = await entries.where({ householdId, deletedAt: null, placeKey: _.exists(true) }).orderBy('visitedAt', 'desc').orderBy('createdAt', 'desc').orderBy('_id', 'desc').limit(1).get()
      // 微信 SDK 的聚合输出字段是 list；只有普通 get 查询返回 data。
      return { placeCount: grouped.list[0]?.placeCount || 0, latestEntry: latest.data[0] ? toSummary(latest.data[0]) : null }
    },
    listEntries: async (householdId, cursor, limit, requestedPlaceKey) => {
      const where = { householdId, deletedAt: null, placeKey: _.exists(true) }
      if (requestedPlaceKey) where.placeKey = requestedPlaceKey
      const after = decodeCursor(cursor, 'entries')
      const filter = after ? _.and([where, _.or([
        { visitedAt: _.lt(after.visitedAt) },
        { visitedAt: after.visitedAt, createdAt: _.lt(after.createdAt) },
        { visitedAt: after.visitedAt, createdAt: after.createdAt, _id: _.lt(after.id) },
      ])]) : where
      const result = await entries.where(filter).orderBy('visitedAt', 'desc').orderBy('createdAt', 'desc').orderBy('_id', 'desc').limit(limit + 1).get()
      const page = result.data.slice(0, limit)
      const last = page[page.length - 1]
      return { items: page.map(toSummary), cursor: result.data.length > limit ? encodeCursor({ kind: 'entries', id: last._id, visitedAt: last.visitedAt, createdAt: last.createdAt }) : null }
    },
    listTimelineEntries: async (householdId, cursor, limit) => {
      const after = decodeCursor(cursor, 'timeline')
      // 地点和徒步各自按同一组三段排序键取数，再在云端合并，避免分页时跳过未展示记录。
      const placeWhere = { householdId, deletedAt: null, placeKey: _.exists(true) }
      const hikeWhere = { householdId, deletedAt: null, entryKind: 'hike' }
      const placeFilter = after ? _.and([placeWhere, _.or([
        { visitedAt: _.lt(after.sortDate) },
        { visitedAt: after.sortDate, createdAt: _.lt(after.createdAt) },
        { visitedAt: after.sortDate, createdAt: after.createdAt, _id: _.lt(after.id) },
      ])]) : placeWhere
      const hikeFilter = after ? _.and([hikeWhere, _.or([
        { sortDate: _.lt(after.sortDate) },
        { sortDate: after.sortDate, createdAt: _.lt(after.createdAt) },
        { sortDate: after.sortDate, createdAt: after.createdAt, _id: _.lt(after.id) },
      ])]) : hikeWhere
      const [placesResult, hikesResult] = await Promise.all([
        entries.where(placeFilter).orderBy('visitedAt', 'desc').orderBy('createdAt', 'desc').orderBy('_id', 'desc').limit(limit + 1).get(),
        entries.where(hikeFilter).orderBy('sortDate', 'desc').orderBy('createdAt', 'desc').orderBy('_id', 'desc').limit(limit + 1).get(),
      ])
      return mergeTimelineRows(placesResult.data, hikesResult.data, limit)
    },
    listPlaces: async (householdId, cursor, limit) => {
      const after = decodeCursor(cursor, 'places')
      const result = await entries.aggregate().match({ householdId, deletedAt: null, placeKey: after ? _.gt(after.id) : _.exists(true) }).sort({ visitedAt: -1, createdAt: -1, _id: -1 }).group({
        _id: '$placeKey', place: $.first('$place'), visitCount: $.sum(1), latestEntry: $.first('$$ROOT'),
      }).sort({ _id: 1 }).limit(limit + 1).end()
      // 分页与映射都读取微信聚合 list，空集合也必须返回可用的空地点列表。
      return { items: result.list.slice(0, limit).map((item) => ({ placeKey: item._id, place: item.place, visitCount: item.visitCount, latestEntry: toSummary(item.latestEntry) })), cursor: result.list.length > limit ? encodeCursor({ kind: 'places', id: result.list[limit - 1]._id }) : null }
    },
    findMediaByIds: async (ids) => ids.length ? (await media.where({ _id: _.in(ids) }).limit(3).get()).data : [],
    findLinkedMedia: async (ids, entryId) => ids.length ? (await media.where({ _id: _.in(ids), entryId, state: 'linked' }).limit(3).get()).data.sort((a, b) => ids.indexOf(a._id) - ids.indexOf(b._id)) : [],
    listHikes: async (householdId, cursor = null, limit = 20) => {
      const where = { householdId, entryKind: 'hike', deletedAt: null }
      const after = decodeCursor(cursor, 'hikes')
      const filter = after ? _.and([where, _.or([
        { sortDate: _.lt(after.sortDate) },
        { sortDate: after.sortDate, createdAt: _.lt(after.createdAt) },
        { sortDate: after.sortDate, createdAt: after.createdAt, _id: _.lt(after.id) },
      ])]) : where
      const result = await entries.where(filter).orderBy('sortDate', 'desc').orderBy('createdAt', 'desc').orderBy('_id', 'desc').limit(limit + 1).get()
      const page = result.data.slice(0, limit)
      const last = page[page.length - 1]
      return {
        items: page.map(toHikeSummary),
        cursor: result.data.length > limit
          ? encodeCursor({ kind: 'hikes', id: last._id, sortDate: last.sortDate, createdAt: last.createdAt })
          : null,
      }
    },
    createEntryWithOperation: (entry, operation, photos, actor, route = null) => db.runTransaction(async (transaction) => {
      await checkMember(transaction, entry.householdId, actor)
      const previous = await get(transaction.collection('footprintOperations'), operation._id)
      if (previous) {
        const committed = await get(transaction.collection('footprintEntries'), previous.entryId)
        if (!committed || committed.deletedAt) throw new FootprintDomainError('FOOTPRINT_NOT_FOUND')
        return committed
      }
      await checkPhotos(transaction, photos, entry.householdId, actor, entry.createdAt)
      if (route) {
        const currentRoute = await get(transaction.collection('footprintRouteMedia'), route._id)
        if (!currentRoute || currentRoute.state !== 'approved' || currentRoute.ownerKey !== actor || currentRoute.householdId !== entry.householdId || currentRoute.expiresAt <= entry.createdAt || currentRoute.digest !== route.digest) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
      }
      await transaction.collection('footprintEntries').doc(entry._id).set({ data: withoutId(entry) })
      await transaction.collection('footprintOperations').doc(operation._id).set({ data: withoutId(operation) })
      for (const photo of photos) await transaction.collection('footprintMedia').doc(photo._id).update({ data: { state: 'linked', entryId: entry._id, linkedAt: entry.createdAt, expiresAt: null } })
      if (route) await transaction.collection('footprintRouteMedia').doc(route._id).update({ data: { state: 'linked', entryId: entry._id, linkedAt: entry.createdAt, expiresAt: null } })
      return entry
    }),
    updateEntryVersioned: async (existing, updates, newPhotos, actor, operation, newRoute = null) => db.runTransaction(async (transaction) => {
      await checkMember(transaction, existing.householdId, actor)
      const current = await get(transaction.collection('footprintEntries'), existing._id)
      const previous = await get(transaction.collection('footprintOperations'), operation._id)
      if (previous) {
        if (previous.entryId !== existing._id) throw new FootprintDomainError('FOOTPRINT_INVALID')
        if (!current || current.deletedAt) throw new FootprintDomainError('FOOTPRINT_NOT_FOUND')
        return current
      }
      if (!current || current.editVersion !== existing.editVersion || current.deletedAt) return false
      await checkPhotos(transaction, newPhotos, existing.householdId, actor, updates.updatedAt)
      if (newRoute) {
        const currentRoute = await get(transaction.collection('footprintRouteMedia'), newRoute._id)
        if (!currentRoute || currentRoute.state !== 'approved' || currentRoute.ownerKey !== actor || currentRoute.householdId !== existing.householdId || currentRoute.expiresAt <= updates.updatedAt || currentRoute.digest !== newRoute.digest) throw new FootprintDomainError('FOOTPRINT_ROUTE_INVALID')
      }
      await transaction.collection('footprintEntries').doc(existing._id).update({ data: updates })
      const removed = (current.photoResourceIds || []).filter((id) => !updates.photoResourceIds.includes(id))
      for (const id of removed) await transaction.collection('footprintMedia').doc(id).update({ data: { state: 'detached', detachedAt: updates.updatedAt, expiresAt: updates.updatedAt, entryId: null } })
      for (const photo of newPhotos) await transaction.collection('footprintMedia').doc(photo._id).update({ data: { state: 'linked', entryId: existing._id, linkedAt: updates.updatedAt, expiresAt: null } })
      // 只有徒步更新会显式携带路线字段；普通地点编辑不能误动路线资源。
      if (Object.hasOwn(updates, 'routeResourceId') && current.routeResourceId !== updates.routeResourceId) {
        if (current.routeResourceId) await transaction.collection('footprintRouteMedia').doc(current.routeResourceId).update({ data: { state: 'detached', detachedAt: updates.updatedAt, expiresAt: updates.updatedAt, entryId: null } })
        if (newRoute) await transaction.collection('footprintRouteMedia').doc(newRoute._id).update({ data: { state: 'linked', entryId: existing._id, linkedAt: updates.updatedAt, expiresAt: null } })
      }
      await transaction.collection('footprintOperations').doc(operation._id).set({ data: withoutId(operation) })
      return { ...current, ...updates }
    }),
    softDeleteEntry: (entry, deletedAt, deletedBy) => db.runTransaction(async (transaction) => {
      await checkMember(transaction, entry.householdId, deletedBy)
      const current = await get(transaction.collection('footprintEntries'), entry._id)
      if (!current) throw new FootprintDomainError('FOOTPRINT_NOT_FOUND')
      if (current.deletedAt) return current.deletedAt
      await transaction.collection('footprintEntries').doc(entry._id).update({ data: { deletedAt, deletedBy, updatedAt: deletedAt, editVersion: _.inc(1) } })
      // 删除使用事务内最新照片，避免漏掉另一位成员刚补充的照片。
      for (const id of current.photoResourceIds || []) await transaction.collection('footprintMedia').doc(id).update({ data: { state: 'deleted', expiresAt: new Date(new Date(deletedAt).getTime() + 30 * 86400000).toISOString() } })
      if (current.routeResourceId) await transaction.collection('footprintRouteMedia').doc(current.routeResourceId).update({ data: { state: 'deleted', expiresAt: new Date(new Date(deletedAt).getTime() + 30 * 86400000).toISOString() } })
      return deletedAt
    }),
    createMedia: (record) => media.doc(record._id).set({ data: withoutId(record) }),
    // 同一成员共享一个预约锁，额度检查和预约写入同一事务，阻止并发突破限制。
    reserveMedia: (record) => db.runTransaction(async (transaction) => {
      await checkMember(transaction, record.householdId, record.ownerKey)
      const lockId = `upload_${crypto.createHash('sha256').update(record.ownerKey).digest('hex')}`
      const lockCollection = transaction.collection('footprintUploadLocks')
      const lock = await get(lockCollection, lockId)
      const since = new Date(new Date(record.createdAt).getTime() - 86400000).toISOString()
      const recent = (lock?.recent || []).filter((item) => item.at > since)
      if (recent.length >= 30) throw new FootprintDomainError('FOOTPRINT_RATE_LIMITED', true)
      let pending = 0
      for (const item of recent) {
        const reserved = await get(transaction.collection('footprintMedia'), item.id)
        if (reserved && ['prepared', 'reviewing', 'approved'].includes(reserved.state) && reserved.expiresAt > record.createdAt) pending += 1
      }
      if (pending >= 6) throw new FootprintDomainError('FOOTPRINT_RATE_LIMITED', true)
      await transaction.collection('footprintMedia').doc(record._id).set({ data: withoutId(record) })
      await lockCollection.doc(lockId).set({ data: { recent: [...recent, { id: record._id, at: record.createdAt }] } })
    }),
    // 审核租约避免两个重试同时写正式文件；失败可重试，过期资源不可复活。
    claimMediaReview: (id, actor, at) => db.runTransaction(async (transaction) => {
      const current = await get(transaction.collection('footprintMedia'), id)
      if (!current || current.ownerKey !== actor) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
      await checkMember(transaction, current.householdId, actor)
      if (current.state === 'approved' || current.state === 'linked') return current
      if (current.expiresAt <= at || !['prepared', 'reviewing'].includes(current.state)) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
      if (current.state === 'reviewing' && current.reviewLeaseUntil > at) throw new FootprintDomainError('TEMPORARY_FAILURE', true)
      const lease = crypto.randomBytes(16).toString('hex')
      await transaction.collection('footprintMedia').doc(id).update({ data: { state: 'reviewing', reviewLease: lease, reviewLeaseUntil: new Date(new Date(at).getTime() + 60000).toISOString() } })
      return { ...current, state: 'reviewing', reviewLease: lease }
    }),
    finishMediaReview: (id, lease, data, actor) => db.runTransaction(async (transaction) => {
      const current = await get(transaction.collection('footprintMedia'), id)
      if (!current || current.state !== 'reviewing' || current.reviewLease !== lease) throw new FootprintDomainError('FOOTPRINT_MEDIA_INVALID')
      await checkMember(transaction, current.householdId, actor)
      await transaction.collection('footprintMedia').doc(id).update({ data: { ...data, reviewLeaseUntil: null } })
    }),
    abandonMedia: (ids, actor, at) => db.runTransaction(async (transaction) => {
      for (const id of ids) {
        const item = await get(transaction.collection('footprintMedia'), id)
        // 已关联照片只能随编辑/删除处理，放弃草稿不能删除已经保存的记录照片。
        if (item?.ownerKey === actor && ['prepared', 'approved'].includes(item.state)) await transaction.collection('footprintMedia').doc(id).update({ data: { state: 'detached', expiresAt: at } })
      }
    }),
    getMedia: (id) => get(media, id),
    updateMedia: (id, data) => media.doc(id).update({ data }),
    countRecentMedia: async (identityKey, since) => (await media.where({ ownerKey: identityKey, createdAt: _.gte(since.toISOString()) }).count()).total,
    countPendingMedia: async (identityKey) => (await media.where({ ownerKey: identityKey, state: _.in(['prepared', 'approved']) }).count()).total,
    findVisibleMedia: async (ids, householdId) => {
      const candidates = ids.length ? (await media.where({ _id: _.in(ids), householdId, state: 'linked' }).limit(6).get()).data : []
      const visible = []
      for (const item of candidates) {
        const entry = await get(entries, item.entryId)
        if (entry && !entry.deletedAt && entry.householdId === householdId && entry.photoResourceIds?.includes(item._id)) visible.push(item)
      }
      return visible
    },
    getRouteMedia: (id) => get(routeMedia, id),
    reserveRouteMedia: (record) => db.runTransaction(async (transaction) => {
      await checkMember(transaction, record.householdId, record.ownerKey)
      const lockId = `route_${crypto.createHash('sha256').update(record.ownerKey).digest('hex')}`
      const locks = transaction.collection('footprintRouteUploadLocks')
      const lock = await get(locks, lockId)
      const since = new Date(new Date(record.createdAt).getTime() - 86400000).toISOString()
      const recent = (lock?.recent || []).filter((item) => item.at > since)
      if (recent.length >= 10) throw new FootprintDomainError('FOOTPRINT_ROUTE_RATE_LIMITED', true)
      let pending = 0
      for (const item of recent) {
        const current = await get(transaction.collection('footprintRouteMedia'), item.id)
        if (current && ['prepared', 'approved'].includes(current.state) && current.expiresAt > record.createdAt) pending += 1
      }
      if (pending >= 3) throw new FootprintDomainError('FOOTPRINT_ROUTE_RATE_LIMITED', true)
      await transaction.collection('footprintRouteMedia').doc(record._id).set({ data: withoutId(record) })
      await locks.doc(lockId).set({ data: { recent: [...recent, { id: record._id, at: record.createdAt }] } })
    }),
    updateRouteMedia: (id, data) => routeMedia.doc(id).update({ data }),
    abandonRouteMedia: (id, actor, at) => db.runTransaction(async (transaction) => {
      const route = await get(transaction.collection('footprintRouteMedia'), id)
      // 已关联路线只能随记录删除或替换，页面离开不能误删共同记录。
      if (route?.ownerKey === actor && ['prepared', 'approved'].includes(route.state)) await transaction.collection('footprintRouteMedia').doc(id).update({ data: { state: 'detached', expiresAt: at } })
    }),
    findVisibleRoute: async (id, householdId) => {
      const route = await get(routeMedia, id)
      if (!route || route.householdId !== householdId || route.state !== 'linked') return null
      const entry = await get(entries, route.entryId)
      return entry && !entry.deletedAt && entry.householdId === householdId && entry.routeResourceId === id ? route : null
    },
  }
}

function toSummary(entry) {
  const cover = entry.photoRefs?.[0] || entry.coverPhoto || null
  return { id: entry._id, placeKey: entry.placeKey, place: entry.place, visitedAt: entry.visitedAt, memory: entry.memory, coverPhoto: cover, createdAt: entry.createdAt, updatedAt: entry.updatedAt, editVersion: entry.editVersion }
}

function toHikeSummary(entry) {
  return {
    id: entry._id, entryKind: 'hike', name: entry.name, hikedAt: entry.hikedAt || null, place: entry.place || null,
    mapPoint: entry.mapPoint || null,
    memory: entry.memory || '', metrics: entry.metrics, hasRoute: Boolean(entry.routeResourceId),
    coverPhoto: entry.photoRefs?.[0] || null,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt, editVersion: entry.editVersion,
  }
}

module.exports = { createRepository, withoutId, toSummary, toHikeSummary, mergeTimelineRows, encodeCursor, decodeCursor }
