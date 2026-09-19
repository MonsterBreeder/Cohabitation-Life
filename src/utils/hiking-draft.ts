// 本机草稿带版本校验；损坏或未来版本不会覆盖当前可读草稿。
import type { HikingDraft } from '../types/hiking'

export interface HikingDraftStorage {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export function createHikingDraftStore<T>(storage: HikingDraftStorage, key = 'hiking-draft-v1') {
  return {
    load(): HikingDraft<T> | null {
      try {
        const parsed = JSON.parse(storage.get(key) || '') as HikingDraft<T>
        return parsed?.version === 1 && typeof parsed.updatedAt === 'string' && parsed.payload != null
          ? parsed
          : null
      } catch {
        return null
      }
    },
    save(payload: T, now = new Date()): HikingDraft<T> {
      const draft: HikingDraft<T> = { version: 1, updatedAt: now.toISOString(), payload }
      storage.set(key, JSON.stringify(draft))
      return draft
    },
    clear(): void {
      storage.remove(key)
    },
  }
}
