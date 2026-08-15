import type { TaskEvent } from '../../types/task'

// 任务组件共享的纯函数。

/** 事件行：X 在 Y 时 创建/认领/完成/放弃。 */
export function describeEventLine(event: TaskEvent): string {
  const who = event.actor.nickname || '成员'
  switch (event.kind) {
    case 'create': return `${who} 创建了这件事`
    case 'claim': return `${who} 接手处理`
    case 'complete': return `${who} 完成了`
    case 'abandon': return `${who} 放弃了`
  }
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
