import {
  describeTerminalLabel,
  describeTerminalLine,
  filterCompleted,
  formatTerminalTime,
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
})
