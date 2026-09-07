import { createPinia, setActivePinia } from 'pinia'
import { useFootprintStore } from '../../src/store/modules/footprint'
import { resetFootprintCloudForTesting, setFootprintCloudEnvironmentForTesting, setFootprintCloudRuntimeForTesting } from '../../src/services/footprint-cloud'

const entry = { id: 'footprint_a', placeKey: 'place_a', place: { name: '广州塔', address: '海珠区', latitude: 23, longitude: 113 }, visitedAt: '2026-08-20', memory: '', coverPhoto: null, createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z', editVersion: 1 }
const listed = { status: 'LISTED', entries: [entry], cursor: null }
function connect(handler: (data: any) => Promise<any>) {
  setActivePinia(createPinia())
  setFootprintCloudEnvironmentForTesting('test-env')
  setFootprintCloudRuntimeForTesting({ cloud: { init: jest.fn(), uploadFile: jest.fn(), callFunction: ({ data }) => handler(data).then((result) => ({ result })) } })
  const store = useFootprintStore(); store.setHouseholdContext('home_a'); return store
}
afterEach(resetFootprintCloudForTesting)

describe('足迹跨页面状态', () => {
  // 旧详情或分页回执不得污染换家后的新页面，也不能解锁新家庭正在运行的请求。
  it('discards a late list response after changing households', async () => {
    let finish!: (value: any) => void
    const store = connect(() => new Promise((resolve) => { finish = resolve }))
    const pending = store.loadEntries()
    store.setHouseholdContext('home_b')
    finish(listed); await pending
    expect(store.entries).toEqual([])
    expect(store.householdId).toBe('home_b')
  })

  it('does not reuse an old context number after a reset', () => {
    const store = connect(async () => listed)
    const old = store.contextVersion
    store.resetFootprintStore(); store.setHouseholdContext('home_a')
    expect(store.contextVersion).toBeGreaterThan(old)
  })

  it('keeps list results when map loading fails', async () => {
    const store = connect(async ({ action }) => {
      if (action === 'listPlaces') throw new Error('地图暂时不可用')
      if (action === 'getSummary') return { status: 'LOADED', summary: { placeCount: 1, latestEntry: entry }, showPreJoinHistoryNotice: false }
      return listed
    })
    await store.loadOverview()
    expect(store.entries).toHaveLength(1)
    expect(store.mapError).toBeTruthy()
    expect(store.listError).toBeNull()
  })

  it('requests every map page and keeps place-specific pagination', async () => {
    const calls: any[] = []
    const store = connect(async (data) => {
      calls.push(data)
      if (data.action === 'listPlaces') return { status: 'LISTED', places: [{ placeKey: data.cursor ? 'second' : 'first', place: entry.place, visitCount: 1, latestEntry: entry }], cursor: data.cursor ? null : 'next' }
      return { ...listed, cursor: data.cursor ? null : 'older' }
    })
    await store.loadPlaces(); await store.loadEntries('specific-place'); await store.loadMoreEntries()
    expect(store.places).toHaveLength(2)
    expect(calls.at(-1)).toMatchObject({ placeKey: 'specific-place', cursor: 'older' })
  })

  it('does not restore private photos from a previous household', async () => {
    let finish!: (value: any) => void
    const store = connect(() => new Promise((resolve) => { finish = resolve }))
    const pending = store.hydratePhotoUrls([{ resourceId: 'photo_a', digest: 'digest' }])
    store.setHouseholdContext('home_b')
    finish({ status: 'URLS_READY', photos: [{ resourceId: 'photo_a', digest: 'digest', url: 'https://example.test/private.jpg' }] })
    expect(await pending).toEqual({})
  })
})
