import {
  createHikeInCloud,
  listHikesInCloud,
  resetHikingCloudForTesting,
  setHikingCloudEnvironmentForTesting,
  setHikingCloudRuntimeForTesting,
  uploadHikingRoute,
} from '../../src/services/hiking-cloud'
import type { HikingRoute } from '../../src/types/hiking'

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
  hasRoute: true,
  coverPhoto: null,
  createdAt: '2026-09-17T00:00:00Z',
  updatedAt: '2026-09-17T00:00:00Z',
  editVersion: 1,
}

function connect(handler: (data: Record<string, unknown>) => unknown) {
  const written = new Map<string, string>()
  setHikingCloudEnvironmentForTesting('test-env')
  setHikingCloudRuntimeForTesting({
    env: { USER_DATA_PATH: '/tmp' },
    getFileSystemManager: () => ({
      writeFile: ({ filePath, data, success }) => {
        written.set(filePath, data)
        success()
      },
      unlink: ({ filePath, complete }) => {
        written.delete(filePath)
        complete()
      },
    }),
    cloud: {
      init: jest.fn(),
      uploadFile: jest.fn().mockResolvedValue({ fileID: 'cloud://route' }),
      callFunction: jest.fn(async ({ data }) => ({ result: handler(data) })),
    },
  })
}

afterEach(resetHikingCloudForTesting)

describe('共同徒步云端客户端', () => {
  it('严格接收徒步列表和保存回执', async () => {
    connect(({ action }) =>
      action === 'listHikes'
        ? { status: 'LISTED', entries: [entry], cursor: null }
        : { status: 'CREATED', entry },
    )
    expect((await listHikesInCloud()).entries).toHaveLength(1)
    const saved = await createHikeInCloud({
      expectedHouseholdId: 'home_a',
      requestId: 'hike_request_123456',
      name: '',
      hikedAt: null,
      place: null,
      memory: '',
      distanceMeters: null,
      durationSeconds: null,
      routeResourceId: 'footroute_123',
    })
    expect('id' in saved && saved.id).toBe(entry.id)
  })

  it('路线按预约、上传、复核顺序处理', async () => {
    const actions: string[] = []
    connect(({ action }) => {
      actions.push(String(action))
      if (action === 'prepareRoute')
        return {
          status: 'PREPARED',
          resourceId: `footroute_${'a'.repeat(32)}`,
          cloudPath: 'footprint-routes/test.json',
        }
      if (action === 'reviewRoute') return { status: 'APPROVED', digest: 'digest' }
      return { status: 'ABANDONED' }
    })
    const route: HikingRoute = {
      version: 1,
      source: 'kml',
      segments: [
        {
          altitudeMode: 'untrusted',
          points: [
            { latitude: 23, longitude: 113 },
            { latitude: 23.1, longitude: 113.1 },
          ],
        },
      ],
    }
    await expect(uploadHikingRoute(route)).resolves.toEqual({
      resourceId: `footroute_${'a'.repeat(32)}`,
      digest: 'digest',
    })
    expect(actions).toEqual(['prepareRoute', 'reviewRoute'])
  })

  it('拒绝残缺列表而不是把坏数据交给页面', async () => {
    connect(() => ({ status: 'LISTED', entries: [{ id: 'broken' }], cursor: null }))
    await expect(listHikesInCloud()).rejects.toThrow('格式不正确')
  })
})
