import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { TAB_ITEMS, tabDestination } from '../../src/components/app-tabbar'

const projectRoot = resolve(__dirname, '../..')
const homeSource = readFileSync(resolve(projectRoot, 'src/pages/index/index.vue'), 'utf8')
const lifeSource = readFileSync(resolve(projectRoot, 'src/pages/life/index.vue'), 'utf8')
const ledgerSource = readFileSync(resolve(projectRoot, 'src/pages/ledger/index.vue'), 'utf8')
const footprintSource = readFileSync(resolve(projectRoot, 'src/pages/footprint/index.vue'), 'utf8')
const taskListSource = readFileSync(resolve(projectRoot, 'src/components/task/TaskList.vue'), 'utf8')
const familyCoverSource = readFileSync(
  resolve(projectRoot, 'src/pages/index/components/HomeFamilyCover.vue'),
  'utf8',
)
const iconFontSource = readFileSync(
  resolve(projectRoot, 'node_modules/@wot-ui/ui/components/wd-icon/iconfont.scss'),
  'utf8',
)

describe('温暖生活视觉系统', () => {
  it('保留五个底部入口、原有路径和当前页防重复跳转', () => {
    expect(TAB_ITEMS.map((item) => [item.name, item.path])).toEqual([
      ['home', '/pages/index/index'],
      ['ledger', '/pages/ledger/index'],
      ['footprint', '/pages/footprint/index'],
      ['life', '/pages/life/index'],
      ['mine', '/pages/profile/index'],
    ])
    expect(tabDestination('home', 'ledger')).toBe('/pages/ledger/index')
    expect(tabDestination('life', 'life')).toBeNull()
  })

  it('底部与事项新增图标都存在于实际打包字体中', () => {
    for (const icon of [...TAB_ITEMS.map((item) => item.icon), 'store', 'check', 'time-line']) {
      expect(iconFontSource).toContain(`.wd-icon-${icon}:before`)
    }
  })

  it('首页保持家庭、账本、足迹、事项、完成记录的阅读顺序', () => {
    const markers = [
      '<HomeFamilyCover',
      '<MonthlyExpenseCard',
      '<HomeFootprintCard',
      '<TaskList',
      'home-completed-link',
    ]
    const positions = markers.map((marker) => homeSource.indexOf(marker))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('生活页只把徒步作为已开放入口并保留固定名称', () => {
    expect(lifeSource).toContain('共同生活小架子')
    expect(lifeSource).toContain('/static/warm-life/life/hiking-shelf.png')
  })

  it('三类生活插画在有数据时进入现有标题，不在列表前增加独立行', () => {
    expect(taskListSource).toContain('data-testid="home-tasks-scene"')
    expect(taskListSource).toContain('sectionIdx === 0')
    expect(homeSource).not.toContain('home-tasks__scene')
    expect(ledgerSource).toContain('data-testid="ledger-home-scene"')
    expect(ledgerSource).toContain('groupIdx === 0')
    expect(ledgerSource).not.toContain('ledger-home__scene-label')
    expect(footprintSource).toContain('data-testid="footprint-map-scene"')
    expect(footprintSource).toContain('data-testid="footprint-list-scene"')
    expect(homeSource).not.toContain('home-tasks__scene-note')
    expect(ledgerSource).not.toContain('ledger-home__scene-note')
    expect(footprintSource).not.toContain('class="footprint-page__scene"')
  })

  it('有数据插画直接使用页面原生节点，避免动态公共组件破坏小程序渲染树', () => {
    for (const source of [homeSource, taskListSource, ledgerSource, footprintSource]) {
      expect(source).not.toContain('WarmSceneRibbon')
    }
    expect(taskListSource).toContain('class="task-list__section-illustration"')
    expect(ledgerSource).toContain('class="ledger-home__group-illustration"')
    expect(footprintSource).toContain('class="footprint-page__section-illustration"')
    expect(homeSource).not.toContain('min-height: 132rpx')
    expect(ledgerSource).not.toContain('min-height: 132rpx')
    expect(footprintSource).not.toContain('min-height: 132rpx')
  })

  it('家庭封面用横向成员名牌和共同可见状态收拢空间', () => {
    expect(familyCoverSource).toContain('family-cover__footer')
    expect(familyCoverSource).toContain('仅家人共同可见')
    expect(familyCoverSource).toContain('两个人的日子，正在一起记录')
  })

  it('新增运行时图片完整且总体不超过 200KB', () => {
    const assets = [
      'objects/home-cups.png',
      'life/hiking-shelf.png',
      'scenes/empty-tasks.png',
      'scenes/empty-ledger.png',
      'scenes/empty-footprint.png',
    ]
    const bytes = assets.reduce((total, asset) => {
      const path = resolve(projectRoot, 'src/static/warm-life', asset)
      expect(existsSync(path)).toBe(true)
      return total + statSync(path).size
    }, 0)
    expect(bytes).toBeLessThanOrEqual(200 * 1024)
  })
})
