import type { HikingRoutePoint, HikingRouteSegment, HikingTrackerState } from '../../../types/hiking'
import { wgs84ToGcj02 } from '../../../utils/hiking-coordinate'

type HikingTrackerPresentation = Readonly<Pick<HikingTrackerState, 'status' | 'signal'>>
export type HikingLiveRouteSegment = Readonly<{
  altitudeMode: HikingRouteSegment['altitudeMode']
  points: readonly HikingRoutePoint[]
}>

/** 现场页统一使用短格式，户外行走中一眼即可读清。 */
export function formatRecordingDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const remaining = safe % 60
  return [hours, minutes, remaining].map((part) => String(part).padStart(2, '0')).join(':')
}

export function recordingStatusText(state: HikingTrackerPresentation): string {
  if (state.status === 'idle') return '准备好后再开始定位'
  if (state.status === 'paused' && state.signal === 'interrupted') return '记录已中断，继续时会新开一段'
  if (state.status === 'paused') return '已暂停，不会累计时间和路线'
  if (state.signal === 'waiting') return '正在寻找定位信号'
  if (state.signal === 'unstable') return '定位信号较弱，异常位置不会计入'
  if (state.status === 'ended') return '记录已结束'
  return '定位正常，正在记录'
}

export function recordingStatusIcon(state: HikingTrackerPresentation): string {
  if (state.status === 'recording' && state.signal === 'good') return 'check-circle'
  if (state.status === 'recording') return 'location'
  if (state.status === 'paused') return 'pause-circle'
  if (state.status === 'ended') return 'pushpin'
  return 'info-circle'
}

interface LiveMapPoint {
  latitude: number
  longitude: number
}

interface LiveMapPolyline {
  points: LiveMapPoint[]
  color: string
  width: number
  dottedLine: boolean
  arrowLine: boolean
}

/** 实时地图从第一个点起就定位视野，只有两个点以上的分段才交给地图绘制线段。 */
export function createLiveMapModel(segments: readonly HikingLiveRouteSegment[]): {
  hasLocation: boolean
  center: LiveMapPoint
  includePoints: LiveMapPoint[]
  polylines: LiveMapPolyline[]
} {
  const displaySegments = segments.map((segment) =>
    segment.points.map((point) => wgs84ToGcj02(point as HikingRoutePoint)),
  )
  const includePoints = displaySegments.flatMap((points) => points)
  const center = includePoints[includePoints.length - 1] ?? { latitude: 23.1291, longitude: 113.2644 }
  return {
    hasLocation: includePoints.length > 0,
    center,
    includePoints,
    polylines: displaySegments
      .filter((points) => points.length >= 2)
      .map((points) => ({
        points,
        color: '#267A5ACC',
        width: 6,
        dottedLine: false,
        arrowLine: true,
      })),
  }
}

/** 一旦生成现场草稿，记录中、暂停和结束待保存都必须允许用户明确放弃。 */
export function canAbortRecording(state: HikingTrackerPresentation): boolean {
  return state.status !== 'idle'
}
