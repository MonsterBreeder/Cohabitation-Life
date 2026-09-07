import type { FootprintEntrySummary, FootprintPlaceSummary } from '../../types/footprint'

export type FootprintViewMode = 'map' | 'list'

export interface FootprintMarker {
  id: number
  latitude: number
  longitude: number
  width: number
  height: number
  iconPath: string
  joinCluster: boolean
  callout: { content: string; color: string; bgColor: string; borderRadius: number; padding: number; display: 'ALWAYS' }
}

/** 地图标记编号只在当前页面有效，避免把云端字符串编号直接传给微信地图。 */
export function buildFootprintMarkers(places: FootprintPlaceSummary[]): { markers: FootprintMarker[]; markerKeys: Record<number, string> } {
  const markerKeys: Record<number, string> = {}
  const markers = places.map((item, index) => {
    const id = index + 1
    markerKeys[id] = item.placeKey
    return {
      id, latitude: item.place.latitude, longitude: item.place.longitude,
      width: 36, height: 36, iconPath: '/static/brand/logo.png',
      joinCluster: places.length > 50,
      callout: { content: item.visitCount > 1 ? `${item.visitCount}次` : item.place.name, color: '#29443a', bgColor: '#ffffff', borderRadius: 12, padding: 6, display: 'ALWAYS' as const },
    }
  })
  return { markers, markerKeys }
}

export { formatFootprintVisitDate } from '../../utils/footprint-display'

export function footprintMemoryPreview(entry: FootprintEntrySummary): string {
  const value = entry.memory.replace(/\s+/g, ' ').trim()
  return Array.from(value).slice(0, 48).join('')
}
