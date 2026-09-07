import { describeFootprintLocationFailure, normaliseFootprintPlace } from '../../src/utils/footprint-location'

describe('footprint location helpers', () => {
  it('normalises a valid WeChat location result', () => {
    expect(normaliseFootprintPlace({ name: ' 广州塔 ', address: ' 海珠区 ', latitude: 23.1064, longitude: 113.3246 }))
      .toEqual({ name: '广州塔', address: '海珠区', latitude: 23.1064, longitude: 113.3246 })
  })

  it('rejects missing names and invalid coordinates', () => {
    expect(normaliseFootprintPlace({ name: '', address: '', latitude: 23, longitude: 113 })).toBeNull()
    expect(normaliseFootprintPlace({ name: '地点', address: '', latitude: 91, longitude: 113 })).toBeNull()
  })

  it('treats user cancellation as a silent result', () => {
    expect(describeFootprintLocationFailure({ errMsg: 'chooseLocation:fail cancel' })).toEqual({ ok: false, reason: 'cancelled', message: null })
  })

  it('distinguishes permission, privacy and temporary failures', () => {
    expect(describeFootprintLocationFailure({ errMsg: 'chooseLocation:fail auth deny' }).reason).toBe('denied')
    expect(describeFootprintLocationFailure({ errMsg: 'api scope is not declared in the privacy agreement' }).reason).toBe('privacy')
    expect(describeFootprintLocationFailure({ errMsg: 'system error' }).reason).toBe('unavailable')
  })
})
