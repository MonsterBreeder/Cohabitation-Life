// 保护路线分段、抽稀和成果计算，确保未知空档不会被补成直线。
import type { HikingRoute } from '../../src/types/hiking'
import {
  calculateHikingMetrics,
  calculateRouteDistance,
  simplifyRouteForDisplay,
} from '../../src/utils/hiking-route'

const route: HikingRoute = {
  version: 1,
  source: 'kml',
  segments: [
    {
      altitudeMode: 'absolute',
      points: [
        { latitude: 0, longitude: 0, altitude: 10 },
        { latitude: 0, longitude: 0.01, altitude: 12 },
        { latitude: 0, longitude: 0.02, altitude: 17 },
      ],
    },
    {
      altitudeMode: 'absolute',
      points: [
        { latitude: 10, longitude: 10, altitude: 100 },
        { latitude: 10, longitude: 10.01, altitude: 104 },
      ],
    },
  ],
}

describe('徒步路线成果', () => {
  it('按分段累计距离且不连接段间空档', () => {
    expect(calculateRouteDistance(route)).toBeLessThan(4_000)
  })

  it('过滤小幅海拔噪声并用有效时长计算速度', () => {
    const metrics = calculateHikingMetrics(route, 3_600)
    expect(metrics.elevationGainMeters).toBe(9)
    expect(metrics.averageSpeedKmh).toBeCloseTo((metrics.distanceMeters as number) / 1_000, 2)
  })

  it('保留真实零值，缺少时长时不猜平均速度', () => {
    const metrics = calculateHikingMetrics(null, 0, 0)
    expect(metrics.distanceMeters).toBe(0)
    expect(metrics.durationSeconds).toBe(0)
    expect(metrics.averageSpeedKmh).toBeNull()
  })

  it('展示抽稀保留每段首尾点，不改变原路线', () => {
    const dense: HikingRoute = {
      version: 1,
      source: 'kml',
      segments: [
        {
          altitudeMode: 'untrusted',
          points: Array.from({ length: 100 }, (_, index) => ({
            latitude: 30,
            longitude: 100 + index / 1000,
          })),
        },
      ],
    }
    const simplified = simplifyRouteForDisplay(dense, 10)
    expect(simplified.segments[0].points).toHaveLength(10)
    expect(simplified.segments[0].points[0]).toEqual(dense.segments[0].points[0])
    expect(simplified.segments[0].points.at(-1)).toEqual(dense.segments[0].points.at(-1))
    expect(dense.segments[0].points).toHaveLength(100)
  })
})
