import {
  canAbortRecording,
  createLiveMapModel,
  formatRecordingDuration,
  recordingStatusIcon,
  recordingStatusText,
} from '../../src/subpackages/hiking/hiking-record/hiking-record-view'
import { createHikingTrackerState, interruptTracking, startTracking } from '../../src/utils/hiking-tracker'

describe('徒步现场记录页面状态', () => {
  it('把有效时长显示为稳定的时分秒', () => {
    expect(formatRecordingDuration(0)).toBe('00:00:00')
    expect(formatRecordingDuration(3661.9)).toBe('01:01:01')
  })

  // 保护中断恢复提示：离开前台后必须明确告诉用户路线会从新分段继续。
  it('清楚区分等待定位和意外中断', () => {
    const recording = startTracking(createHikingTrackerState())
    expect(recordingStatusText(recording)).toBe('正在寻找定位信号')
    expect(recordingStatusIcon(recording)).toBe('location')

    const interrupted = interruptTracking(recording)
    expect(recordingStatusText(interrupted)).toContain('新开一段')
    expect(recordingStatusIcon(interrupted)).toBe('pause-circle')
  })

  // 保护实时地图：第一个有效点就必须出现地图和当前位置，第二个点起才绘制路线。
  it('一个定位点即可显示实时地图，两个点开始绘制路线', () => {
    const onePoint = createLiveMapModel([
      { altitudeMode: 'untrusted', points: [{ latitude: 30, longitude: 120 }] },
    ])
    expect(onePoint.hasLocation).toBe(true)
    expect(onePoint.includePoints).toHaveLength(1)
    expect(onePoint.polylines).toHaveLength(0)

    const twoPoints = createLiveMapModel([
      {
        altitudeMode: 'untrusted',
        points: [
          { latitude: 30, longitude: 120 },
          { latitude: 30.001, longitude: 120.001 },
        ],
      },
    ])
    expect(twoPoints.polylines).toHaveLength(1)
    expect(twoPoints.polylines[0].points).toHaveLength(2)
  })

  it('记录中、暂停后和结束后都允许明确中止', () => {
    const recording = startTracking(createHikingTrackerState())
    expect(canAbortRecording(recording)).toBe(true)
    expect(canAbortRecording(interruptTracking(recording))).toBe(true)
    expect(canAbortRecording({ ...recording, status: 'ended' })).toBe(true)
    expect(canAbortRecording(createHikingTrackerState())).toBe(false)
  })
})
