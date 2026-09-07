import { buildFootprintMarkers, footprintMemoryPreview, formatFootprintVisitDate } from '../../src/pages/footprint/footprint-view'

const entry = { id: '1', placeKey: 'p', place: { name: '广州塔', address: '', latitude: 23, longitude: 113 }, visitedAt: '2026-08-02', memory: ' 很开心\n一起玩 ', coverPhoto: null, createdAt: '', updatedAt: '', editVersion: 1 }

describe('footprint page view', () => {
  it('builds numeric markers and maps them back to place keys', () => {
    const result = buildFootprintMarkers([{ placeKey: 'p', place: entry.place, visitCount: 2, latestEntry: entry }])
    expect(result.markers[0]).toMatchObject({ id: 1, latitude: 23, longitude: 113 })
    expect(result.markerKeys[1]).toBe('p')
    expect(result.markers[0].callout.content).toBe('2次')
  })
  it('formats visit dates and memory previews', () => {
    expect(formatFootprintVisitDate('2026-08-02')).toBe('2026年8月2日')
    expect(footprintMemoryPreview(entry)).toBe('很开心 一起玩')
  })
})
