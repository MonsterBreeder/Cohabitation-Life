import type { TaskDetail, TaskEditField, TaskEvent } from '../../../types/task'

// 详情页与测试共用的纯函数：操作按钮可见性、终止态文案、事件展示文案、编辑字段中文映射。

export type DetailAction = 'claim' | 'complete' | 'abandon' | 'edit'

export interface ActionAvailability {
  claim: boolean
  complete: boolean
  abandon: boolean
  /** 编辑：未终止时（pending / claimed）开放；终止态封口。 */
  edit: boolean
}

/** 任一成员都能完成/放弃/编辑；只有未负责人的事项可被认领。终止态全部禁用。 */
export function describeActions(detail: TaskDetail | undefined): ActionAvailability {
  if (!detail) return { claim: false, complete: false, abandon: false, edit: false }
  // detail.status 字段是 OpenTaskStatus（pending/claimed）；终止态通过 terminalKind 表达。
  const isTerminal = Boolean(detail.terminalKind)
  return {
    claim: !isTerminal && detail.status === 'pending',
    complete: !isTerminal,
    abandon: !isTerminal,
    edit: !isTerminal,
  }
}

/** 顶部状态行：待处理 / 已认领（X 处理）/ 已完成（X 完成）/ 已放弃（X 放弃）。 */
export function describeStatusLine(detail: TaskDetail | undefined): string {
  if (!detail) return '加载中'
  // 终止态优先：detail.status 字段是 OpenTaskStatus，终止态由 terminalKind 表达。
  if (detail.terminalKind === 'completed') {
    const who = detail.terminalActor?.nickname || '成员'
    return `由 ${who} 完成`
  }
  if (detail.terminalKind === 'abandoned') {
    const who = detail.terminalActor?.nickname || '成员'
    return `由 ${who} 放弃`
  }
  if (detail.status === 'pending') return '待处理'
  if (detail.status === 'claimed') {
    const who = detail.assignee?.nickname || '成员'
    return `由 ${who} 处理`
  }
  return '已结束'
}

// 编辑字段名 → 中文显示名（PRD 006 R14）。
// 顺序稳定：name → type → dueDate → note，UI 展示按这个顺序。
const EDIT_FIELD_LABEL: Record<TaskEditField, string> = {
  name: '名称',
  type: '类型',
  dueDate: '截止日期',
  note: '备注',
}

const EDIT_FIELD_ORDER: readonly TaskEditField[] = ['name', 'type', 'dueDate', 'note'] as const

/** 把 changedFields 数组渲染成"名称、类型"这种顿号分隔的中文标签串。空数组返回空字符串。 */
export function describeChangedFields(changedFields: readonly TaskEditField[]): string {
  if (!Array.isArray(changedFields) || changedFields.length === 0) return ''
  // 按固定顺序输出，避免 created/edited 顺序不同导致展示抖动
  const sorted = EDIT_FIELD_ORDER.filter((f) => changedFields.includes(f))
  return sorted.map((f) => EDIT_FIELD_LABEL[f]).join('、')
}

/** 事件行：X 在 Y 时 创建/认领/完成/放弃/编辑。编辑事件会带上具体改了哪些字段。 */
export function describeEventLine(event: TaskEvent): string {
  const who = event.actor.nickname || '成员'
  switch (event.kind) {
    case 'create': return `${who} 创建了这件事`
    case 'claim': return `${who} 接手处理`
    case 'complete': return `${who} 完成了`
    case 'abandon': return `${who} 放弃了`
    case 'edit': {
      const fields = describeChangedFields(event.changedFields)
      return fields ? `${who} 修改了 ${fields}` : `${who} 编辑了事项`
    }
  }
}

/** 给定终止动作，需要先弹二次确认的文案。 */
export function describeAbandonConfirmMessage(detail: TaskDetail | undefined): string {
  if (!detail) return '放弃后不可重新打开。是否继续？'
  return `「${detail.title}」放弃后不可重新打开。是否继续？`
}

/** 给定事项截止日期，给出"今天/已逾期/N 天后"等相对描述。 */
export function describeDueLabel(detail: TaskDetail, today: string): string {
  if (!detail.dueDate) return '无截止日期'
  if (detail.dueDate === today) return '今天到期'
  if (detail.dueDate < today) return '已逾期'
  return `${detail.dueDate} 到期`
}

/** 相对时间格式：把 ISO 时间渲染成"刚刚/N 分钟前/N 小时前/昨天/MM-DD"等。 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 0) {
    // 未来时间（不应该出现，但兜底显示 yyyy-MM-dd HH:mm）
    return formatAbsolute(date)
  }
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return '昨天'
  if (diffDay < 7) return `${diffDay} 天前`
  return formatAbsolute(date)
}

function formatAbsolute(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}
