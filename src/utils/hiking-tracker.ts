// 定位状态机只接受可信采样；暂停和中断会主动分段，绝不补画未知路程。
import type { HikingRouteSegment, HikingTrackerState, HikingTrackSample } from '../types/hiking'
import { distanceBetweenPoints } from './hiking-route'

const MAX_ACCURACY_METERS = 100
const MAX_REASONABLE_SPEED_MPS = 15

export function createHikingTrackerState(): HikingTrackerState {
  return {
    status: 'idle',
    segments: [],
    activeSeconds: 0,
    activeStartedAt: null,
    lastAcceptedAt: null,
    signal: 'waiting',
  }
}

function validSample(sample: HikingTrackSample): boolean {
  return (
    Number.isFinite(sample.latitude) &&
    Math.abs(sample.latitude) <= 90 &&
    Number.isFinite(sample.longitude) &&
    Math.abs(sample.longitude) <= 180 &&
    Number.isFinite(sample.timestamp) &&
    sample.accuracy > 0 &&
    sample.accuracy <= MAX_ACCURACY_METERS
  )
}

/** 有效时长按实际记录时间计算，不依赖定位回调频率。 */
export function currentActiveSeconds(state: HikingTrackerState, now = Date.now()): number {
  if (state.status !== 'recording' || state.activeStartedAt == null) return state.activeSeconds
  return state.activeSeconds + Math.max(0, Math.floor((now - state.activeStartedAt) / 1000))
}

export function startTracking(state: HikingTrackerState, now = Date.now()): HikingTrackerState {
  if (state.status !== 'idle' && state.status !== 'paused') return state
  const segment: HikingRouteSegment = { points: [], altitudeMode: 'untrusted' }
  return {
    ...state,
    status: 'recording',
    segments: [...state.segments, segment],
    activeStartedAt: now,
    lastAcceptedAt: null,
    signal: 'waiting',
  }
}

export function acceptTrackingSample(
  state: HikingTrackerState,
  sample: HikingTrackSample,
): HikingTrackerState {
  if (state.status !== 'recording' || !validSample(sample)) return { ...state, signal: 'unstable' }
  const segments = state.segments.map((segment) => ({ ...segment, points: [...segment.points] }))
  const current = segments[segments.length - 1]
  const previous = current.points[current.points.length - 1]
  if (previous && state.lastAcceptedAt != null) {
    const elapsed = (sample.timestamp - state.lastAcceptedAt) / 1000
    if (elapsed <= 0 || distanceBetweenPoints(previous, sample) / elapsed > MAX_REASONABLE_SPEED_MPS)
      return { ...state, signal: 'unstable' }
  }
  current.points.push({
    latitude: sample.latitude,
    longitude: sample.longitude,
    ...(sample.altitude === undefined ? {} : { altitude: sample.altitude }),
  })
  return {
    ...state,
    segments,
    lastAcceptedAt: sample.timestamp,
    signal: 'good',
  }
}

export function pauseTracking(state: HikingTrackerState, now = Date.now()): HikingTrackerState {
  return state.status === 'recording'
    ? {
        ...state,
        status: 'paused',
        activeSeconds: currentActiveSeconds(state, now),
        activeStartedAt: null,
        lastAcceptedAt: null,
      }
    : state
}

export function interruptTracking(state: HikingTrackerState, now = Date.now()): HikingTrackerState {
  return state.status === 'recording'
    ? {
        ...state,
        status: 'paused',
        activeSeconds: currentActiveSeconds(state, now),
        activeStartedAt: null,
        lastAcceptedAt: null,
        signal: 'interrupted',
      }
    : state
}

export function endTracking(state: HikingTrackerState, now = Date.now()): HikingTrackerState {
  return state.status === 'ended'
    ? state
    : {
        ...state,
        status: 'ended',
        activeSeconds: currentActiveSeconds(state, now),
        activeStartedAt: null,
        lastAcceptedAt: null,
      }
}
