// 保护导入页错误映射，文件失败时保留页面而不生成路线。
import { parseSelectedKml } from '../../src/subpackages/hiking/hiking-import/hiking-import-view'

describe('徒步 KML 导入页', () => {
  it('解析有效路线并返回本机预览数据', () => {
    const xml =
      '<kml><Placemark><LineString><coordinates>113,23 113.01,23.01</coordinates></LineString></Placemark></kml>'
    const result = parseSelectedKml(xml, 'route.kml', xml.length)
    expect(result.error).toBe('')
    expect(result.result?.pointCount).toBe(2)
  })

  it('恶意文件返回可读错误且没有路线', () => {
    const result = parseSelectedKml('<!DOCTYPE kml><kml/>', 'bad.kml', 24)
    expect(result.result).toBeNull()
    expect(result.error).toContain('不安全')
  })
})
