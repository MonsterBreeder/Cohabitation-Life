const { createRepository, encodeCursor, decodeCursor } = require('../../cloudfunctions/footprint/repository-data')
const domain = require('../../cloudfunctions/footprint/footprint-domain')

// 只替换数据库传输，使用真正的领域函数和事务适配，验证跨层提交与回滚。
function fixture() {
  const tables = new Map<string, Map<string, any>>()
  const table = (name: string) => { if (!tables.has(name)) tables.set(name, new Map()); return tables.get(name)! }
  const command = { aggregate: {}, inc: (by: number) => ({ increment: by }) }
  const collection = (name: string) => ({ doc: (id: string) => ({
    get: async () => ({ data: structuredClone(table(name).get(id) || null) }),
    set: async ({ data }: any) => { table(name).set(id, { ...structuredClone(data), _id: id }) },
    update: async ({ data }: any) => {
      const current = table(name).get(id)
      if (!current) throw new Error('document not exist')
      for (const [key, value] of Object.entries(data)) current[key] = value && typeof value === 'object' && 'increment' in value ? (current[key] || 0) + Number(value.increment) : structuredClone(value)
    },
  }) })
  let queue = Promise.resolve()
  const db = { command, collection, runTransaction: (work: any) => {
    const pending = queue.then(async () => {
      const snapshot = structuredClone(tables)
      try { return await work({ collection }) } catch (error) { tables.clear(); snapshot.forEach((value, key) => tables.set(key, value)); throw error }
    })
    queue = pending.catch(() => undefined); return pending
  } }
  const home = { _id: 'home_a', memberKeys: ['user_a', 'user_b'] }
  table('households').set(home._id, home)
  const repository = createRepository(db)
  repository.findHouseholdByMember = async (actor: string) => home.memberKeys.includes(actor) ? home : null
  const dependencies = { repository, identityKey: 'user_a', now: () => new Date('2026-09-03T08:00:00Z'), checkText: async () => true }
  return { table, home, repository, dependencies }
}
const input = { requestId: 'request_1234567890', place: { name: '公园', address: '广州', latitude: 23, longitude: 113 }, visitedAt: '2026-09-01' }

// wx-server-sdk 将聚合结果放在 list，普通查询才使用 data；不能混用底层 CloudBase 的返回格式。
function queryFixture(aggregateList: any[], records: any[] = []) {
  const aggregate: any = { end: jest.fn(async () => ({ list: aggregateList, errMsg: 'collection.aggregate:ok' })) }
  for (const method of ['match', 'group', 'count', 'sort', 'limit']) aggregate[method] = jest.fn(() => aggregate)
  const query: any = { get: jest.fn(async () => ({ data: records })) }
  for (const method of ['where', 'orderBy', 'limit']) query[method] = jest.fn(() => query)
  return createRepository({
    command: { aggregate: { first: (value: any) => value, sum: (value: any) => value }, gt: (value: any) => value },
    collection: () => ({ ...query, aggregate: () => aggregate }),
  })
}

describe('微信云端聚合结果格式', () => {
  it('空家庭的摘要返回零地点而不是加载失败', async () => {
    await expect(queryFixture([]).getSummary('home_a')).resolves.toEqual({ placeCount: 0, latestEntry: null })
  })
  it('摘要从 list 读取地点数量', async () => {
    await expect(queryFixture([{ placeCount: 3 }]).getSummary('home_a')).resolves.toEqual({ placeCount: 3, latestEntry: null })
  })
  it('空地点列表能够正常返回', async () => {
    await expect(queryFixture([]).listPlaces('home_a', null, 100)).resolves.toEqual({ items: [], cursor: null })
  })
  it('地点分组从 list 读取并保留下一页游标', async () => {
    const entry = { _id: `footprint_${'a'.repeat(32)}`, placeKey: 'a'.repeat(64), place: input.place, visitedAt: input.visitedAt, memory: '', photoRefs: [], createdAt: '2026-09-03T00:00:00Z', updatedAt: '2026-09-03T00:00:00Z', editVersion: 1 }
    const groups = ['a', 'b'].map((key) => ({ _id: key.repeat(64), place: input.place, visitCount: 2, latestEntry: entry }))
    const page = await queryFixture(groups).listPlaces('home_a', null, 1)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({ placeKey: 'a'.repeat(64), visitCount: 2, latestEntry: { id: entry._id } })
    expect(decodeCursor(page.cursor, 'places')).toEqual({ kind: 'places', id: 'a'.repeat(64) })
  })
})

describe('足迹事务适配', () => {
  it('concurrent duplicate creates commit exactly one entry', async () => {
    const f = fixture()
    const [a, b] = await Promise.all([domain.createEntry(input, f.dependencies), domain.createEntry(input, f.dependencies)])
    expect(a.entry.id).toBe(b.entry.id)
    expect(f.table('footprintEntries').size).toBe(1)
  })
  it('checks membership again after text checking and before committing', async () => {
    const f = fixture()
    await expect(domain.createEntry(input, { ...f.dependencies, checkText: async () => { f.home.memberKeys = ['user_b']; return true } })).rejects.toMatchObject({ code: 'NO_HOME' })
    expect(f.table('footprintEntries').size).toBe(0)
  })
  it('does not link a photo already claimed by cleanup', async () => {
    const f = fixture()
    const photo = { _id: `footphoto_${'a'.repeat(32)}`, state: 'cleaning', ownerKey: 'user_a', householdId: 'home_a', digest: 'digest', expiresAt: '2026-09-04T00:00:00Z' }
    f.table('footprintMedia').set(photo._id, photo)
    await expect(f.repository.createEntryWithOperation({ _id: 'entry', householdId: 'home_a', createdAt: '2026-09-03T00:00:00Z' }, { _id: 'op' }, [{ ...photo, state: 'approved' }], 'user_a')).rejects.toMatchObject({ code: 'FOOTPRINT_MEDIA_INVALID' })
    expect(f.table('footprintEntries').size).toBe(0)
  })
  it('deletes the latest photo set, not a stale edit snapshot', async () => {
    const f = fixture()
    const created = await domain.createEntry(input, f.dependencies)
    const stale = structuredClone(f.table('footprintEntries').get(created.entry.id))
    const id = `footphoto_${'a'.repeat(32)}`
    f.table('footprintEntries').get(created.entry.id).photoResourceIds = [id]
    f.table('footprintMedia').set(id, { _id: id, state: 'linked' })
    await f.repository.softDeleteEntry(stale, '2026-09-03T00:00:00Z', 'user_b')
    expect(f.table('footprintMedia').get(id).state).toBe('deleted')
  })
  it('enforces pending photo quotas across concurrent reservations', async () => {
    const f = fixture()
    const results = await Promise.allSettled(Array.from({ length: 7 }, (_, index) => f.repository.reserveMedia({ _id: `photo_${index}`, ownerKey: 'user_a', householdId: 'home_a', state: 'prepared', createdAt: '2026-09-03T00:00:00Z', expiresAt: '2026-09-03T02:00:00Z' })))
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(6)
    expect(f.table('footprintMedia').size).toBe(6)
  })
  it('rejects malformed cursors instead of silently starting from the beginning', () => {
    expect(() => decodeCursor('20', 'entries')).toThrow()
    expect(decodeCursor(encodeCursor({ kind: 'places', id: 'a'.repeat(64) }), 'places').id).toBe('a'.repeat(64))
  })
})
