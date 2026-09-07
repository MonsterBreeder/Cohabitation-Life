import type { FootprintDraft } from '../../../types/footprint'
import { countDisplayCharacters } from '../../../utils/display-text'

export function footprintToday(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function footprintCharacterCount(value: string): number { return countDisplayCharacters(value) }

export function canSaveFootprintDraft(draft: FootprintDraft, today: string): boolean {
  const date = new Date(`${draft.visitedAt}T00:00:00.000Z`)
  // 同时检查真实日历日期，不能把 2 月 31 日交给云端后才失败。
  return Boolean(draft.place) && /^\d{4}-\d{2}-\d{2}$/.test(draft.visitedAt)
    && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === draft.visitedAt
    && draft.visitedAt >= '2000-01-01' && draft.visitedAt <= today && footprintCharacterCount(draft.memory) <= 300 && draft.photos.length <= 3
}

export function hasFootprintDraftChanges(initial: FootprintDraft, current: FootprintDraft): boolean {
  return JSON.stringify(initial) !== JSON.stringify(current)
}
