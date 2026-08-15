import {
  describeTerminalDateLabel,
  describeTerminalLabel,
  describeTerminalLine,
  filterCompleted,
  formatTerminalTime,
  groupByTerminalDate,
  sortGroupsNewestFirst,
  terminalDateKey,
} from '../../src/subpackages/task/completed-tasks/completed-tasks-view'
import type { CompletedTaskItem } from '../../src/types/task'

function makeItem(overrides: Partial<CompletedTaskItem> = {}): CompletedTaskItem {
  return {
    id: 't1',
    type: 'low_stock',
    title: 'Buy detergent',
    terminalAt: '2026-08-14T10:00:00.000Z',
    terminalActor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
    terminalKind: 'completed',
    ...overrides,
  }
}

describe('completed-tasks-view', () => {
  describe('filterCompleted', () => {
    const items: CompletedTaskItem[] = [
      makeItem({ id: 'a', terminalKind: 'completed' }),
      makeItem({ id: 'b', terminalKind: 'abandoned' }),
      makeItem({ id: 'c', terminalKind: 'completed' }),
    ]

    it('all returns every item', () => {
      expect(filterCompleted(items, 'all').map((i) => i.id)).toEqual(['a', 'b', 'c'])
    })

    it('completed returns only completed', () => {
      expect(filterCompleted(items, 'completed').map((i) => i.id)).toEqual(['a', 'c'])
    })

    it('abandoned returns only abandoned', () => {
      expect(filterCompleted(items, 'abandoned').map((i) => i.id)).toEqual(['b'])
    })
  })

  describe('describeTerminalLine', () => {
    it('completed with actor: 由 X 完成', () => {
      expect(describeTerminalLine(makeItem({ terminalKind: 'completed' }))).toBe('由 小帅 完成')
    })

    it('abandoned with actor: 由 X 放弃', () => {
      expect(describeTerminalLine(makeItem({ terminalKind: 'abandoned' }))).toBe('由 小帅 放弃')
    })
  })

  describe('describeTerminalLabel', () => {
    it('completed → 已完成', () => {
      expect(describeTerminalLabel('completed')).toBe('已完成')
    })
    it('abandoned → 已放弃', () => {
      expect(describeTerminalLabel('abandoned')).toBe('已放弃')
    })
  })

  describe('formatTerminalTime', () => {
    it('returns yyyy-MM-dd for valid ISO string', () => {
      expect(formatTerminalTime('2026-08-14T10:00:00.000Z')).toBe('2026-08-14')
    })

    it('returns empty string for empty input', () => {
      expect(formatTerminalTime('')).toBe('')
    })

    it('returns original string for invalid input', () => {
      expect(formatTerminalTime('not-a-date')).toBe('not-a-date')
    })
  })

  describe('terminalDateKey', () => {
    it('returns empty string for empty input', () => {
      expect(terminalDateKey('')).toBe('')
    })

    it('returns empty string for invalid input', () => {
      expect(terminalDateKey('not-a-date')).toBe('')
    })

    it('returns yyyy-MM-dd for valid ISO using local calendar', () => {
      // 用本地时间构造 ISO，验证切到本地日历日
      const localIso = '2026-08-14T10:00:00'
      const key = terminalDateKey(localIso)
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  describe('groupByTerminalDate', () => {
    it('returns empty list for empty input', () => {
      expect(groupByTerminalDate([])).toEqual([])
    })

    it('keeps a single item as a single group', () => {
      const items = [makeItem({ id: 'a', terminalAt: '2026-08-14T10:00:00.000Z' })]
      const groups = groupByTerminalDate(items)
      expect(groups.length).toBe(1)
      expect(groups[0].items.map((i) => i.id)).toEqual(['a'])
    })

    it('groups items that fall on the same local calendar day', () => {
      // 12-14 UTC 这个区间在所有 [-12, +14] 时区里都落在同一个本地日历日，
      // 测试不受运行环境时区影响（中国时区 UTC+8 下都还是同一天）
      const items = [
        makeItem({ id: 'a', terminalAt: '2026-08-14T12:00:00.000Z' }),
        makeItem({ id: 'b', terminalAt: '2026-08-14T14:00:00.000Z' }),
        makeItem({ id: 'c', terminalAt: '2026-08-14T13:00:00.000Z' }),
      ]
      const groups = groupByTerminalDate(items)
      expect(groups.length).toBe(1)
      expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b', 'c'])
    })

    it('splits items across distinct local calendar days', () => {
      const items = [
        makeItem({ id: 'a', terminalAt: '2026-08-14T10:00:00.000Z' }),
        makeItem({ id: 'b', terminalAt: '2026-08-12T10:00:00.000Z' }),
        makeItem({ id: 'c', terminalAt: '2026-08-13T10:00:00.000Z' }),
      ]
      const groups = groupByTerminalDate(items)
      expect(groups.length).toBe(3)
      // 原顺序：8-14 → 8-12 → 8-13
      expect(groups.map((g) => g.dateKey)).toEqual(['2026-08-14', '2026-08-12', '2026-08-13'])
    })

    it('skips items with empty or invalid terminalAt', () => {
      const items: CompletedTaskItem[] = [
        makeItem({ id: 'a', terminalAt: '' }),
        makeItem({ id: 'b', terminalAt: '2026-08-14T10:00:00.000Z' }),
        makeItem({ id: 'c', terminalAt: 'not-a-date' }),
      ]
      const groups = groupByTerminalDate(items)
      expect(groups.length).toBe(1)
      expect(groups[0].items.map((i) => i.id)).toEqual(['b'])
    })
  })

  describe('sortGroupsNewestFirst', () => {
    it('sorts group dateKeys in descending order', () => {
      const groups = groupByTerminalDate([
        makeItem({ id: 'a', terminalAt: '2026-08-14T10:00:00.000Z' }),
        makeItem({ id: 'b', terminalAt: '2026-08-12T10:00:00.000Z' }),
        makeItem({ id: 'c', terminalAt: '2026-08-13T10:00:00.000Z' }),
      ])
      const sorted = sortGroupsNewestFirst(groups)
      expect(sorted.map((g) => g.dateKey)).toEqual(['2026-08-14', '2026-08-13', '2026-08-12'])
    })

    it('does not mutate the original list', () => {
      const groups = groupByTerminalDate([
        makeItem({ id: 'a', terminalAt: '2026-08-14T10:00:00.000Z' }),
        makeItem({ id: 'b', terminalAt: '2026-08-12T10:00:00.000Z' }),
      ])
      const originalKeys = groups.map((g) => g.dateKey)
      sortGroupsNewestFirst(groups)
      expect(groups.map((g) => g.dateKey)).toEqual(originalKeys)
    })

    it('returns empty list for empty input', () => {
      expect(sortGroupsNewestFirst([])).toEqual([])
    })
  })

  describe('describeTerminalDateLabel', () => {
    // 用一个固定的"今天"避免用例跨日失败
    const now = new Date(2026, 7, 16, 14, 30, 0) // 2026-08-16 14:30 本地时间

    it('returns 今天 when the dateKey is today', () => {
      expect(describeTerminalDateLabel('2026-08-16', now)).toBe('今天')
    })

    it('returns 昨天 when the dateKey is yesterday', () => {
      expect(describeTerminalDateLabel('2026-08-15', now)).toBe('昨天')
    })

    it('returns M月D日 for same-year older dates', () => {
      expect(describeTerminalDateLabel('2026-08-10', now)).toBe('8月10日')
      expect(describeTerminalDateLabel('2026-01-05', now)).toBe('1月5日')
    })

    it('returns full yyyy-MM-dd for cross-year older dates', () => {
      expect(describeTerminalDateLabel('2025-12-30', now)).toBe('2025-12-30')
    })

    it('returns empty string for empty input', () => {
      expect(describeTerminalDateLabel('', now)).toBe('')
    })

    it('returns the dateKey when it is malformed', () => {
      expect(describeTerminalDateLabel('garbage', now)).toBe('garbage')
    })
  })
})
