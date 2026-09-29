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

  it('导入路线自动显示文件时长，手填时长可覆盖文件值', () => {
    // 预览、表单和最终传给云端的时长必须采用同一口径。
    const draft = createEmptyHikingFormDraft()
    draft.route = {
      version: 1,
      source: 'kml',
      importedMetrics: { durationSeconds: 12468, elevationGainMeters: 400 },
      segments: [
        {
          altitudeMode: 'untrusted',
          points: [
            { latitude: 23, longitude: 113 },
            { latitude: 23.001, longitude: 113.001 },
          ],
        },
      ],
    }
    expect(hikingFormMetrics(draft)).toMatchObject({ durationSeconds: 12468, elevationGainMeters: 400 })
    draft.durationMinutes = '180'
    expect(hikingFormMetrics(draft).durationSeconds).toBe(10800)
  })
})
