import {
  describeDueDate,
  describeNote,
  describeTitle,
  isDraftReady,
  todayIso,
  type AddTaskDraft,
} from '../../src/subpackages/task/add-task/add-task-view'
import type { TaskDetail } from '../../src/types/task'

describe('add-task-view', () => {
  const today = '2026-08-14'

  describe('describeTitle', () => {
    it('returns valid for non-empty title within limit', () => {
      const result = describeTitle('Buy detergent')
      expect(result.valid).toBe(true)
      expect(result.value).toBe('Buy detergent')
      expect(result.remaining).toBe(7) // 20 - 13 chars (incl. space)
      expect(result.errorMessage).toBe('')
    })

    it('rejects empty title', () => {
      const result = describeTitle('   ')
      expect(result.valid).toBe(false)
      expect(result.errorMessage).toBe('请输入事项名称')
    })

    it('rejects multi-line title', () => {
      const result = describeTitle('line1\nline2')
      expect(result.valid).toBe(false)
      expect(result.errorMessage).toBe('事项名称不能换行')
    })

    it('rejects 21-char title', () => {
      const result = describeTitle('123456789012345678901')
      expect(result.valid).toBe(false)
      expect(result.errorMessage).toContain('20')
    })
  })

  describe('describeNote', () => {
    it('accepts empty note (optional)', () => {
      const result = describeNote('')
      expect(result.valid).toBe(true)
      expect(result.errorMessage).toBe('')
    })

    it('accepts note within limit', () => {
      const result = describeNote('replace detergent first')
      expect(result.valid).toBe(true)
    })

    it('rejects 101-char note', () => {
      const result = describeNote('a'.repeat(101))
      expect(result.valid).toBe(false)
      expect(result.errorMessage).toContain('100')
    })
  })

  describe('describeDueDate', () => {
    it('accepts empty due date', () => {
      expect(describeDueDate(undefined, today)).toEqual({ valid: true, errorMessage: '' })
    })

    it('rejects malformed date', () => {
      const result = describeDueDate('今天', today)
      expect(result.valid).toBe(false)
      expect(result.errorMessage).toBe('请选择有效的截止日期')
    })

    it('rejects past date', () => {
      const result = describeDueDate('2026-08-13', today)
      expect(result.valid).toBe(false)
      expect(result.errorMessage).toBe('截止日期不能早于今天')
    })

    it('accepts future date', () => {
      const result = describeDueDate('2026-08-20', today)
      expect(result.valid).toBe(true)
    })
  })

  describe('isDraftReady', () => {
    it('returns true when all required fields are valid', () => {
      const draft: AddTaskDraft = { title: 'Buy detergent', type: 'low_stock', dueDate: '2026-08-20', note: '' }
      expect(isDraftReady(draft, today)).toBe(true)
    })

    it('returns false when type is missing', () => {
      const draft: AddTaskDraft = { title: 'Buy detergent', type: undefined, dueDate: undefined, note: '' }
      expect(isDraftReady(draft, today)).toBe(false)
    })

    it('returns false when title is empty', () => {
      const draft: AddTaskDraft = { title: '', type: 'low_stock', dueDate: undefined, note: '' }
      expect(isDraftReady(draft, today)).toBe(false)
    })

    it('returns false when dueDate is in the past', () => {
      const draft: AddTaskDraft = { title: 'x', type: 'low_stock', dueDate: '2026-08-13', note: '' }
      expect(isDraftReady(draft, today)).toBe(false)
    })
  })

  describe('todayIso', () => {
    it('returns yyyy-MM-dd format', () => {
      const result = todayIso(new Date(2026, 7, 14)) // August 14, 2026 (month is 0-indexed)
      expect(result).toBe('2026-08-14')
    })
  })
})

// 复用 task-detail-view 的测试目标：把详情页用的纯函数也覆盖一下
import {
  describeActions,
  describeEventLine,
  describeStatusLine,
  describeDueLabel,
  describeAbandonConfirmMessage,
} from '../../src/subpackages/task/task-detail/task-detail-view'

function buildDetail(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: 't1',
    type: 'low_stock',
    title: 'Buy detergent',
    isOverdueOrToday: false,
    status: 'pending',
    events: [],
    ...overrides,
  }
}

describe('task-detail-view', () => {
  describe('describeActions', () => {
    it('pending: claim / complete / abandon / edit all visible', () => {
      const a = describeActions(buildDetail({ status: 'pending' }))
      expect(a).toEqual({ claim: true, complete: true, abandon: true, edit: true })
    })

    it('claimed: claim hidden, complete / abandon / edit visible', () => {
      const a = describeActions(buildDetail({
        status: 'claimed',
        assignee: { nickname: 'me', avatar: { kind: 'builtin', id: 'person-01' } },
      }))
      expect(a).toEqual({ claim: false, complete: true, abandon: true, edit: true })
    })

    it('completed: all actions hidden', () => {
      const a = describeActions(buildDetail({
        status: 'pending',
        terminalKind: 'completed',
      }))
      expect(a).toEqual({ claim: false, complete: false, abandon: false, edit: false })
    })

    it('abandoned: all actions hidden', () => {
      const a = describeActions(buildDetail({
        status: 'pending',
        terminalKind: 'abandoned',
      }))
      expect(a).toEqual({ claim: false, complete: false, abandon: false, edit: false })
    })

    it('returns all false for undefined', () => {
      const a = describeActions(undefined)
      expect(a).toEqual({ claim: false, complete: false, abandon: false, edit: false })
    })
  })

  describe('describeStatusLine', () => {
    it('pending: 待处理', () => {
      expect(describeStatusLine(buildDetail({ status: 'pending' }))).toBe('待处理')
    })

    it('claimed with assignee: 由 X 处理', () => {
      const line = describeStatusLine(buildDetail({
        status: 'claimed',
        assignee: { nickname: '小美', avatar: { kind: 'builtin', id: 'person-01' } },
      }))
      expect(line).toBe('由 小美 处理')
    })

    it('completed: 由 X 完成', () => {
      const line = describeStatusLine(buildDetail({
        status: 'pending',
        terminalKind: 'completed',
        terminalActor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
      }))
      expect(line).toBe('由 小帅 完成')
    })

    it('abandoned: 由 X 放弃', () => {
      const line = describeStatusLine(buildDetail({
        status: 'pending',
        terminalKind: 'abandoned',
        terminalActor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
      }))
      expect(line).toBe('由 小帅 放弃')
    })
  })

  describe('describeEventLine', () => {
    it('formats each event kind in Chinese', () => {
      const nick = { nickname: '小帅', avatar: { kind: 'builtin' as const, id: 'person-01' } }
      expect(describeEventLine({ kind: 'create', actor: nick, at: '' })).toBe('小帅 创建了这件事')
      expect(describeEventLine({ kind: 'claim', actor: nick, at: '' })).toBe('小帅 接手处理')
      expect(describeEventLine({ kind: 'complete', actor: nick, at: '' })).toBe('小帅 完成了')
      expect(describeEventLine({ kind: 'abandon', actor: nick, at: '' })).toBe('小帅 放弃了')
    })
  })

  describe('describeDueLabel', () => {
    it('无截止日期 when no due date', () => {
      expect(describeDueLabel(buildDetail(), '2026-08-14')).toBe('无截止日期')
    })

    it('今天到期 when due date equals today', () => {
      expect(describeDueLabel(buildDetail({ dueDate: '2026-08-14' }), '2026-08-14')).toBe('今天到期')
    })

    it('已逾期 when due date is before today', () => {
      expect(describeDueLabel(buildDetail({ dueDate: '2026-08-13' }), '2026-08-14')).toBe('已逾期')
    })

    it('yyyy-MM-dd 到期 for future', () => {
      expect(describeDueLabel(buildDetail({ dueDate: '2026-08-20' }), '2026-08-14')).toBe('2026-08-20 到期')
    })
  })

  describe('describeAbandonConfirmMessage', () => {
    it('returns generic message when detail missing', () => {
      expect(describeAbandonConfirmMessage(undefined)).toContain('放弃后不可重新打开')
    })

    it('includes title when detail exists', () => {
      const msg = describeAbandonConfirmMessage(buildDetail({ title: 'Buy detergent' }))
      expect(msg).toContain('Buy detergent')
      expect(msg).toContain('不可重新打开')
    })
  })
})
