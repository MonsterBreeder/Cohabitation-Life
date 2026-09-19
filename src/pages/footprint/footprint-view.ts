import type { FootprintEntrySummary, FootprintPlaceSummary } from '../../types/footprint'
import type { HikingEntrySummary } from '../../types/hiking'
import { wgs84ToGcj02 } from '../../utils/hiking-coordinate'

export type FootprintViewMode = 'map' | 'list'

export interface FootprintMarker {
  id: number
  latitude: number
  longitude: number
  width: number
  height: number
  iconPath: string
  joinCluster: boolean
  callout: {
    content: string
    color: string
    bgColor: string
    borderRadius: number
    padding: number
    display: 'ALWAYS'
  }
}

export type FootprintMarkerTarget = { kind: 'place'; placeKey: string } | { kind: 'hike'; entryId: string }

/** 地图标记编号只在当前页面有效，避免把云端字符串编号直接传给微信地图。 */
export function buildFootprintMarkers(
  places: FootprintPlaceSummary[],
  hikes: HikingEntrySummary[] = [],
): {
  markers: FootprintMarker[]
  markerTargets: Record<number, FootprintMarkerTarget>
} {
  const markerTargets: Record<number, FootprintMarkerTarget> = {}
  const visibleHikes = hikes.filter((entry) => entry.mapPoint)
  const markerCount = places.length + visibleHikes.length
  const markers = places.map((item, index) => {
    const id = index + 1
    markerTargets[id] = { kind: 'place', placeKey: item.placeKey }
    return {
      id,
      latitude: item.place.latitude,
      longitude: item.place.longitude,
      width: 36,
      height: 36,
      iconPath: '/static/brand/logo.png',
      joinCluster: markerCount > 50,
      callout: {
        content: item.visitCount > 1 ? `${item.visitCount}次` : item.place.name,
        color: '#29443a',
        bgColor: '#ffffff',
        borderRadius: 12,
        padding: 6,
        display: 'ALWAYS' as const,
      },
    }
  })
  for (const [index, entry] of visibleHikes.entries()) {
    const id = places.length + index + 1
    markerTargets[id] = { kind: 'hike', entryId: entry.id }
    const source = entry.mapPoint!
    const point = source.source === 'route' ? wgs84ToGcj02(source) : source
    markers.push({
      id,
      latitude: point.latitude,
      longitude: point.longitude,
      width: 40,
      height: 40,
      iconPath: '/static/brand/logo.png',
      joinCluster: markerCount > 50,
      callout: {
        content: `徒步 · ${entry.name || '未命名'}`,
        color: '#267a5a',
        bgColor: '#ffffff',
        borderRadius: 12,
        padding: 6,
        display: 'ALWAYS' as const,
      },
    })
  }
  return { markers, markerTargets }
}

export { formatFootprintVisitDate } from '../../utils/footprint-display'

export function footprintMemoryPreview(entry: Pick<FootprintEntrySummary, 'memory'>): string {
  const value = entry.memory.replace(/\s+/g, ' ').trim()
  return Array.from(value).slice(0, 48).join('')
}
