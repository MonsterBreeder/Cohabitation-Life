// 保护无路线补录的最小条件和成果换算。
import {
  createEmptyHikingFormDraft,
  hikingFormMetrics,
  placeFromChooseLocation,
  validateHikingForm,
} from '../../src/subpackages/hiking/hiking-form/hiking-form-view'

describe('徒步补录表单', () => {
  it('无路线时必须有名称和地点', () => {
    const draft = createEmptyHikingFormDraft()
    expect(validateHikingForm(draft)).toContain('名称')
    draft.name = '周末散步'
    expect(validateHikingForm(draft)).toContain('地点')
    draft.place = placeFromChooseLocation({
      name: '白云山',
      address: '广州',
      latitude: 23.18,
      longitude: 113.3,
    })
    expect(validateHikingForm(draft)).toBeNull()
  })

  it('手填距离和时长计算平均速度，缺失时不猜测', () => {
    const draft = createEmptyHikingFormDraft()
    draft.manualDistanceKm = '6'
    draft.durationMinutes = '120'
    expect(hikingFormMetrics(draft).averageSpeedKmh).toBe(3)
    draft.durationMinutes = ''
    expect(hikingFormMetrics(draft).averageSpeedKmh).toBeNull()
  })
})
