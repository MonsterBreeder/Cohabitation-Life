import { hikingRecordingEntryText } from '../../src/subpackages/hiking/hiking-home/hiking-home-view'
import { createHikingTrackerState, endTracking, startTracking } from '../../src/utils/hiking-tracker'

describe('徒步首页现场记录入口', () => {
  it('不会把已结束草稿误写成继续现场记录', () => {
    expect(hikingRecordingEntryText(null).title).toBe('开始现场记录')
    expect(hikingRecordingEntryText(startTracking(createHikingTrackerState())).title).toBe('继续现场记录')
    expect(hikingRecordingEntryText(endTracking(startTracking(createHikingTrackerState()))).title).toBe(
      '继续整理并保存',
    )
  })
})
