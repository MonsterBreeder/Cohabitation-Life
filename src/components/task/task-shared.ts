import type { TaskEvent, TaskType } from '../../types/task'

// 任务组件共享的纯函数与常量。
// 这里的所有内容必须放在主包内：主包 components 不能 require 分包代码，
// 分包 page 可以 require 主包（task-shared）— 这是微信小程序的硬规则。

/** 事项类型下拉选项：添加页、详情页、首页分组卡片都从这里读，避免在子包里重复定义。 */
export const TASK_TYPES_DISPLAY: { value: TaskType; label: string; description: string }[] = [
  { value: 'low_stock', label: '快没了', description: '纸巾、洗衣液等用完前提醒' },
  { value: 'to_handle', label: '待处理', description: '退货、维修、联系房东等' },
  { value: 'expiring', label: '快到期', description: '房租、会员、滤芯等到期前提醒' },
]

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
