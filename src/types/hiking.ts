/** 徒步路线共享类型：完整路线只在明确进入详情或导入预览时加载。 */
export interface HikingRoutePoint {
  latitude: number
  longitude: number
  altitude?: number
}

export interface HikingRouteSegment {
  points: HikingRoutePoint[]
  /** KML 只有明确声明 absolute 时，海拔才可用于成果计算。 */
  altitudeMode: 'absolute' | 'untrusted'
}

export interface HikingRoute {
  version: 1
  source: 'kml' | 'tracking'
  segments: HikingRouteSegment[]
}

export interface HikingMetrics {
  distanceMeters: number | null
  durationSeconds: number | null
  averageSpeedKmh: number | null
  elevationGainMeters: number | null
  highestAltitudeMeters: number | null
  lowestAltitudeMeters: number | null
}

export interface HikingKmlParseResult {
  route: HikingRoute
  metrics: HikingMetrics
  pointCount: number
  segmentCount: number
}

export type HikingKmlErrorCode =
  | 'FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'UNSAFE_XML'
  | 'UNSUPPORTED_CONTENT'
  | 'INVALID_XML'
  | 'NO_ROUTE'
  | 'INVALID_COORDINATE'
  | 'TOO_MANY_POINTS'
  | 'TOO_MANY_SEGMENTS'

export class HikingKmlError extends Error {
  constructor(
    public readonly code: HikingKmlErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'HikingKmlError'
  }
}

/** 本机草稿只保存未共享内容；成功保存共同记录后必须立即清除。 */
export interface HikingDraft<T = Record<string, unknown>> {
  version: 1
  updatedAt: string
  payload: T
}

export interface HikingTrackSample extends HikingRoutePoint {
  timestamp: number
  accuracy: number
}

export interface HikingTrackerState {
  status: 'idle' | 'recording' | 'paused' | 'ended'
  segments: HikingRouteSegment[]
  activeSeconds: number
  /** 当前连续记录段的开始时刻；暂停或结束后清空，避免把离开前台的时间算进去。 */
  activeStartedAt: number | null
  lastAcceptedAt: number | null
  signal: 'waiting' | 'good' | 'unstable' | 'interrupted'
}

export interface HikingPlace {
  name: string
  address: string
  latitude: number
  longitude: number
}

/** 徒步照片沿用足迹的私有资源格式，列表只暴露封面摘要。 */
export interface HikingPhoto {
  resourceId: string
  digest: string
  url?: string
}

export interface HikingEntrySummary {
  id: string
  entryKind: 'hike'
  name: string
  hikedAt: string | null
  place: HikingPlace | null
  /** 地图代表点：KML 取首个路线点，补录取用户选择地点。 */
  mapPoint: { latitude: number; longitude: number; source: 'route' | 'place' } | null
  memory: string
  metrics: HikingMetrics
  hasRoute: boolean
  coverPhoto: HikingPhoto | null
  createdAt: string
  updatedAt: string
  editVersion: number
}

export interface HikingEntryDetail extends HikingEntrySummary {
  routeResourceId: string | null
  photos: HikingPhoto[]
}

export interface HikingFormDraft {
  name: string
  hikedAt: string
  place: HikingPlace | null
  memory: string
  manualDistanceKm: string
  durationMinutes: string
  route: HikingRoute | null
  routeFileName: string
}
