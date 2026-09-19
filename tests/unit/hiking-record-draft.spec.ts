import { routeFromTracker } from '../../src/subpackages/hiking/hiking-record/hiking-record-draft'
import type { HikingTrackerState } from '../../src/types/hiking'

describe('徒步现场记录草稿', () => {
  it('只把至少两个点的分段封存为路线', () => {
    const state: HikingTrackerState = {
      status: 'ended',
      activeSeconds: 30,
      activeStartedAt: null,
      lastAcceptedAt: null,
      signal: 'good',
      segments: [
        { altitudeMode: 'untrusted', points: [{ latitude: 30, longitude: 120 }] },
        {
          altitudeMode: 'untrusted',
          points: [
            { latitude: 30, longitude: 120 },
            { latitude: 30.001, longitude: 120.001 },
          ],
        },
      ],
    }

    expect(routeFromTracker(state)).toMatchObject({
      source: 'tracking',
      segments: [{ points: expect.arrayContaining([expect.objectContaining({ latitude: 30 })]) }],
    })
  })
})
