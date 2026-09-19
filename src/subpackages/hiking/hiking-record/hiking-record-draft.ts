// 现场记录草稿仅保存在记录者本机；保存为共同徒步前不会上传或共享实时位置。
import type { HikingRoute, HikingTrackerState } from '../../../types/hiking'
import { createHikingDraftStore } from '../../../utils/hiking-draft'

export const HIKING_RECORDING_DRAFT_KEY = 'hiking-recording-draft-v1'

function recordingStore() {
  return createHikingDraftStore<HikingTrackerState>(
    {
      get: (key) => {
        const value = uni.getStorageSync(key)
        return typeof value === 'string' ? value : null
      },
      set: (key, value) => uni.setStorageSync(key, value),
      remove: (key) => uni.removeStorageSync(key),
    },
    HIKING_RECORDING_DRAFT_KEY,
  )
}

export function loadHikingRecordingDraft(): HikingTrackerState | null {
  const state = recordingStore().load()?.payload
  if (!state) return null
  // 兼容已保存的旧草稿；旧草稿没有计时起点，恢复后从下一次主动继续开始计时。
  return { ...state, activeStartedAt: state.activeStartedAt ?? null }
}

export function saveHikingRecordingDraft(state: HikingTrackerState): void {
  recordingStore().save(state)
}

export function clearHikingRecordingDraft(): void {
  recordingStore().clear()
}

/** 不足两个有效点的分段不能组成路线，但仍保留在现场草稿中等待继续记录。 */
export function routeFromTracker(state: HikingTrackerState): HikingRoute | null {
  const segments = state.segments.filter((segment) => segment.points.length >= 2)
  return segments.length ? { version: 1, source: 'tracking', segments } : null
}
