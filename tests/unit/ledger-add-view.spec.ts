import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  defaultAddDraft,
  defaultCategoryDraft,
  describeMonthForPicker,
  describeOccurredAtShort,
  describePayerOptions,
  describeSaveButton,
  describeTypeTabs,
  draftFromEntry,
  inferMealPeriod,
  resolveMealPeriodAfterCategoryChange,
  toggleMealPeriod,
  hasErrors,
  validateCategoryDraft,
  validateDraft,
} from '../../src/subpackages/ledger/ledger-add/ledger-add-view'

describe('defaultAddDraft', () => {
  it('returns sensible defaults', () => {
    const draft = defaultAddDraft()
    expect(draft.type).toBe('expense')
    expect(draft.amountCents).toBe(0)
    expect(draft.categoryId).toBeNull()
    expect(draft.mealPeriod).toBeNull()
    expect(draft.note).toBe('')
    expect(draft.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('respects overrides', () => {
    const draft = defaultAddDraft({ type: 'income', amountCents: 5000 })
    expect(draft.type).toBe('income')
    expect(draft.amountCents).toBe(5000)
  })
})

describe('draftFromEntry', () => {
  it('maps existing entry fields into draft', () => {
    const draft = draftFromEntry({
      type: 'expense',
      amountCents: 12345,
      categoryId: 'cat_xxxxxxxxxxxxx_1',
      mealPeriod: 'dinner',
      payer: { memberKey: 'user_self' },
      note: '买菜',
      occurredAt: '2026-08-17T10:00:00.000Z',
      receiptMediaId: null,
    })
    expect(draft.amountCents).toBe(12345)
    expect(draft.payerMemberKey).toBe('user_self')
    expect(draft.note).toBe('买菜')
    expect(draft.mealPeriod).toBe('dinner')
  })
})

describe('餐次默认与类目切换', () => {
  // 边界必须按本机小时稳定切分，避免 10:59/11:00 这类时刻落错餐次。
  it.each([
    [10, 59, 'breakfast'],
    [11, 0, 'lunch'],
    [15, 59, 'lunch'],
    [16, 0, 'dinner'],
    [23, 59, 'dinner'],
    [0, 0, 'breakfast'],
  ])('%i:%i 推断为 %s', (hour, minute, expected) => {
    expect(inferMealPeriod(new Date(2026, 8, 19, hour, minute))).toBe(expected)
  })

  it('进入系统餐饮时自动选择，保留用户已手动选择的值', () => {
    const dining = { key: 'dining', isCustom: false }
    expect(resolveMealPeriodAfterCategoryChange(dining, null, new Date(2026, 8, 19, 12))).toBe('lunch')
    expect(resolveMealPeriodAfterCategoryChange(dining, 'breakfast', new Date(2026, 8, 19, 12))).toBe(
      'breakfast',
    )
  })

  it('切到非餐饮或同名自定义类目时清空', () => {
    expect(resolveMealPeriodAfterCategoryChange({ key: 'transport', isCustom: false }, 'dinner')).toBeNull()
    expect(resolveMealPeriodAfterCategoryChange({ key: 'dining', isCustom: true }, 'dinner')).toBeNull()
  })

  // 餐次不是必填项：首次点击选中，重复点击同一项取消选中。
  it('支持选择、切换和取消餐次', () => {
    expect(toggleMealPeriod(null, 'breakfast')).toBe('breakfast')
    expect(toggleMealPeriod('lunch', 'dinner')).toBe('dinner')
    expect(toggleMealPeriod('dinner', 'dinner')).toBeNull()
  })
})

describe('validateDraft', () => {
  it('reports empty amount', () => {
    const errors = validateDraft(defaultAddDraft())
    expect(errors.amount).toBeDefined()
    expect(errors.category).toBeDefined()
  })

  it('passes for valid draft', () => {
    const errors = validateDraft(
      defaultAddDraft({
        amountCents: 5000,
        categoryId: 'cat_xxxxxxxxxxxxx_1',
      }),
    )
    expect(errors.amount).toBeUndefined()
    expect(errors.category).toBeUndefined()
  })

  // 保护七位数收入：草稿已经以“分”保存，校验时不能再次乘 100。
  it('passes for a seven-digit income amount stored in cents', () => {
    const draft = defaultAddDraft({
      type: 'income',
      amountCents: 555_584_100,
      categoryId: 'cat_xxxxxxxxxxxxx_1',
    })
    expect(validateDraft(draft).amount).toBeUndefined()
    expect(describeSaveButton(validateDraft(draft), false, false).enabled).toBe(true)
  })

  it('rejects future time', () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString()
    const errors = validateDraft(
      defaultAddDraft({ amountCents: 100, categoryId: 'cat_xxxxxxxxxxxxx_1', occurredAt: future }),
    )
    expect(errors.time).toBeDefined()
  })

  it('rejects too-old time', () => {
    const errors = validateDraft(
      defaultAddDraft({
        amountCents: 100,
        categoryId: 'cat_xxxxxxxxxxxxx_1',
        occurredAt: '2010-01-01T00:00:00.000Z',
      }),
    )
    expect(errors.time).toBeDefined()
  })
})

describe('hasErrors', () => {
  it('returns true when any field has error', () => {
    expect(hasErrors({ amount: 'invalid' })).toBe(true)
  })
  it('returns false for empty errors', () => {
    expect(hasErrors({})).toBe(false)
  })
})

describe('describeTypeTabs', () => {
  it('returns 2 tabs (expense / income)', () => {
    const tabs = describeTypeTabs()
    expect(tabs).toHaveLength(2)
    expect(tabs[0].value).toBe('expense')
    expect(tabs[1].value).toBe('income')
  })
})

describe('describePayerOptions', () => {
  it('returns 1 option for single-member household', () => {
    const opts = describePayerOptions('user_self', 'user_other', 1)
    expect(opts).toHaveLength(1)
    expect(opts[0].value).toBe('user_self')
  })

  it('returns 2 options for two-member household', () => {
    const opts = describePayerOptions('user_self', 'user_other', 2)
    expect(opts).toHaveLength(2)
  })
})

describe('describeSaveButton', () => {
  it('disables when errors', () => {
    expect(describeSaveButton({ amount: 'invalid' }, false, false).enabled).toBe(false)
  })

  it('enables when no errors and not busy', () => {
    expect(describeSaveButton({}, false, false).enabled).toBe(true)
    expect(describeSaveButton({}, false, false).label).toBe('保存')
  })

  it('shows busy label', () => {
    expect(describeSaveButton({}, true, false).label).toBe('保存中…')
  })

  it('shows edit label', () => {
    expect(describeSaveButton({}, false, true).label).toBe('保存修改')
  })
})

describe('defaultCategoryDraft / validateCategoryDraft', () => {
  it('returns empty defaults', () => {
    const draft = defaultCategoryDraft()
    expect(draft.name).toBe('')
    expect(draft.iconKey).toBe('tag')
    expect(draft.colorKey).toBe('gray')
  })

  it('rejects too-short name', () => {
    expect(validateCategoryDraft({ name: 'a', iconKey: 'tag', colorKey: 'gray' })).not.toBeNull()
  })

  it('accepts valid name', () => {
    expect(validateCategoryDraft({ name: '宠物', iconKey: 'tag', colorKey: 'gray' })).toBeNull()
  })
})

describe('describeOccurredAtShort', () => {
  const now = new Date(2026, 7, 17, 12, 0, 0)

  it('returns empty for invalid', () => {
    expect(describeOccurredAtShort('', now)).toBe('')
    expect(describeOccurredAtShort('not-a-date', now)).toBe('')
  })

  it('returns 今天 for today (no time, 账本只到日期)', () => {
    expect(describeOccurredAtShort('2026-08-17T08:30:00', now)).toBe('今天')
  })

  it('returns 昨天 for yesterday (no time, 账本只到日期)', () => {
    expect(describeOccurredAtShort('2026-08-16T20:00:00', now)).toBe('昨天')
  })
})

describe('describeMonthForPicker', () => {
  it('returns yyyy-MM for ISO string', () => {
    expect(describeMonthForPicker('2026-08-17T10:00:00.000Z')).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('presets', () => {
  it('has 8 icon options', () => {
    expect(CATEGORY_ICON_OPTIONS).toHaveLength(8)
  })

  it('has 8 color options', () => {
    expect(CATEGORY_COLOR_OPTIONS).toHaveLength(8)
  })
})
