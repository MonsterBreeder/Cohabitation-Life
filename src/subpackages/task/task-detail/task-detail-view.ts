import type { TaskDetail, TaskEvent } from '../../../types/task'

// 详情页与测试共用的纯函数：操作按钮可见性、终止态文案、事件展示文案。

export type DetailAction = 'claim' | 'complete' | 'abandon'

export interface ActionAvailability {
  claim: boolean
  complete: boolean
  abandon: boolean
}

/** 任一成员都能完成/放弃；只有未负责人的事项可被认领。终止态全部禁用。 */
export function describeActions(detail: TaskDetail | undefined): ActionAvailability {
  if (!detail) return { claim: false, complete: false, abandon: false }
  // detail.status 字段是 OpenTaskStatus（pending/claimed）；终止态通过 terminalKind 表达。
  const isTerminal = Boolean(detail.terminalKind)
  return {
    claim: !isTerminal && detail.status === 'pending',
    complete: !isTerminal,
    abandon: !isTerminal,
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
