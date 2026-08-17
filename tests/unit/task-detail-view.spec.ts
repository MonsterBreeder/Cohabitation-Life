import {
  describeAbandonConfirmMessage,
  describeActions,
  describeChangedFields,
  describeDueLabel,
  describeEventLine,
  describeStatusLine,
  formatRelativeTime,
} from '../../src/subpackages/task/task-detail/task-detail-view'
import type { TaskDetail, TaskEditField, TaskEvent } from '../../src/types/task'

// 详情页纯函数测试：覆盖 PRD 005 的事件/状态/截止文案，
// 以及 PRD 006 的 changedFields 中文化、edit 可见性、相对时间格式。

function makeDetail(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: 't1',
    type: 'to_handle',
    title: '倒垃圾',
    isOverdueOrToday: false,
    status: 'pending',
    events: [],
    comments: [],
    editVersion: 0,
    ...overrides,
  }
}

describe('describeActions', () => {
  it('pending：claim / complete / abandon / edit 都开放', () => {
    const a = describeActions(makeDetail({ status: 'pending' }))
    expect(a.claim).toBe(true)
    expect(a.complete).toBe(true)
    expect(a.abandon).toBe(true)
    expect(a.edit).toBe(true)
  })

  it('claimed：claim 关闭（已认领），其他仍开放', () => {
    const a = describeActions(makeDetail({ status: 'claimed' }))
    expect(a.claim).toBe(false)
    expect(a.complete).toBe(true)
    expect(a.abandon).toBe(true)
    expect(a.edit).toBe(true)
  })

  it('completed：所有操作都封口', () => {
    const a = describeActions(makeDetail({ status: 'claimed', terminalKind: 'completed', terminalAt: '2026-08-15T10:00:00.000Z' }))
    expect(a.claim).toBe(false)
    expect(a.complete).toBe(false)
    expect(a.abandon).toBe(false)
    expect(a.edit).toBe(false)
  })

  it('abandoned：所有操作都封口', () => {
    const a = describeActions(makeDetail({ status: 'pending', terminalKind: 'abandoned' }))
    expect(a.claim).toBe(false)
    expect(a.complete).toBe(false)
    expect(a.abandon).toBe(false)
    expect(a.edit).toBe(false)
  })

  it('detail 为 undefined：全部关闭', () => {
    const a = describeActions(undefined)
    expect(a).toEqual({ claim: false, complete: false, abandon: false, edit: false })
  })
})

describe('describeStatusLine', () => {
  it('pending → 待处理', () => {
    expect(describeStatusLine(makeDetail({ status: 'pending' }))).toBe('待处理')
  })

  it('claimed → 由 X 处理', () => {
    expect(describeStatusLine(makeDetail({ status: 'claimed', assignee: { nickname: '小美', avatar: { kind: 'builtin', id: 'person-02' } } }))).toBe('由 小美 处理')
  })

  it('completed → 由 X 完成', () => {
    expect(describeStatusLine(makeDetail({ status: 'claimed', terminalKind: 'completed', terminalAt: '2026-08-15T10:00:00.000Z', terminalActor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } } }))).toBe('由 小帅 完成')
  })

  it('abandoned → 由 X 放弃', () => {
    expect(describeStatusLine(makeDetail({ status: 'pending', terminalKind: 'abandoned', terminalActor: { nickname: '小美', avatar: { kind: 'builtin', id: 'person-02' } } }))).toBe('由 小美 放弃')
  })
})

describe('describeChangedFields（PRD 006 R14）', () => {
  it('单字段 → 中文标签', () => {
    expect(describeChangedFields(['name'])).toBe('名称')
    expect(describeChangedFields(['type'])).toBe('类型')
    expect(describeChangedFields(['dueDate'])).toBe('截止日期')
    expect(describeChangedFields(['note'])).toBe('备注')
  })

  it('多字段 → 顿号分隔，顺序固定（name → type → dueDate → note）', () => {
    expect(describeChangedFields(['note', 'name'])).toBe('名称、备注')
    expect(describeChangedFields(['type', 'name', 'note'])).toBe('名称、类型、备注')
  })

  it('空数组 → 空字符串', () => {
    expect(describeChangedFields([])).toBe('')
  })

  it('非数组输入 → 空字符串（防御）', () => {
    expect(describeChangedFields(null as unknown as TaskEditField[])).toBe('')
    expect(describeChangedFields(undefined as unknown as TaskEditField[])).toBe('')
  })

  it('编辑事件行带上 changedFields 详情', () => {
    const event: TaskEvent = {
      kind: 'edit',
      actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
      at: '2026-08-15T10:00:00.000Z',
      changedFields: ['name', 'dueDate'],
    }
    expect(describeEventLine(event)).toBe('小帅 修改了 名称、截止日期')
  })

  it('编辑事件 changedFields 为空 → 兜底文案', () => {
    const event: TaskEvent = {
      kind: 'edit',
      actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
      at: '2026-08-15T10:00:00.000Z',
      changedFields: [],
    }
    expect(describeEventLine(event)).toBe('小帅 编辑了事项')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date('2026-08-15T10:30:00.000Z')

  it('1 分钟内 → 刚刚', () => {
    const iso = new Date(now.getTime() - 30 * 1000).toISOString()
    expect(formatRelativeTime(iso, now)).toBe('刚刚')
  })

  it('N 分钟前', () => {
    const iso = new Date(now.getTime() - 5 * 60 * 1000).toISOString()
    expect(formatRelativeTime(iso, now)).toBe('5 分钟前')
  })

  it('N 小时前', () => {
    const iso = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(iso, now)).toBe('3 小时前')
  })

  it('昨天', () => {
    const iso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(iso, now)).toBe('昨天')
  })

  it('N 天前（2-6 天）', () => {
    const iso = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(formatRelativeTime(iso, now)).toBe('3 天前')
  })

  it('7 天前 → 绝对时间', () => {
    const iso = new Date('2026-08-01T10:00:00.000Z').toISOString()
    const out = formatRelativeTime(iso, now)
    expect(out).toMatch(/^2026-08-01 \d{2}:\d{2}$/)
  })

  it('空字符串 → 空', () => {
    expect(formatRelativeTime('', now)).toBe('')
  })

  it('非法字符串 → 原样返回', () => {
    expect(formatRelativeTime('not-a-date', now)).toBe('not-a-date')
  })
})

describe('describeAbandonConfirmMessage', () => {
  it('有 detail → 用标题', () => {
    expect(describeAbandonConfirmMessage(makeDetail({ title: '扔垃圾' }))).toBe('「扔垃圾」放弃后不可重新打开。是否继续？')
  })

  it('无 detail → 默认文案', () => {
    expect(describeAbandonConfirmMessage(undefined)).toBe('放弃后不可重新打开。是否继续？')
  })
})

describe('describeDueLabel', () => {
  it('无截止 → 无截止日期', () => {
    expect(describeDueLabel(makeDetail(), '2026-08-15')).toBe('无截止日期')
  })

  it('今天 → 今天到期', () => {
    expect(describeDueLabel(makeDetail({ dueDate: '2026-08-15' }), '2026-08-15')).toBe('今天到期')
  })

  it('昨天 → 已逾期', () => {
    expect(describeDueLabel(makeDetail({ dueDate: '2026-08-14' }), '2026-08-15')).toBe('已逾期')
  })

  it('未来 → yyyy-MM-dd 到期', () => {
    expect(describeDueLabel(makeDetail({ dueDate: '2026-08-20' }), '2026-08-15')).toBe('2026-08-20 到期')
  })
})
