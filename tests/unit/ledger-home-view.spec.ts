import {
  describeCategory,
  describeCategorySlices,
  describeDeletedEntryHint,
  describeEntryAmount,
  describeEntryMonth,
  describeHomeActions,
  describeMonthLabel,
  describePayerFilterOptions,
  describePayerLine,
  describeStatsEntry,
  describeLedgerAiEntry,
  describeTypeFilterOptions,
  groupEntriesByDate,
  LEDGER_CATEGORY_COLOR_MAP,
  LEDGER_CATEGORY_ICON_MAP,
  shiftDay,
  shiftMonth,
  STATS_ENTRY_DATA_TEST_ID,
  STATS_ENTRY_URL,
  LEDGER_AI_ENTRY_URL,
} from '../../src/pages/ledger/ledger-home-view'
import type { LedgerCategory, LedgerEntrySummary } from '../../src/types/ledger'

function makeCategory(overrides: Partial<LedgerCategory> = {}): LedgerCategory {
  return {
    id: 'cat_xxxxxxxxxxxxx_1',
    key: 'dining',
    name: '餐饮',
    iconKey: 'fork-spoon',
    colorKey: 'amber',
    isCustom: false,
    sortOrder: 0,
    ...overrides,
  }
}

function makeEntry(overrides: any = {}): LedgerEntrySummary {
  return {
    id: 'ledger_xxxxxxxxxxxxx_1',
    type: 'expense',
    amountCents: 5000,
    categoryId: 'cat_xxxxxxxxxxxxx_1',
    note: '买菜',
    occurredAt: '2026-08-17T10:00:00.000Z',
    receiptMediaId: null,
    payer: { memberKey: 'user_self', nickname: '我', avatar: { kind: 'builtin', id: 'person-neutral' } },
    createdAt: '2026-08-17T10:00:00.000Z',
    ...overrides,
  } as LedgerEntrySummary
}

describe('describeCategory', () => {
  it('adds colorHex + iconName to category', () => {
    const cat = makeCategory({ colorKey: 'amber', iconKey: 'fork-spoon' })
    const view = describeCategory(cat)
    expect(view.colorHex).toBe(LEDGER_CATEGORY_COLOR_MAP.amber)
    expect(view.iconName).toBe(LEDGER_CATEGORY_ICON_MAP['fork-spoon'])
  })

  it('falls back to gray / tag for unknown keys', () => {
    const view = describeCategory(makeCategory({ colorKey: 'amber', iconKey: 'tag' }))
    expect(view.colorHex).toBe(LEDGER_CATEGORY_COLOR_MAP.amber)
  })
})

describe('describeLedgerAiEntry', () => {
  it('points to the independent ledger AI page', () => {
    expect(describeLedgerAiEntry()).toEqual({
      label: '问账本',
      description: '说出金额、用途或时间，帮你找回那笔账',
      targetUrl: LEDGER_AI_ENTRY_URL,
      dataTestId: 'ledger-home-ai-entry',
    })
  })
})

describe('groupEntriesByDate', () => {
  const now = new Date(2026, 7, 17, 12, 0, 0) // 2026-08-17 12:00 本地时间

  it('groups entries by 今天 / 昨天 / M月D日', () => {
    const entries = [
      makeEntry({ id: 'e1', occurredAt: '2026-08-17T08:00:00' }),
      makeEntry({ id: 'e2', occurredAt: '2026-08-16T20:00:00' }),
      makeEntry({ id: 'e3', occurredAt: '2026-08-15T10:00:00' }),
    ]
    const groups = groupEntriesByDate(entries, now)
    expect(groups[0].label).toBe('今天')
    expect(groups[0].entries.map((e) => e.id)).toEqual(['e1'])
    expect(groups[1].label).toBe('昨天')
    expect(groups[1].entries.map((e) => e.id)).toEqual(['e2'])
    expect(groups[2].label).toBe('8月15日')
    expect(groups[2].entries[0].id).toBe('e3')
  })

  it('returns empty for empty list', () => {
    expect(groupEntriesByDate([], now)).toEqual([])
  })
})

describe('describeEntryAmount', () => {
  it('uses - for expense', () => {
    expect(describeEntryAmount('expense', 1234)).toBe('-¥12.34')
  })

  it('uses + for income', () => {
    expect(describeEntryAmount('income', 1234)).toBe('+¥12.34')
  })

  it('formats integer cents with thousands separator', () => {
    expect(describeEntryAmount('expense', 123456)).toBe('-¥1,234.56')
  })
})

describe('describePayerFilterOptions / describeHomeActions', () => {
  it('returns 3 options for payer filter (PRD 008 优化 R1 双维度 chip 第一行)', () => {
    const opts = describePayerFilterOptions('user_self')
    expect(opts).toHaveLength(3)
    expect(opts[0]).toEqual({ value: 'all', label: '全部' })
    expect(opts[1]).toEqual({ value: 'me', label: '我付的' })
    expect(opts[2]).toEqual({ value: 'other', label: '对方付的' })
  })

  it('describes home actions', () => {
    expect(describeHomeActions(true, true)).toEqual({ canAdd: true, canSeeDeleted: true })
  })
})

describe('describeEntryMonth / describeMonthLabel / shiftMonth', () => {
  it('formats entry month to yyyy-MM', () => {
    expect(describeEntryMonth(makeEntry({ occurredAt: '2026-08-17T10:00:00.000Z' }))).toBe('2026-08')
  })

  it('returns empty for invalid date', () => {
    expect(describeEntryMonth(makeEntry({ occurredAt: 'invalid' }))).toBe('')
  })

  it('formats month label in Chinese', () => {
    expect(describeMonthLabel('2026-08')).toBe('2026 年 8 月')
  })

  it('shifts month forward / backward', () => {
    expect(shiftMonth('2026-08', 1)).toBe('2026-09')
    expect(shiftMonth('2026-08', -1)).toBe('2026-07')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('invalid', 1)).toBe('')
  })

  it('formats yyyy-MM-dd label as "YYYY 年 M 月 D 日" (PRD 008 优化 R7)', () => {
    expect(describeMonthLabel('2026-08-15')).toBe('2026 年 8 月 15 日')
  })
})

describe('describePayerLine (PRD 008 优化 R16-R19)', () => {
  it('uses "付款" for expense', () => {
    expect(describePayerLine('expense', { hasLeft: false, nickname: 'A' })).toBe('由 A 付款')
  })

  it('uses "入账" for income', () => {
    expect(describePayerLine('income', { hasLeft: false, nickname: 'B' })).toBe('由 B 入账')
  })

  it('appends "（已离开）" when payer has left', () => {
    expect(describePayerLine('expense', { hasLeft: true, nickname: 'A' })).toBe('由 A 付款（已离开）')
    expect(describePayerLine('income', { hasLeft: true, nickname: 'B' })).toBe('由 B 入账（已离开）')
  })

  it('falls back to "成员" when nickname is empty', () => {
    expect(describePayerLine('expense', { hasLeft: false, nickname: '' })).toBe('由 成员 付款')
  })

  it('handles null / undefined payer', () => {
    expect(describePayerLine('expense', null)).toBe('由 成员 付款')
    expect(describePayerLine('income', undefined)).toBe('由 成员 入账')
  })
})

describe('describeTypeFilterOptions (PRD 008 优化 R1 双维度 chip 第二行)', () => {
  it('returns 3 options (全部 / 支出 / 收入)', () => {
    const opts = describeTypeFilterOptions()
    expect(opts).toHaveLength(3)
    expect(opts).toEqual([
      { value: 'all', label: '全部' },
      { value: 'expense', label: '支出' },
      { value: 'income', label: '收入' },
    ])
  })
})

describe('shiftDay (PRD 008 优化 R7 按日切换)', () => {
  it('shifts day forward / backward', () => {
    expect(shiftDay('2026-08-15', 1)).toBe('2026-08-16')
    expect(shiftDay('2026-08-15', -1)).toBe('2026-08-14')
  })

  it('rolls over month boundary', () => {
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01')
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('rolls over year boundary', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('returns empty for invalid input', () => {
    expect(shiftDay('invalid', 1)).toBe('')
    expect(shiftDay('2026-08-15', Number.NaN as any)).toBe('')
  })
})

describe('describeCategorySlices', () => {
  it('sorts by expenseCents desc + computes percent', () => {
    const cats = [
      makeCategory({ id: 'cat_a', colorKey: 'amber' }),
      makeCategory({ id: 'cat_b', colorKey: 'mint' }),
    ]
    const byCategory = [
      { categoryId: 'cat_b', expenseCents: 3000, incomeCents: 0 },
      { categoryId: 'cat_a', expenseCents: 7000, incomeCents: 0 },
    ]
    const slices = describeCategorySlices(byCategory, 10000, cats)
    expect(slices[0].categoryId).toBe('cat_a')
    expect(slices[0].percent).toBeCloseTo(0.7, 2)
    expect(slices[1].categoryId).toBe('cat_b')
    expect(slices[1].percent).toBeCloseTo(0.3, 2)
  })

  it('returns empty when totalExpenseCents is 0', () => {
    expect(describeCategorySlices([], 0, [])).toEqual([])
  })
})

describe('describeDeletedEntryHint', () => {
  const now = new Date('2026-08-17T12:00:00.000Z')

  it('shows remaining days', () => {
    const d = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    expect(describeDeletedEntryHint(d, now)).toBe('还剩 25 天可恢复')
  })

  it('returns 今天清理 when remaining is 0', () => {
    const d = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString()
    expect(describeDeletedEntryHint(d, now)).toBe('今天清理')
  })

  it('returns empty for null', () => {
    expect(describeDeletedEntryHint(null, now)).toBe('')
  })
})

// brainstorm 2026-08-30 把账本统计页的入口接出来。
// 测试覆盖：返回值结构、常量与函数一致性、幂等（无随机 / 时间依赖）。
describe('describeStatsEntry (brainstorm 2026-08-30 把统计入口接出来)', () => {
  it('returns label / targetUrl / dataTestId for the stats entry', () => {
    const entry = describeStatsEntry()
    expect(entry.label).toBe('统计')
    expect(entry.targetUrl).toBe('/subpackages/ledger/ledger-stats/index')
    expect(entry.dataTestId).toBe('ledger-home-stats-entry')
  })

  it('keeps STATS_ENTRY_URL / STATS_ENTRY_DATA_TEST_ID consistent with describeStatsEntry()', () => {
    const entry = describeStatsEntry()
    expect(entry.targetUrl).toBe(STATS_ENTRY_URL)
    expect(entry.dataTestId).toBe(STATS_ENTRY_DATA_TEST_ID)
  })

  it('returns the same shape on every call (no randomness / time dependence)', () => {
    const a = describeStatsEntry()
    const b = describeStatsEntry()
    expect(a).toEqual(b)
  })
})
