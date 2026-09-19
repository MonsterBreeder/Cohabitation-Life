// 保护 KML 导入的兼容范围与安全边界，失败时不能生成半截路线。
import fs from 'fs'
import path from 'path'
import { HikingKmlError } from '../../src/types/hiking'
import { HIKING_KML_MAX_BYTES, parseHikingKml } from '../../src/utils/hiking-kml'

const fixture = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/kml', name), 'utf8')

describe('徒步 KML 解析', () => {
  it('解析单段绝对海拔路线并计算实际成果', () => {
    const result = parseHikingKml(fixture('valid-linestring.kml'), { fileName: 'route.KML' })
    expect(result.segmentCount).toBe(1)
    expect(result.pointCount).toBe(3)
    expect(result.metrics.distanceMeters).toBeGreaterThan(200)
    expect(result.metrics.elevationGainMeters).toBe(5)
    expect(result.metrics.highestAltitudeMeters).toBe(47)
  })

  it('保留多段，不连接两个未知路段', () => {
    const result = parseHikingKml(fixture('valid-multi-segment.kml'))
    expect(result.route.segments).toHaveLength(2)
    expect(result.pointCount).toBe(4)
  })

  it('没有明确绝对海拔时不猜测海拔成果', () => {
    const result = parseHikingKml(fixture('missing-altitude.kml'))
    expect(result.metrics.elevationGainMeters).toBeNull()
    expect(result.metrics.highestAltitudeMeters).toBeNull()
  })

  it.each([
    ['doctype-entity.kml', 'UNSAFE_XML'],
    ['invalid-coordinate.kml', 'INVALID_COORDINATE'],
  ])('拒绝不可信夹具 %s', (name, code) => {
    expect(() => parseHikingKml(fixture(name))).toThrow(HikingKmlError)
    try {
      parseHikingKml(fixture(name))
    } catch (error) {
      expect((error as HikingKmlError).code).toBe(code)
    }
  })

  it('拒绝远程资源、gx Track、错误扩展名和超大文件', () => {
    expect(() =>
      parseHikingKml(
        '<kml><NetworkLink><Link><href>https://example.com/a.kml</href></Link></NetworkLink></kml>',
      ),
    ).toThrow('不支持')
    expect(() => parseHikingKml('<kml xmlns:gx="x"><gx:Track /></kml>')).toThrow('不支持')
    expect(() => parseHikingKml(fixture('valid-linestring.kml'), { fileName: 'route.kmz' })).toThrow(
      'KML 格式',
    )
    expect(() => parseHikingKml('', { byteLength: HIKING_KML_MAX_BYTES + 1 })).toThrow('5 MB')
  })

  it('在三秒内解析公开上限的 20000 个路线点', () => {
    const coordinates = Array.from(
      { length: 20_000 },
      (_, index) => `${113 + index * 0.000001},${23 + index * 0.000001}`,
    ).join(' ')
    const xml = `<kml><Document><Placemark><LineString><coordinates>${coordinates}</coordinates></LineString></Placemark></Document></kml>`
    const startedAt = performance.now()
    const result = parseHikingKml(xml)
    expect(result.pointCount).toBe(20_000)
    expect(performance.now() - startedAt).toBeLessThan(3_000)
  })
})
