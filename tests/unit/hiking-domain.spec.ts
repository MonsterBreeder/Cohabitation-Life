const hiking = require('../../cloudfunctions/footprint/hiking-domain')
const routes = require('../../cloudfunctions/footprint/footprint-route-media')

const home = { _id: 'home_a', memberKeys: ['user_a', 'user_b'] }
const baseInput = {
  requestId: 'hike_request_123456',
  expectedHouseholdId: 'home_a',
  name: '周末山路',
  hikedAt: '2026-09-10',
  place: { name: '白云山', address: '广州', latitude: 23.18, longitude: 113.3 },
  memory: '一起走到山顶',
  distanceMeters: 6000,
  durationSeconds: 7200,
  routeResourceId: null,
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const entries = new Map<string, any>()
  const operations = new Map<string, any>()
  const media = new Map<string, any>()
  const repository = {
    findHouseholdByMember: async () => home,
    getOperation: async (id: string) => operations.get(id) || null,
    getEntry: async (id: string) => entries.get(id) || null,
    getRouteMedia: async () => null,
    findMediaByIds: async (ids: string[]) => ids.map((id) => media.get(id)).filter(Boolean),
    findLinkedMedia: async (ids: string[], entryId: string) =>
      ids.map((id) => media.get(id)).filter((item) => item?.state === 'linked' && item.entryId === entryId),
    listHikes: async () => ({ items: [], cursor: null }),
    createEntryWithOperation: async (entry: any, operation: any, photos: any[]) => {
      entries.set(entry._id, entry)
      operations.set(operation._id, operation)
      photos.forEach((photo) => media.set(photo._id, { ...photo, state: 'linked', entryId: entry._id }))
      return entry
    },
    updateEntryVersioned: async (
      existing: any,
      updates: any,
      photos: any[],
      _actor: string,
      operation: any,
    ) => {
      const current = entries.get(existing._id)
      if (!current || current.editVersion !== existing.editVersion) return false
      const updated = { ...current, ...updates }
      entries.set(existing._id, updated)
      operations.set(operation._id, operation)
      photos.forEach((photo) => media.set(photo._id, { ...photo, state: 'linked', entryId: existing._id }))
      return updated
    },
  }
  return {
    identityKey: 'user_a',
    repository,
    media,
    now: () => new Date('2026-09-17T08:00:00.000Z'),
    checkText: async () => true,
    storage: { download: jest.fn() },
    ...overrides,
  }
}

describe('共同徒步云端规则', () => {
  it('无路线补录必须选择地点，并由云端计算平均速度', async () => {
    await expect(hiking.createHike({ ...baseInput, place: null }, dependencies())).rejects.toMatchObject({
      code: 'FOOTPRINT_INVALID',
    })
    const result = await hiking.createHike(baseInput, dependencies())
    expect(result.entry).toMatchObject({ entryKind: 'hike', name: '周末山路', hasRoute: false })
    expect(result.entry.metrics.averageSpeedKmh).toBe(3)
  })

  it('家庭编号不匹配时拒绝保存', async () => {
    await expect(
      hiking.createHike({ ...baseInput, expectedHouseholdId: 'home_b' }, dependencies()),
    ).rejects.toMatchObject({ code: 'NO_HOME' })
  })

  it('照片与代表点随同一条徒步保存，并能从详情读取', async () => {
    const context = dependencies()
    const photoId = `footphoto_${'a'.repeat(32)}`
    context.media.set(photoId, {
      _id: photoId,
      ownerKey: 'user_a',
      householdId: 'home_a',
      state: 'approved',
      digest: 'digest',
    })
    const created = await hiking.createHike({ ...baseInput, photoResourceIds: [photoId] }, context)
    expect(created.entry).toMatchObject({
      coverPhoto: { resourceId: photoId, digest: 'digest' },
      mapPoint: { latitude: 23.18, longitude: 113.3, source: 'place' },
    })
    const loaded = await hiking.getHike({ entryId: created.entry.id }, context)
    expect(loaded.detail.photos).toEqual([{ resourceId: photoId, digest: 'digest' }])
  })

  it('按版本更新同一条徒步，旧页面不能覆盖新内容', async () => {
    const context = dependencies()
    const created = await hiking.createHike(baseInput, context)
    const updateInput = {
      ...baseInput,
      requestId: undefined,
      entryId: created.entry.id,
      editVersion: 1,
      operationToken: 'hike_update_123456',
      name: '更新后的山路',
      photoResourceIds: [],
    }
    const updated = await hiking.updateHike(updateInput, context)
    expect(updated.entry).toMatchObject({ name: '更新后的山路', editVersion: 2 })
    await expect(
      hiking.updateHike({ ...updateInput, operationToken: 'hike_update_654321' }, context),
    ).rejects.toMatchObject({ code: 'FOOTPRINT_CONFLICT' })
  })

  it('云端规范化路线并拒绝越界坐标', () => {
    const accepted = routes.normaliseRoute({
      version: 1,
      source: 'kml',
      segments: [
        {
          altitudeMode: 'absolute',
          points: [
            { latitude: 23, longitude: 113 },
            { latitude: 23.1, longitude: 113.1 },
          ],
        },
      ],
    })
    expect(accepted).toMatchObject({ pointCount: 2, segmentCount: 1 })
    expect(() =>
      routes.normaliseRoute({
        version: 1,
        source: 'kml',
        segments: [
          {
            points: [
              { latitude: 99, longitude: 113 },
              { latitude: 23, longitude: 113 },
            ],
          },
        ],
      }),
    ).toThrow()
  })

  it('路线审核回执丢失后重试会返回同一结果', async () => {
    const routeId = `footroute_${'a'.repeat(32)}`
    const storage = { download: jest.fn() }
    const result = await routes.reviewRoute(
      { resourceId: routeId },
      {
        identityKey: 'user_a',
        now: () => new Date('2026-09-17T08:00:00Z'),
        repository: {
          findHouseholdByMember: async () => home,
          getRouteMedia: async () => ({
            _id: routeId,
            ownerKey: 'user_a',
            householdId: 'home_a',
            state: 'approved',
            expiresAt: '2026-09-17T10:00:00Z',
            digest: 'digest',
            pointCount: 2,
            segmentCount: 1,
          }),
        },
        storage,
      },
    )
    expect(result).toMatchObject({ status: 'APPROVED', digest: 'digest' })
    expect(storage.download).not.toHaveBeenCalled()
  })
})
