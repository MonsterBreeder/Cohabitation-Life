import { createFootprintEntryInCloud, getFootprintOverviewInCloud, resetFootprintCloudForTesting, setFootprintCloudEnvironmentForTesting, setFootprintCloudRuntimeForTesting } from '../../src/services/footprint-cloud'

const entry = { id: 'footprint_123', placeKey: 'place', place: { name: '广州塔', address: '海珠区', latitude: 23, longitude: 113 }, visitedAt: '2026-08-20', memory: '', coverPhoto: null, createdAt: '2026-08-20T00:00:00.000Z', updatedAt: '2026-08-20T00:00:00.000Z', editVersion: 1 }

describe('footprint cloud client', () => {
  afterEach(() => resetFootprintCloudForTesting())

  it('accepts a complete overview response', async () => {
    setFootprintCloudEnvironmentForTesting('test-env')
    setFootprintCloudRuntimeForTesting({ cloud: { init: jest.fn(), uploadFile: jest.fn(), callFunction: jest.fn().mockResolvedValue({ result: { status: 'LOADED', summary: { placeCount: 1, latestEntry: entry }, places: [{ placeKey: 'place', place: entry.place, visitCount: 1, latestEntry: entry }], entries: [entry], entriesCursor: null, placesCursor: null, showPreJoinHistoryNotice: false } }) } })
    const result = await getFootprintOverviewInCloud()
    expect('summary' in result && result.summary.placeCount).toBe(1)
  })

  it('rejects an incomplete overview instead of leaking it to pages', async () => {
    setFootprintCloudEnvironmentForTesting('test-env')
    setFootprintCloudRuntimeForTesting({ cloud: { init: jest.fn(), uploadFile: jest.fn(), callFunction: jest.fn().mockResolvedValue({ result: { status: 'LOADED', places: [] } }) } })
    await expect(getFootprintOverviewInCloud()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('does not mistake a successful write status for a failure', async () => {
    setFootprintCloudEnvironmentForTesting('test-env')
    setFootprintCloudRuntimeForTesting({ cloud: { init: jest.fn(), uploadFile: jest.fn(), callFunction: jest.fn().mockResolvedValue({ result: { status: 'CREATED', retryable: false, entry } }) } })
    const result = await createFootprintEntryInCloud({ requestId: 'request_1234567890', place: entry.place, visitedAt: entry.visitedAt, memory: '', photoResourceIds: [] })
    expect('id' in result && result.id).toBe(entry.id)
  })
})
