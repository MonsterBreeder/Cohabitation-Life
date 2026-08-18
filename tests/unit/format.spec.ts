import { formatDateGroupLabel, formatDateYMD, formatLedgerMonth, formatYuan } from '../../src/utils/format'

describe('formatYuan', () => {
  it('formats integer cents with thousands separator', () => {
    expect(formatYuan(123456)).toBe('¥1,234.56')
    expect(formatYuan(0)).toBe('¥0.00')
    expect(formatYuan(100)).toBe('¥1.00')
  })

  it('handles negative with sign option', () => {
    expect(formatYuan(-1234, { sign: 'expense' })).toBe('-¥12.34')
    expect(formatYuan(1234, { sign: 'income' })).toBe('+¥12.34')
  })

  it('handles non-finite gracefully', () => {
    expect(formatYuan(Number.NaN)).toBe('¥0.00')
    expect(formatYuan(Number.POSITIVE_INFINITY)).toBe('¥0.00')
  })
})

describe('formatLedgerMonth', () => {
  it('formats Date to yyyy-MM', () => {
    expect(formatLedgerMonth(new Date(2026, 7, 17))).toBe('2026-08') // 月份从 0 开始
    expect(formatLedgerMonth(new Date(2026, 0, 1))).toBe('2026-01')
  })

  it('formats ISO string to yyyy-MM', () => {
    expect(formatLedgerMonth('2026-08-17T00:00:00.000Z')).toMatch(/^\d{4}-\d{2}$/)
  })

  it('returns empty string for invalid input', () => {
    expect(formatLedgerMonth('not-a-date')).toBe('')
  })
})

describe('formatDateYMD', () => {
  it('formats Date to yyyy-MM-dd', () => {
    expect(formatDateYMD(new Date(2026, 7, 17))).toBe('2026-08-17')
  })

  it('returns empty string for invalid input', () => {
    expect(formatDateYMD('not-a-date')).toBe('')
  })
})

describe('formatDateGroupLabel', () => {
  const now = new Date(2026, 7, 17, 12, 0, 0) // 2026-08-17

  it('returns 今天 for today', () => {
    expect(formatDateGroupLabel(new Date(2026, 7, 17, 8, 0, 0), now)).toBe('今天')
  })

  it('returns 昨天 for yesterday', () => {
    expect(formatDateGroupLabel(new Date(2026, 7, 16, 20, 0, 0), now)).toBe('昨天')
  })

  it('returns M月D日 for same year', () => {
    expect(formatDateGroupLabel(new Date(2026, 3, 1, 0, 0, 0), now)).toBe('4月1日')
  })

  it('returns yyyy-MM-dd for previous year', () => {
    expect(formatDateGroupLabel(new Date(2025, 11, 31, 0, 0, 0), now)).toBe('2025-12-31')
  })

  it('returns empty string for invalid input', () => {
    expect(formatDateGroupLabel('not-a-date', now)).toBe('')
  })
})
