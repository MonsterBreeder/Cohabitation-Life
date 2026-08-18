import {
  LedgerValidationError,
  toLedgerMonthString,
  validateAmountCents,
  validateLedgerCategoryName,
  validateLedgerNote,
  validateLedgerOccurredAt,
  LEDGER_AMOUNT_MAX_CENTS,
  LEDGER_NOTE_MAX_LENGTH,
} from '../../src/utils/ledger-validators'

describe('validateAmountCents', () => {
  it('accepts integer string and returns integer cents', () => {
    expect(validateAmountCents('12')).toBe(1200)
    expect(validateAmountCents('1')).toBe(100)
    expect(validateAmountCents('0.5')).toBe(50)
  })

  it('accepts 2-decimal string and rounds to nearest cent', () => {
    expect(validateAmountCents('12.50')).toBe(1250)
    expect(validateAmountCents('12.34')).toBe(1234)
    expect(validateAmountCents('12.345')).toBe(1235)
  })

  it('accepts number input', () => {
    expect(validateAmountCents(12.5)).toBe(1250)
    expect(validateAmountCents(0.01)).toBe(1)
  })

  it('rejects empty / non-numeric string', () => {
    expect(() => validateAmountCents('')).toThrow(LedgerValidationError)
    expect(() => validateAmountCents('   ')).toThrow(LedgerValidationError)
    expect(() => validateAmountCents('abc')).toThrow(LedgerValidationError)
  })

  it('rejects zero / negative', () => {
    expect(() => validateAmountCents('0')).toThrow(LedgerValidationError)
    expect(() => validateAmountCents('-1')).toThrow(LedgerValidationError)
    expect(() => validateAmountCents('-0.01')).toThrow(LedgerValidationError)
  })

  it('rejects amount above max', () => {
    expect(() => validateAmountCents(String(LEDGER_AMOUNT_MAX_CENTS / 100 + 1))).toThrow(LedgerValidationError)
  })

  it('accepts amount at max', () => {
    expect(validateAmountCents(String(LEDGER_AMOUNT_MAX_CENTS / 100))).toBe(LEDGER_AMOUNT_MAX_CENTS)
  })
})

describe('validateLedgerNote', () => {
  it('returns trimmed string', () => {
    expect(validateLedgerNote('  买菜  ')).toBe('买菜')
  })

  it('accepts empty string', () => {
    expect(validateLedgerNote('')).toBe('')
    expect(validateLedgerNote('   ')).toBe('')
  })

  it('rejects string longer than max', () => {
    const longText = '啊'.repeat(LEDGER_NOTE_MAX_LENGTH + 1)
    expect(() => validateLedgerNote(longText)).toThrow(LedgerValidationError)
  })

  it('accepts string at max length', () => {
    const text = '啊'.repeat(LEDGER_NOTE_MAX_LENGTH)
    expect(validateLedgerNote(text)).toBe(text)
  })
})

describe('validateLedgerOccurredAt', () => {
  it('accepts ISO string and returns Date', () => {
    const result = validateLedgerOccurredAt('2026-08-17T10:00:00.000Z')
    expect(result).toBeInstanceOf(Date)
    expect(result.toISOString()).toBe('2026-08-17T10:00:00.000Z')
  })

  it('accepts Date object', () => {
    const date = new Date('2026-08-17T10:00:00.000Z')
    const result = validateLedgerOccurredAt(date)
    expect(result).toBe(date)
  })

  it('rejects date before 2020-01-01', () => {
    expect(() => validateLedgerOccurredAt('2019-12-31T23:59:59.000Z')).toThrow(LedgerValidationError)
  })

  it('rejects date more than 1 day in future', () => {
    const now = new Date()
    const tooFuture = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000)
    expect(() => validateLedgerOccurredAt(tooFuture)).toThrow(LedgerValidationError)
  })

  it('accepts tomorrow', () => {
    const now = new Date()
    const tomorrow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000)
    expect(() => validateLedgerOccurredAt(tomorrow)).not.toThrow()
  })

  it('rejects invalid date string', () => {
    expect(() => validateLedgerOccurredAt('not-a-date')).toThrow(LedgerValidationError)
  })
})

describe('validateLedgerCategoryName', () => {
  it('accepts valid name', () => {
    expect(validateLedgerCategoryName('餐饮')).toBe('餐饮')
    expect(validateLedgerCategoryName('  宠物  ')).toBe('宠物')
  })

  it('rejects name too short', () => {
    expect(() => validateLedgerCategoryName('吃')).toThrow(LedgerValidationError)
    expect(() => validateLedgerCategoryName('')).toThrow(LedgerValidationError)
  })

  it('rejects name too long', () => {
    expect(() => validateLedgerCategoryName('一二三四五六七八九')).toThrow(LedgerValidationError)
  })
})

describe('toLedgerMonthString', () => {
  it('formats Date to yyyy-MM', () => {
    expect(toLedgerMonthString(new Date('2026-08-17T00:00:00.000Z'))).toMatch(/^\d{4}-\d{2}$/)
  })

  it('formats ISO string to yyyy-MM', () => {
    expect(toLedgerMonthString('2026-08-17T00:00:00.000Z')).toMatch(/^\d{4}-\d{2}$/)
  })
})
