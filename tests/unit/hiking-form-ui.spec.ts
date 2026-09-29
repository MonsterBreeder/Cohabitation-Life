// 保护共同徒步编辑页在小程序中的保存入口与字段说明，避免路线显示事件和组件无效属性造成回归。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, '../../src/subpackages/hiking/hiking-form/index.vue'), 'utf8')

describe('共同徒步编辑表单', () => {
  it('导入页确认过的路线不再依赖地图更新事件解锁保存', () => {
    expect(source).not.toContain('routeReady')
    expect(source).toContain(':disabled="saving || selectingPhotos"')
  })

  it('名称、有效时长和感受有可见标题，日期地点使用同一行布局', () => {
    // 当前 Wot 输入组件不呈现 label 属性，业务标题需要独立文本节点。
    expect(source).toContain('<text class="hiking-form__field-label">名称</text>')
    expect(source).toContain('<text class="hiking-form__field-label">有效时长</text>')
    expect(source).toContain('<text class="hiking-form__field-unit">分钟</text>')
    expect(source).toContain('<text class="hiking-form__memory-label">感受</text>')
    expect(source).toContain('class="hiking-form__field-control"')
  })
})
