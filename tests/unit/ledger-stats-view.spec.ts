import {
  describeCategorySlices,
  describeMonthComparison,
  describeMonthOverview,
  describePayerBars,
  shiftMonth as shiftMonthView,
} from '../../src/subpackages/ledger/ledger-stats/ledger-stats-view'
import type { LedgerCategory, LedgerStats } from '../../src/types/ledger'

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

function makeStats(overrides: Partial<LedgerStats> = {}): LedgerStats {
  return {
    month: '2026-08',
    monthExpenseCents: 10000,
    monthIncomeCents: 0,
    netCents: -10000,
    byCategory: [],
    byPayer: [],
    ...overrides,
  } as LedgerStats
}

describe('describeCategorySlices', () => {
  it('returns empty for null', () => {
    expect(describeCategorySlices(null, [])).toEqual([])
  })

  it('sorts by expenseCents desc + computes percent', () => {
    const cats = [makeCategory({ id: 'cat_xxxxxxxxxxxxx_a', colorKey: 'amber' }), makeCategory({ id: 'cat_xxxxxxxxxxxxx_b', colorKey: 'mint' })]
    const slices = describeCategorySlices(
      makeStats({ monthExpenseCents: 10000, byCategory: [{ categoryId: 'cat_xxxxxxxxxxxxx_b', expenseCents: 3000, incomeCents: 0 }, { categoryId: 'cat_xxxxxxxxxxxxx_a', expenseCents: 7000, incomeCents: 0 }] }),
      cats,
    )
    expect(slices[0].categoryId).toBe('cat_xxxxxxxxxxxxx_a')
    expect(slices[0].percent).toBeCloseTo(0.7, 2)
    expect(slices[0].categoryName).toBe('餐饮')
    expect(slices[1].percent).toBeCloseTo(0.3, 2)
  })

  it('falls back to 已删除类目 for unknown id', () => {
    const slices = describeCategorySlices(
      makeStats({ byCategory: [{ categoryId: 'cat_unknown', expenseCents: 5000, incomeCents: 0 }] }),
      [],
    )
    expect(slices[0].categoryName).toBe('已删除类目')
  })
})

describe('describePayerBars', () => {
  it('sorts + maps payer name from map', () => {
    const bars = describePayerBars(
      makeStats({ byPayer: [{ payerMemberKey: 'user_self', expenseCents: 6000, incomeCents: 0 }, { payerMemberKey: 'user_other', expenseCents: 4000, incomeCents: 0 }] }),
      { user_self: '我', user_other: 'TA' },
    )
    expect(bars[0].payerName).toBe('我')
    expect(bars[0].percent).toBeCloseTo(0.6, 2)
    expect(bars[1].payerName).toBe('TA')
  })

  it('falls back to 成员 for unknown key', () => {
    const bars = describePayerBars(
      makeStats({ byPayer: [{ payerMemberKey: 'user_unknown', expenseCents: 100, incomeCents: 0 }] }),
      {},
    )
    expect(bars[0].payerName).toBe('成员')
  })
})

describe('describeMonthComparison', () => {
  it('up direction when current > previous', () => {
    const r = describeMonthComparison(15000, 10000)
    expect(r.direction).toBe('up')
    expect(r.delta).toBe(5000)
    expect(r.percent).toBeCloseTo(0.5, 2)
  })

  it('down direction when current < previous', () => {
    const r = describeMonthComparison(5000, 10000)
    expect(r.direction).toBe('down')
  })

  it('flat when equal', () => {
    const r = describeMonthComparison(10000, 10000)
    expect(r.direction).toBe('flat')
  })

  it('up when previous is 0 and current > 0', () => {
    const r = describeMonthComparison(5000, 0)
    expect(r.direction).toBe('up')
    expect(r.percent).toBe(1)
  })
})

describe('describeMonthOverview', () => {
  it('formats month label + amounts', () => {
    const o = describeMonthOverview('2026-08', makeStats({ monthExpenseCents: 12345, monthIncomeCents: 5000, netCents: -7345 }))
    expect(o.monthLabel).toBe('2026 年 8 月')
    expect(o.expenseText).toBe('¥123.45')
    expect(o.incomeText).toBe('¥50.00')
    expect(o.netText).toBe('-¥73.45')
  })

  it('handles positive net', () => {
    const o = describeMonthOverview('2026-08', makeStats({ monthExpenseCents: 5000, monthIncomeCents: 12000, netCents: 7000 }))
    expect(o.netText).toBe('+¥70.00')
  })

  it('handles null stats', () => {
    const o = describeMonthOverview('2026-08', null)
    expect(o.expenseText).toBe('¥0.00')
  })

  it('returns empty monthLabel for invalid month', () => {
    const o = describeMonthOverview('invalid', makeStats())
    expect(o.monthLabel).toBe('')
  })
})

describe('shiftMonth (re-exported from view)', () => {
  it('shifts forward', () => {
    expect(shiftMonthView('2026-08', 1)).toBe('2026-09')
  })
  it('shifts backward', () => {
    expect(shiftMonthView('2026-08', -1)).toBe('2026-07')
  })
  it('handles year wrap', () => {
    expect(shiftMonthView('2026-01', -1)).toBe('2025-12')
  })
  it('returns empty for invalid', () => {
    expect(shiftMonthView('invalid', 1)).toBe('')
  })
})
