import { canSaveFootprintDraft, footprintCharacterCount, footprintToday, hasFootprintDraftChanges } from '../../src/subpackages/footprint/footprint-form/footprint-form-view'

const draft = { place: { name: '广州塔', address: '海珠区', latitude: 23, longitude: 113 }, visitedAt: '2026-09-01', memory: '', photos: [] }

describe('footprint form view', () => {
  it('allows place and a non-future date without optional content', () => expect(canSaveFootprintDraft(draft, '2026-09-02')).toBe(true))
  it('rejects missing place, future date and more than three photos', () => {
    expect(canSaveFootprintDraft({ ...draft, place: null }, '2026-09-02')).toBe(false)
    expect(canSaveFootprintDraft({ ...draft, visitedAt: '2026-09-03' }, '2026-09-02')).toBe(false)
    expect(canSaveFootprintDraft({ ...draft, photos: Array(4).fill({ resourceId: 'x', digest: 'y' }) }, '2026-09-02')).toBe(false)
  })
  it('counts emoji as complete characters', () => expect(footprintCharacterCount('一起😊')).toBe(3))
  it('formats local today and detects real draft changes', () => {
    expect(footprintToday(new Date(2026, 8, 2))).toBe('2026-09-02')
    expect(hasFootprintDraftChanges(draft, { ...draft })).toBe(false)
    expect(hasFootprintDraftChanges(draft, { ...draft, memory: '新的回忆' })).toBe(true)
  })
})
