import {
  buildFootprintMarkers,
  footprintMemoryPreview,
  formatFootprintVisitDate,
} from '../../src/pages/footprint/footprint-view'

const entry = {
  id: '1',
  placeKey: 'p',
  place: { name: '广州塔', address: '', latitude: 23, longitude: 113 },
  visitedAt: '2026-08-02',
  memory: ' 很开心\n一起玩 ',
  coverPhoto: null,
  createdAt: '',
  updatedAt: '',
  editVersion: 1,
}

describe('footprint page view', () => {
  it('builds numeric markers and maps them back to place keys', () => {
    const result = buildFootprintMarkers([
      { placeKey: 'p', place: entry.place, visitCount: 2, latestEntry: entry },
    ])
    expect(result.markers[0]).toMatchObject({ id: 1, latitude: 23, longitude: 113 })
    expect(result.markerTargets[1]).toEqual({ kind: 'place', placeKey: 'p' })
    expect(result.markers[0].callout.content).toBe('2次')
  })

  it('adds a route marker that opens the shared hiking detail', () => {
    const result = buildFootprintMarkers(
      [],
      [
        {
          id: 'footprint_hike',
          entryKind: 'hike',
          name: '山路',
          hikedAt: null,
          place: null,
          mapPoint: { latitude: 23, longitude: 113, source: 'route' },
          memory: '',
          metrics: {
            distanceMeters: 1000,
            durationSeconds: null,
            averageSpeedKmh: null,
            elevationGainMeters: null,
            highestAltitudeMeters: null,
            lowestAltitudeMeters: null,
          },
          hasRoute: true,
          coverPhoto: null,
          createdAt: '2026-09-17T00:00:00Z',
          updatedAt: '2026-09-17T00:00:00Z',
          editVersion: 1,
        },
      ],
    )
    expect(result.markerTargets[1]).toEqual({ kind: 'hike', entryId: 'footprint_hike' })
    expect(result.markers[0].callout.content).toBe('徒步 · 山路')
  })
  it('formats visit dates and memory previews', () => {
    expect(formatFootprintVisitDate('2026-08-02')).toBe('2026年8月2日')
    expect(footprintMemoryPreview(entry)).toBe('很开心 一起玩')
  })
})
