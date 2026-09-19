// 徒步路线计算保持纯函数：预览、云端校验和详情展示共用同一套口径。
import type { HikingMetrics, HikingRoute, HikingRoutePoint, HikingRouteSegment } from '../types/hiking'

const EARTH_RADIUS_METERS = 6_371_008.8
const MIN_ALTITUDE_SAMPLES = 2
const ELEVATION_NOISE_METERS = 3

function radians(value: number): number {
  return (value * Math.PI) / 180
}

export function distanceBetweenPoints(left: HikingRoutePoint, right: HikingRoutePoint): number {
  const latitudeDelta = radians(right.latitude - left.latitude)
  const longitudeDelta = radians(right.longitude - left.longitude)
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(longitudeDelta / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)))
}

export function calculateRouteDistance(route: HikingRoute): number {
  return route.segments.reduce(
    (total, segment) =>
      total +
      segment.points
        .slice(1)
        .reduce(
          (segmentTotal, point, index) => segmentTotal + distanceBetweenPoints(segment.points[index], point),
          0,
        ),
    0,
  )
}

function calculateTrustedElevation(
  segments: HikingRouteSegment[],
): Pick<HikingMetrics, 'elevationGainMeters' | 'highestAltitudeMeters' | 'lowestAltitudeMeters'> {
  const trusted = segments.filter((segment) => segment.altitudeMode === 'absolute')
  const altitudeValues = trusted.flatMap((segment) =>
    segment.points.map((point) => point.altitude).filter((value): value is number => Number.isFinite(value)),
  )
  if (altitudeValues.length < MIN_ALTITUDE_SAMPLES)
    return { elevationGainMeters: null, highestAltitudeMeters: null, lowestAltitudeMeters: null }
  let gain = 0
  // 分段之间不连线，避免把暂停或文件分段误算成一次爬升。
  for (const segment of trusted) {
    const values = segment.points
      .map((point) => point.altitude)
      .filter((value): value is number => Number.isFinite(value))
    for (let index = 1; index < values.length; index += 1) {
      const delta = values[index] - values[index - 1]
      if (delta >= ELEVATION_NOISE_METERS) gain += delta
    }
  }
  return {
    elevationGainMeters: Math.round(gain * 10) / 10,
    highestAltitudeMeters: Math.max(...altitudeValues),
    lowestAltitudeMeters: Math.min(...altitudeValues),
  }
}

export function calculateHikingMetrics(
  route: HikingRoute | null,
  durationSeconds: number | null = null,
  manualDistanceMeters: number | null = null,
): HikingMetrics {
  const calculatedDistance = route ? calculateRouteDistance(route) : manualDistanceMeters
  const distanceMeters =
    calculatedDistance == null || !Number.isFinite(calculatedDistance) || calculatedDistance < 0
      ? null
      : Math.round(calculatedDistance * 10) / 10
  const safeDuration =
    durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds < 0
      ? null
      : Math.round(durationSeconds)
  const elevation = route
    ? calculateTrustedElevation(route.segments)
    : { elevationGainMeters: null, highestAltitudeMeters: null, lowestAltitudeMeters: null }
  return {
    distanceMeters,
    durationSeconds: safeDuration,
    averageSpeedKmh:
      distanceMeters != null && safeDuration != null && safeDuration > 0
        ? Math.round((distanceMeters / 1000 / (safeDuration / 3600)) * 100) / 100
        : null,
    ...elevation,
  }
}

/** 地图副本只做展示抽稀，完整路线仍用于成果计算与云端保存。 */
export function simplifyRouteForDisplay(route: HikingRoute, maxPoints = 2_000): HikingRoute {
  const total = route.segments.reduce((sum, segment) => sum + segment.points.length, 0)
  if (total <= maxPoints) return route
  const minimum = route.segments.length * 2
  const budget = Math.max(minimum, maxPoints)
  let remaining = budget
  const segments = route.segments.map((segment, segmentIndex) => {
    const segmentsLeft = route.segments.length - segmentIndex
    const share =
      segmentIndex === route.segments.length - 1
        ? remaining
        : Math.max(2, Math.floor(remaining / segmentsLeft))
    remaining -= share
    if (segment.points.length <= share) return segment
    const points: HikingRoutePoint[] = []
    for (let index = 0; index < share; index += 1) {
      const sourceIndex = Math.round((index * (segment.points.length - 1)) / (share - 1))
      points.push(segment.points[sourceIndex])
    }
    return { ...segment, points }
  })
  return { ...route, segments }
}
