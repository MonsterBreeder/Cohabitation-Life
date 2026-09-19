// 微信地图使用 GCJ-02；境外坐标保持 WGS 84，避免不必要的偏移。
import type { HikingRoute, HikingRoutePoint } from '../types/hiking'

const AXIS = 6_378_245
const ECCENTRICITY = 0.006693421622965943

function outsideChina(latitude: number, longitude: number): boolean {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271
}

function transformLatitude(x: number, y: number): number {
  let result = -100 + 2 * x + 3 * y + 0.2 * y ** 2 + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  result += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  result += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3
  result += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3
  return result
}

function transformLongitude(x: number, y: number): number {
  let result = 300 + x + 2 * y + 0.1 * x ** 2 + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  result += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  result += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3
  result += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3
  return result
}

export function wgs84ToGcj02(point: HikingRoutePoint): HikingRoutePoint {
  if (outsideChina(point.latitude, point.longitude)) return { ...point }
  let latitudeDelta = transformLatitude(point.longitude - 105, point.latitude - 35)
  let longitudeDelta = transformLongitude(point.longitude - 105, point.latitude - 35)
  const latitudeRadians = (point.latitude / 180) * Math.PI
  const magic = 1 - ECCENTRICITY * Math.sin(latitudeRadians) ** 2
  latitudeDelta =
    (latitudeDelta * 180) / (((AXIS * (1 - ECCENTRICITY)) / (magic * Math.sqrt(magic))) * Math.PI)
  longitudeDelta = (longitudeDelta * 180) / ((AXIS / Math.sqrt(magic)) * Math.cos(latitudeRadians) * Math.PI)
  return { ...point, latitude: point.latitude + latitudeDelta, longitude: point.longitude + longitudeDelta }
}

/** 现场定位返回 GCJ-02，这里近似反算为 WGS 84，避免保存后展示路线时被二次偏移。 */
export function gcj02ToWgs84(point: HikingRoutePoint): HikingRoutePoint {
  if (outsideChina(point.latitude, point.longitude)) return { ...point }
  const transformed = wgs84ToGcj02(point)
  return {
    ...point,
    latitude: point.latitude * 2 - transformed.latitude,
    longitude: point.longitude * 2 - transformed.longitude,
  }
}

export function routeToMapCoordinates(route: HikingRoute): HikingRoute {
  return {
    ...route,
    segments: route.segments.map((segment) => ({ ...segment, points: segment.points.map(wgs84ToGcj02) })),
  }
}
