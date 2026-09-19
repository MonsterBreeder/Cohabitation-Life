import { computed, readonly, shallowRef } from 'vue'
import type { HikingTrackSample, HikingTrackerState } from '../../../types/hiking'
import { gcj02ToWgs84 } from '../../../utils/hiking-coordinate'
import { calculateHikingMetrics } from '../../../utils/hiking-route'
import {
  acceptTrackingSample,
  createHikingTrackerState,
  currentActiveSeconds,
  endTracking,
  interruptTracking,
  pauseTracking,
  startTracking,
} from '../../../utils/hiking-tracker'
import {
  clearHikingRecordingDraft,
  loadHikingRecordingDraft,
  routeFromTracker,
  saveHikingRecordingDraft,
} from './hiking-record-draft'

interface LocationFailure {
  errMsg?: string
}

/** 页面只消费这组状态和动作，定位监听注册、停止与本机检查点都集中在这里。 */
export function useHikingRecorder() {
  const tracker = shallowRef<HikingTrackerState>(loadHikingRecordingDraft() ?? createHikingTrackerState())
  const starting = shallowRef(false)
  const errorMessage = shallowRef('')
  const clockNow = shallowRef(Date.now())
  let listening = false
  let clockTimer: ReturnType<typeof setInterval> | null = null

  const route = computed(() => routeFromTracker(tracker.value))
  const activeSeconds = computed(() => currentActiveSeconds(tracker.value, clockNow.value))
  const metrics = computed(() => calculateHikingMetrics(route.value, activeSeconds.value))
  const hasDraft = computed(
    () => tracker.value.status !== 'idle' || tracker.value.segments.some((segment) => segment.points.length),
  )

  function persist(): void {
    if (hasDraft.value) saveHikingRecordingDraft(tracker.value)
  }

  function onLocation(result: UniNamespace.OnLocationChangeCallbackResult): void {
    const point = gcj02ToWgs84({
      latitude: typeof result.latitude === 'number' ? result.latitude : Number.NaN,
      longitude: typeof result.longitude === 'number' ? result.longitude : Number.NaN,
      ...(typeof result.altitude === 'number' && Number.isFinite(result.altitude)
        ? { altitude: result.altitude }
        : {}),
    })
    const sample: HikingTrackSample = {
      ...point,
      timestamp: Date.now(),
      accuracy: typeof result.accuracy === 'number' ? result.accuracy : Number.NaN,
    }
    tracker.value = acceptTrackingSample(tracker.value, sample)
    persist()
  }

  function onLocationError(): void {
    if (tracker.value.status !== 'recording') return
    tracker.value = interruptTracking(tracker.value)
    errorMessage.value = '定位暂时中断，已替你保留当前路线'
    stopRuntime()
    stopClock()
    persist()
  }

  function attachListeners(): void {
    if (listening) return
    uni.onLocationChange(onLocation)
    uni.onLocationChangeError(onLocationError)
    listening = true
  }

  function detachListeners(): void {
    if (!listening) return
    uni.offLocationChange(onLocation)
    uni.offLocationChangeError(onLocationError)
    listening = false
  }

  function stopRuntime(): void {
    detachListeners()
    uni.stopLocationUpdate({ fail: () => undefined })
  }

  /** 页面显示按秒刷新；累计值仍只在暂停、结束或离开前台时写入草稿。 */
  function startClock(): void {
    if (clockTimer) return
    clockNow.value = Date.now()
    clockTimer = setInterval(() => {
      clockNow.value = Date.now()
    }, 1000)
  }

  function stopClock(): void {
    clockNow.value = Date.now()
    if (!clockTimer) return
    clearInterval(clockTimer)
    clockTimer = null
  }

  async function begin(): Promise<boolean> {
    if (starting.value || tracker.value.status === 'recording') return false
    starting.value = true
    errorMessage.value = ''
    attachListeners()
    try {
      await new Promise<void>((resolve, reject) => {
        uni.startLocationUpdate({ success: () => resolve(), fail: reject })
      })
      const now = Date.now()
      tracker.value = startTracking(tracker.value, now)
      clockNow.value = now
      startClock()
      persist()
      return true
    } catch (error) {
      detachListeners()
      const message = (error as LocationFailure)?.errMsg || ''
      errorMessage.value = /auth deny|authorize no response|permission/i.test(message)
        ? '没有位置权限，暂时无法现场记录。你可以到设置中重新授权。'
        : '当前账号或设备暂时无法连续定位，请检查定位服务后重试。'
      return false
    } finally {
      starting.value = false
    }
  }

  function pause(): void {
    if (tracker.value.status !== 'recording') return
    stopRuntime()
    tracker.value = pauseTracking(tracker.value, Date.now())
    stopClock()
    persist()
  }

  function interrupt(): void {
    if (tracker.value.status !== 'recording') return
    stopRuntime()
    tracker.value = interruptTracking(tracker.value, Date.now())
    stopClock()
    persist()
  }

  function finish(): void {
    stopRuntime()
    tracker.value = endTracking(tracker.value, Date.now())
    stopClock()
    persist()
  }

  function discard(): void {
    stopRuntime()
    stopClock()
    clearHikingRecordingDraft()
    tracker.value = createHikingTrackerState()
    errorMessage.value = ''
  }

  function dispose(): void {
    stopRuntime()
    stopClock()
  }

  return {
    tracker: readonly(tracker),
    activeSeconds,
    route,
    metrics,
    hasDraft,
    starting: readonly(starting),
    errorMessage: readonly(errorMessage),
    begin,
    pause,
    interrupt,
    finish,
    discard,
    dispose,
  }
}
