import type { CompletedTaskItem } from '../../../types/task'

// 已完成/已放弃列表与测试共用的纯函数。

export type CompletedFilter = 'all' | 'completed' | 'abandoned'

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
