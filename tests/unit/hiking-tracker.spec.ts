// 保护现场记录状态机；即使能力暂未开放，也先锁住暂停与中断的数据语义。
import {
  acceptTrackingSample,
  createHikingTrackerState,
  currentActiveSeconds,
  endTracking,
  interruptTracking,
  pauseTracking,
  startTracking,
} from '../../src/utils/hiking-tracker'

describe('徒步现场记录状态机', () => {
  const sample = (timestamp: number, longitude: number, accuracy = 10) => ({
    timestamp,
    longitude,
    latitude: 30,
    accuracy,
  })

  it('暂停继续形成两段且只累计有效时长', () => {
    let state = startTracking(createHikingTrackerState(), 1_000)
    state = acceptTrackingSample(state, sample(1_000, 120))
    state = acceptTrackingSample(state, sample(11_000, 120.0001))
    state = pauseTracking(state, 11_000)
    state = startTracking(state, 101_000)
    state = acceptTrackingSample(state, sample(101_000, 120.001))
    state = acceptTrackingSample(state, sample(106_000, 120.0011))
    state = pauseTracking(state, 106_000)
    expect(state.segments).toHaveLength(2)
    expect(state.activeSeconds).toBe(15)
  })

  it('没有新的定位点时计时仍然按秒前进，暂停后停止', () => {
    const recording = startTracking(createHikingTrackerState(), 1_000)
    expect(currentActiveSeconds(recording, 6_400)).toBe(5)
    const paused = pauseTracking(recording, 6_400)
    expect(currentActiveSeconds(paused, 20_000)).toBe(5)
  })

  it('拒绝低精度、时间倒退和明显瞬移', () => {
    let state = startTracking(createHikingTrackerState())
    state = acceptTrackingSample(state, sample(1_000, 120, 150))
    expect(state.segments[0].points).toHaveLength(0)
    state = acceptTrackingSample(state, sample(2_000, 120))
    state = acceptTrackingSample(state, sample(1_000, 120.1))
    expect(state.segments[0].points).toHaveLength(1)
    expect(state.signal).toBe('unstable')
  })

  it('中断后不补线并能结束', () => {
    let state = startTracking(createHikingTrackerState())
    state = acceptTrackingSample(state, sample(1_000, 120))
    state = interruptTracking(state)
    expect(state.signal).toBe('interrupted')
    state = startTracking(state)
    expect(state.segments).toHaveLength(2)
    expect(endTracking(state).status).toBe('ended')
  })
})
