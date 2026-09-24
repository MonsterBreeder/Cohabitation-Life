export type TabName = 'home' | 'ledger' | 'footprint' | 'life' | 'mine'

/** 底部五个入口沿用项目确认可显示的 Wot UI 线稿图标，路径语义集中维护。 */
export const TAB_ITEMS: Array<{ name: TabName; title: string; icon: string; path: string }> = [
  { name: 'home', title: '首页', icon: 'home', path: '/pages/index/index' },
  { name: 'ledger', title: '账本', icon: 'book', path: '/pages/ledger/index' },
  { name: 'footprint', title: '足迹', icon: 'location', path: '/pages/footprint/index' },
  { name: 'life', title: '生活', icon: 'apps', path: '/pages/life/index' },
  { name: 'mine', title: '我的', icon: 'user', path: '/pages/profile/index' },
]

/** 当前入口不重复跳转；未知入口也不会产生错误地址。 */
export function tabDestination(current: TabName, next: TabName): string | null {
  if (current === next) return null
  return TAB_ITEMS.find((item) => item.name === next)?.path || null
}
