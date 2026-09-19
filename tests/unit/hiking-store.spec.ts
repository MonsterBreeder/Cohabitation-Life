// 保护家庭切换和重复保存：旧家庭回执不能污染当前共同徒步列表。
import { createPinia, setActivePinia } from 'pinia'
import {
  resetHikingCloudForTesting,
  setHikingCloudEnvironmentForTesting,
  setHikingCloudRuntimeForTesting,
} from '../../src/services/hiking-cloud'
import { useHikingStore } from '../../src/store/modules/hiking'

const entry = {
  id: 'footprint_123',
  entryKind: 'hike' as const,
  name: '周末山路',
  hikedAt: null,
  place: null,
  mapPoint: null,
  memory: '',
  metrics: {
    distanceMeters: 1000,
    durationSeconds: null,
    averageSpeedKmh: null,
    elevationGainMeters: null,
    highestAltitudeMeters: null,
    lowestAltitudeMeters: null,
  },
  hasRoute: false,
  coverPhoto: null,
  createdAt: '2026-09-17T00:00:00Z',
  updatedAt: '2026-09-17T00:00:00Z',
  editVersion: 1,
}

function connect(handler: (data: Record<string, unknown>) => Promise<unknown>) {
  setActivePinia(createPinia())
  setHikingCloudEnvironmentForTesting('test-env')
  setHikingCloudRuntimeForTesting({
    env: { USER_DATA_PATH: '/tmp' },
    getFileSystemManager: () => ({
      writeFile: ({ success }) => success(),
      unlink: ({ complete }) => complete(),
    }),
    cloud: {
      init: jest.fn(),
      uploadFile: jest.fn(),
      callFunction: async ({ data }) => ({ result: await handler(data) }),
    },
  })
  const store = useHikingStore()
  store.setHouseholdContext('home_a')
  return store
}

afterEach(resetHikingCloudForTesting)

describe('共同徒步状态', () => {
  it('换家后丢弃旧列表回执', async () => {
    let finish!: (value: unknown) => void
    const store = connect(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = store.loadRecords()
    store.setHouseholdContext('home_b')
    finish({ status: 'LISTED', entries: [entry], cursor: null })
    await pending
    expect(store.records).toEqual([])
    expect(store.householdId).toBe('home_b')
  })

  it('无路线补录保存成功后立即进入列表', async () => {
    const store = connect(async () => ({ status: 'CREATED', entry }))
    const saved = await store.saveDraft(
      {
        name: '周末山路',
        hikedAt: '',
        place: { name: '白云山', address: '广州', latitude: 23, longitude: 113 },
        memory: '',
        manualDistanceKm: '1',
        durationMinutes: '',
        route: null,
        routeFileName: '',
      },
      'hike_request_123456',
    )
    expect(saved?.id).toBe(entry.id)
    expect(store.records).toEqual([entry])
  })
})
