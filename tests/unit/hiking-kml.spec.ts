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

  it('解析带外部图标样式的 gx Track 轨迹，且不读取样式链接', () => {
    // 二步路等软件会把轨迹导出为 gx:Track，图标 href 只是样式元数据。
    const xml = `
      <kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
        <Document>
          <Style><IconStyle><Icon><href>https://files.example.com/marker.png</href></Icon></IconStyle></Style>
          <Placemark>
            <gx:Track>
              <gx:coord>112.982684 22.918248 2.000000</gx:coord>
              <gx:coord>112.983684 22.919248 3.000000</gx:coord>
            </gx:Track>
          </Placemark>
          <Placemark>
            <gx:Track>
              <gx:coord>112.980142 22.918455 72.000000</gx:coord>
              <gx:coord>112.981142 22.919455 73.000000</gx:coord>
            </gx:Track>
          </Placemark>
        </Document>
      </kml>`
    const result = parseHikingKml(xml, { fileName: '2bulu.kml' })
    expect(result.segmentCount).toBe(2)
    expect(result.pointCount).toBe(4)
    expect(result.route.segments[0].points[0]).toEqual({
      longitude: 112.982684,
      latitude: 22.918248,
      altitude: 2,
    })
    expect(result.metrics.elevationGainMeters).toBeNull()
  })

  it('读取 KML 附带的累计爬升和扣除暂停后的有效时长', () => {
    // 二步路将运动成果写在 Document 的扩展字段，坐标海拔没有 absolute 声明时仍可使用明确给出的累计爬升。
    const xml = `<kml xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><ExtendedData>
      <Data name="BeginTime"><value>1789877229708</value></Data>
      <Data name="EndTime"><value>1789890335190</value></Data>
      <Data name="PauseTime"><value>637000</value></Data>
      <Data name="ElevationGain"><value>400</value></Data>
    </ExtendedData><Placemark><gx:Track><gx:coord>113 23 2</gx:coord><gx:coord>113.001 23.001 8</gx:coord></gx:Track></Placemark></Document></kml>`
    const result = parseHikingKml(xml)
    expect(result.route.importedMetrics).toEqual({ elevationGainMeters: 400, durationSeconds: 12468 })
    expect(result.metrics.elevationGainMeters).toBe(400)
    expect(result.metrics.durationSeconds).toBe(12468)
    expect(result.metrics.highestAltitudeMeters).toBeNull()
  })

  it('忽略超界或不完整的 KML 扩展成果', () => {
    // 外部文件的扩展字段不能绕过缺失值规则或带入负数。
    const xml = `<kml><Document><ExtendedData>
      <Data name="BeginTime"><value>1789877229708</value></Data>
      <Data name="EndTime"><value>1789877229708</value></Data>
      <Data name="PauseTime"><value>-1</value></Data>
      <Data name="ElevationGain"><value>-400</value></Data>
    </ExtendedData><Placemark><LineString><coordinates>113,23 113.001,23.001</coordinates></LineString></Placemark></Document></kml>`
    const result = parseHikingKml(xml)
    expect(result.route.importedMetrics).toBeUndefined()
    expect(result.metrics.durationSeconds).toBeNull()
    expect(result.metrics.elevationGainMeters).toBeNull()
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

  it('拒绝远程路线、错误扩展名和超大文件', () => {
    expect(() =>
      parseHikingKml(
        '<kml><NetworkLink><Link><href>https://example.com/a.kml</href></Link></NetworkLink></kml>',
      ),
    ).toThrow('不支持')
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
