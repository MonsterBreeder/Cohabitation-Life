// 保护 WGS 84 到微信地图坐标的转换边界。
import { gcj02ToWgs84, wgs84ToGcj02 } from '../../src/utils/hiking-coordinate'

describe('徒步地图坐标转换', () => {
  it('国内坐标转换到已知范围', () => {
    const converted = wgs84ToGcj02({ latitude: 39.908823, longitude: 116.39747 })
    expect(converted.latitude).toBeCloseTo(39.910226, 4)
    expect(converted.longitude).toBeCloseTo(116.403714, 4)
  })

  it('境外坐标保持原值和海拔', () => {
    expect(wgs84ToGcj02({ latitude: 48.8566, longitude: 2.3522, altitude: 35 })).toEqual({
      latitude: 48.8566,
      longitude: 2.3522,
      altitude: 35,
    })
  })

  // 保护现场定位：微信返回的 GCJ-02 保存前要还原，之后再次显示不能发生二次偏移。
  it('现场定位往返转换保持在可接受误差内', () => {
    const source = { latitude: 23.1291, longitude: 113.2644 }
    const restored = gcj02ToWgs84(wgs84ToGcj02(source))

    expect(Math.abs(restored.latitude - source.latitude)).toBeLessThan(0.00002)
    expect(Math.abs(restored.longitude - source.longitude)).toBeLessThan(0.00002)
  })
})
