const {
  FootprintDomainError,
  createEntry,
  updateEntry,
  deleteEntry,
  getEntry,
  getOverview,
  placeKey,
  normalisePlace,
} = require('../../cloudfunctions/footprint/footprint-domain')

function fixture() {
  const home = { _id: 'home_12345678', memberKeys: ['user_a', 'user_b'] }
  const entries = new Map<string, any>()
  const operations = new Map<string, any>()
  const media = new Map<string, any>()
  const repository = {
    findHouseholdByMember: async (identityKey: string) => home.memberKeys.includes(identityKey) ? home : null,
    getOperation: async (id: string) => operations.get(id) || null,
    getEntry: async (id: string) => entries.get(id) || null,
    findMediaByIds: async (ids: string[]) => ids.map((id) => media.get(id)).filter(Boolean),
    createEntryWithOperation: async (entry: any, operation: any, photos: any[]) => {
      // 内存适配遵守事务写入返回最终记录的约定。
      const previous = operations.get(operation._id)
      if (previous) return entries.get(previous.entryId)
      entries.set(entry._id, structuredClone(entry)); operations.set(operation._id, structuredClone(operation))
      photos.forEach((photo) => media.set(photo._id, { ...photo, state: 'linked', entryId: entry._id }))
      return entry
    },
    updateEntryVersioned: async (existing: any, updates: any, _photos: any[], _actor: string, operation: any) => {
      const current = entries.get(existing._id)
      if (!current || current.editVersion !== existing.editVersion) return false
      const record = { ...current, ...structuredClone(updates) }
      entries.set(existing._id, record); operations.set(operation._id, operation); return record
    },
    softDeleteEntry: async (entry: any, deletedAt: string, deletedBy: string) => { entries.set(entry._id, { ...entry, deletedAt, deletedBy }); return deletedAt },
    getUser: async (id: string) => ({ nickname: id === 'user_a' ? '小红' : '小蓝', avatar: { kind: 'builtin', id: 'person-neutral' } }),
    findLinkedMedia: async (ids: string[], entryId: string) => ids.map((id) => media.get(id)).filter((item) => item?.entryId === entryId),
    countActiveByPlace: async (_homeId: string, key: string) => [...entries.values()].filter((item) => !item.deletedAt && item.placeKey === key).length,
    getSummary: async () => ({ placeCount: 0, latestEntry: null }),
    listPlaces: async () => ({ items: [], cursor: null }),
    listEntries: async () => ({ items: [], cursor: null }),
    getMembershipLock: async () => ({ createdAt: '2026-01-01T00:00:00.000Z' }),
    hasEntryCreatedBefore: async () => false,
    acknowledgeHistoryNotice: async () => undefined,
  }
  const dependencies = { identityKey: 'user_a', repository, now: () => new Date('2026-09-02T08:00:00.000Z'), checkText: async () => true }
  return { home, entries, operations, media, repository, dependencies }
}

const requestId = 'request_1234567890'
const operationToken = 'operation_1234567890'
const place = { name: '广州塔', address: '广州市海珠区', latitude: 23.1064, longitude: 113.3246 }

describe('footprint domain', () => {
  it('builds a stable place key and keeps different addresses separate', () => {
    expect(placeKey(normalisePlace(place))).toBe(placeKey(normalisePlace({ ...place, name: ' 广州塔 ' })))
    expect(placeKey(normalisePlace(place))).not.toBe(placeKey(normalisePlace({ ...place, address: '另一地址' })))
  })

  it('creates an entry with place, date and no optional content', async () => {
    const f = fixture()
    const result = await createEntry({ requestId, place, visitedAt: '2026-08-20', memory: '', photoResourceIds: [] }, f.dependencies)
    expect(result.status).toBe('CREATED')
    expect(result.entry.place.name).toBe('广州塔')
    expect(f.entries.size).toBe(1)
  })

  it('returns the same entry for a repeated create request', async () => {
    const f = fixture()
    const first = await createEntry({ requestId, place, visitedAt: '2026-08-20', memory: '', photoResourceIds: [] }, f.dependencies)
    const second = await createEntry({ requestId, place, visitedAt: '2026-08-20', memory: '不会覆盖', photoResourceIds: [] }, f.dependencies)
    expect(second.entry.id).toBe(first.entry.id)
    expect(f.entries.size).toBe(1)
  })

  it('rejects future dates, overlong memories and unsafe content', async () => {
    const f = fixture()
    await expect(createEntry({ requestId, place, visitedAt: '2026-09-03', memory: '', photoResourceIds: [] }, f.dependencies)).rejects.toMatchObject({ code: 'FOOTPRINT_INVALID' })
    await expect(createEntry({ requestId, place, visitedAt: '2026-08-20', memory: '字'.repeat(301), photoResourceIds: [] }, f.dependencies)).rejects.toMatchObject({ code: 'FOOTPRINT_INVALID' })
    await expect(createEntry({ requestId, place, visitedAt: '2026-08-20', memory: '回忆', photoResourceIds: [] }, { ...f.dependencies, checkText: async () => false })).rejects.toMatchObject({ code: 'FOOTPRINT_CONTENT_REJECTED' })
  })

  it('allows the other current member to edit and delete', async () => {
    const f = fixture()
    const created = await createEntry({ requestId, place, visitedAt: '2026-08-20', memory: '第一次', photoResourceIds: [] }, f.dependencies)
    const otherDeps = { ...f.dependencies, identityKey: 'user_b' }
    const updated = await updateEntry({ entryId: created.entry.id, editVersion: 1, operationToken, place, visitedAt: '2026-08-21', memory: '一起玩', photoResourceIds: [] }, otherDeps)
    expect(updated.entry.editVersion).toBe(2)
    const deleted = await deleteEntry({ entryId: created.entry.id, operationToken }, otherDeps)
    expect(deleted.status).toBe('DELETED')
  })

  it('does not silently overwrite a newer version', async () => {
    const f = fixture()
    const created = await createEntry({ requestId, place, visitedAt: '2026-08-20', memory: '', photoResourceIds: [] }, f.dependencies)
    await updateEntry({ entryId: created.entry.id, editVersion: 1, operationToken, place, visitedAt: '2026-08-21', memory: '', photoResourceIds: [] }, f.dependencies)
    await expect(updateEntry({ entryId: created.entry.id, editVersion: 1, operationToken: 'operation_abcdefghij', place, visitedAt: '2026-08-22', memory: '', photoResourceIds: [] }, f.dependencies)).rejects.toMatchObject({ code: 'FOOTPRINT_CONFLICT' })
  })

  it('rejects non-members and hides deleted details', async () => {
    const f = fixture()
    await expect(createEntry({ requestId, place, visitedAt: '2026-08-20', memory: '', photoResourceIds: [] }, { ...f.dependencies, identityKey: 'user_c' })).rejects.toBeInstanceOf(FootprintDomainError)
    const created = await createEntry({ requestId, place, visitedAt: '2026-08-20', memory: '', photoResourceIds: [] }, f.dependencies)
    await deleteEntry({ entryId: created.entry.id, operationToken }, f.dependencies)
    await expect(getEntry({ entryId: created.entry.id }, f.dependencies)).rejects.toMatchObject({ code: 'FOOTPRINT_NOT_FOUND' })
  })

  it('shows pre-join history only when the server membership record requires it', async () => {
    const f = fixture()
    f.repository.hasEntryCreatedBefore = async () => true
    const result = await getOverview({}, f.dependencies)
    expect(result.showPreJoinHistoryNotice).toBe(true)
  })

  // 保护中国凌晨补录、完整表情和同一编辑请求超时后的恢复。
  it('accepts today in China before UTC midnight and complete emoji memories', async () => {
    const f = fixture()
    const result = await createEntry({ requestId, place, visitedAt: '2026-09-03', memory: '👨‍👩‍👧‍👦'.repeat(300) }, { ...f.dependencies, now: () => new Date('2026-09-02T17:00:00Z') })
    expect(result.entry.visitedAt).toBe('2026-09-03')
  })

  it('replays an acknowledged edit without producing a conflict', async () => {
    const f = fixture()
    const created = await createEntry({ requestId, place, visitedAt: '2026-08-20' }, f.dependencies)
    const input = { entryId: created.entry.id, editVersion: 1, operationToken, place, visitedAt: '2026-08-21', memory: '更新' }
    await updateEntry(input, f.dependencies)
    expect((await updateEntry(input, f.dependencies)).entry.editVersion).toBe(2)
  })

  it('isolates two members using the same request token', async () => {
    const f = fixture()
    const input = { requestId, place, visitedAt: '2026-08-20' }
    await createEntry(input, f.dependencies)
    await createEntry(input, { ...f.dependencies, identityKey: 'user_b' })
    expect(f.entries.size).toBe(2)
  })
})
