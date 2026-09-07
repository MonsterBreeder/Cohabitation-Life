import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as Vue from 'vue'
import { compile } from '@vue/compiler-dom'
import { parse } from '@vue/compiler-sfc'

// 编译真实页面模板验证条件分支；将原生/Wot 标签当作不展开的边界，不模拟地图瓦片或云端请求。
const source = readFileSync(resolve(__dirname, '../../src/pages/footprint/index.vue'), 'utf8')
const template = parse(source).descriptor.template!.content
const { code } = compile(template, { mode: 'function', prefixIdentifiers: true, isCustomElement: (tag) => !['wd-segmented', 'wd-popup'].includes(tag) })
// 带 v-model 的边界保留组件编译语义，其内部交互不是本次模板回归的验证目标。
const render = new Function('Vue', code)({ ...Vue, resolveComponent: (name: string) => name })

function renderPage(overrides: Record<string, unknown> = {}) {
  const context = {
    checkingHome: false, household: { id: 'test-home' }, pageError: '', phase: 'idle',
    summary: { placeCount: 0 }, mode: 'map', modeLabel: '地图', modeOptions: ['地图', '列表'],
    mapError: null, listError: null, places: [], visibleMarkers: [], includePoints: [],
    mapCenter: { latitude: 23.1291, longitude: 113.2644 }, selectedPlace: null,
    filterPlaceKey: '', pending: {}, entries: [], displayEntries: [], photoUrls: {},
    entriesCursor: null, historyNoticeOpen: false, goAdd: jest.fn(), ...overrides,
  }
  const nodes: Vue.VNode[] = []
  function visit(node: unknown): void {
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (!Vue.isVNode(node)) return
    nodes.push(node)
    if (Array.isArray(node.children)) node.children.forEach(visit)
  }
  visit(render(context, []))
  return { nodes, context }
}

describe('没有足迹时的地图展示', () => {
  // 重设计后地图仍是页面主内容，顶部概览、导航和地图容器不能因空数据缺失。
  it('零记录时保留完整的页面信息层级', () => {
    const { nodes } = renderPage()
    expect(nodes.some((node) => node.props?.class === 'footprint-page__hero')).toBe(true)
    expect(nodes.some((node) => node.props?.class === 'footprint-page__navigation')).toBe(true)
    expect(nodes.some((node) => node.props?.class === 'footprint-page__map-shell')).toBe(true)
    expect(nodes.some((node) => node.props?.class === 'footprint-page__map-heading')).toBe(true)
  })

  it('零记录仍渲染地图，且不显示当前位置', () => {
    const { nodes } = renderPage()
    const map = nodes.find((node) => node.type === 'map')
    expect(map).toBeDefined()
    expect(map!.props).toMatchObject({ markers: [], 'show-location': false })
    expect(nodes.some((node) => node.props?.class === 'footprint-page__empty')).toBe(false)
  })
  it('地图下方保留添加第一条记录的入口', () => {
    const { nodes, context } = renderPage()
    const guide = nodes.find((node) => node.props?.class === 'footprint-page__map-guide')
    expect(guide).toBeDefined()
    const add = nodes.find((node) => node.type === 'wd-button' && node.children === '记录第一个地方')
    expect(add).toBeDefined()
    add!.props!.onClick()
    expect(context.goAdd).toHaveBeenCalledTimes(1)
  })
  it('列表模式继续展示空记录卡片，不渲染地图', () => {
    const { nodes } = renderPage({ mode: 'list' })
    expect(nodes.some((node) => node.type === 'map')).toBe(false)
    expect(nodes.some((node) => node.props?.class === 'footprint-page__empty')).toBe(true)
  })
  it('已有地点时保留地图，不再展示首次记录引导', () => {
    const { nodes } = renderPage({ summary: { placeCount: 1 } })
    expect(nodes.some((node) => node.type === 'map')).toBe(true)
    expect(nodes.some((node) => node.props?.class === 'footprint-page__map-guide')).toBe(false)
  })
  it('地图真实失败时保留错误反馈，不伪装成空记录', () => {
    const { nodes } = renderPage({ mapError: '地图不可用' })
    expect(nodes.some((node) => node.props?.class === 'footprint-page__panel-error')).toBe(true)
    expect(nodes.some((node) => node.props?.class === 'footprint-page__map-guide')).toBe(false)
  })
})
