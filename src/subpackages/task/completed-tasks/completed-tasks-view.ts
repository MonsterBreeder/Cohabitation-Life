import type { CompletedTaskItem } from '../../../types/task'

// 已完成/已放弃列表与测试共用的纯函数。

export type CompletedFilter = 'all' | 'completed' | 'abandoned'

/** 按状态过滤：保留旧行为以兼容现有单测；新页面不再用过滤，改用日期分组。 */
export function filterCompleted(items: CompletedTaskItem[], filter: CompletedFilter): CompletedTaskItem[] {
  if (filter === 'all') return items
  return items.filter((item) => item.terminalKind === filter)
}

export function describeTerminalLine(item: CompletedTaskItem): string {
  const who = item.terminalActor?.nickname || '成员'
  if (item.terminalKind === 'completed') return `由 ${who} 完成`
  if (item.terminalKind === 'abandoned') return `由 ${who} 放弃`
  return '已结束'
}

export function describeTerminalLabel(kind: 'completed' | 'abandoned'): string {
  if (kind === 'completed') return '已完成'
  return '已放弃'
}

export function formatTerminalTime(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** 把 ISO 时间转成当天本地 YYYY-MM-DD 键（按设备时区切分日历日）。 */
export function terminalDateKey(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** 单一日期分组：YYYY-MM-DD + 当天的事项。 */
export interface TerminalDateGroup {
  dateKey: string
  items: CompletedTaskItem[]
}

/** 把完成/放弃列表按 terminalAt 的本地日历日分组，保持原顺序（云端已按时间倒序返回）。 */
export function groupByTerminalDate(items: CompletedTaskItem[]): TerminalDateGroup[] {
  const groups: TerminalDateGroup[] = []
  for (const item of items) {
    const key = terminalDateKey(item.terminalAt)
    if (!key) continue
    const tail = groups[groups.length - 1]
    if (tail && tail.dateKey === key) {
      tail.items.push(item)
    } else {
      groups.push({ dateKey: key, items: [item] })
    }
  }
  return groups
}

/** 把已经按 key 顺序排好的分组倒序排列，让最近日期在最上面。 */
export function sortGroupsNewestFirst(groups: TerminalDateGroup[]): TerminalDateGroup[] {
  return [...groups].sort((a, b) => (a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : 0))
}

/**
 * 日期键转成人类可读的标题。
 * - 同一年的日期：M月D日
 * - 跨年：YYYY-MM-DD
 * 今天 / 昨天 单独标记，让"最近的事"一眼可见。
 */
export function describeTerminalDateLabel(dateKey: string, now: Date = new Date()): string {
  if (!dateKey) return ''
  const [y, m, d] = dateKey.split('-').map((s) => Number(s))
  if (!y || !m || !d) return dateKey
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(y, m - 1, d)
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000)
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  // 同一年用 M月D日，更亲切；跨年用完整日期避免歧义
  if (target.getFullYear() === today.getFullYear()) return `${m}月${d}日`
  return dateKey
}
