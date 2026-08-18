import {
  describeActions,
  describeAmountColor,
  describeAmountLine,
  describeDeleteConfirmMessage,
  describePayerLine,
  describeTypeLabel,
  describeWhenLine,
  formatRelativeTime,
} from '../../src/subpackages/ledger/ledger-detail/ledger-detail-view'
import type { LedgerEntryDetail } from '../../src/types/ledger'

function makeDetail(overrides: Partial<LedgerEntryDetail> = {}): LedgerEntryDetail {
  return {
    id: 'ledger_xxxxxxxxxxxxx_1',
    type: 'expense',
    amountCents: 1234,
    categoryId: 'cat_xxxxxxxxxxxxx_1',
    note: '买菜',
    occurredAt: '2026-08-17T10:00:00.000Z',
    receiptMediaId: null,
    payer: { memberKey: 'user_self', nickname: '我', avatar: { kind: 'builtin', id: 'person-neutral' } },
    createdAt: '2026-08-17T10:00:00.000Z',
    updatedAt: '2026-08-17T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  } as LedgerEntryDetail
}

describe('describeActions', () => {
  // 新版直接读 detail.canEdit / canDelete（云端在 getEntry 响应里给），
  // 不再由前端比对 selfMemberKey。前端没 identityKey，没法自己算。
  it('returns edit+delete when canEdit and canDelete are both true (creator)', () => {
    const detail = makeDetail({ canEdit: true, canDelete: true })
    const actions = describeActions(detail)
    expect(actions.edit).toBe(true)
    expect(actions.delete).toBe(true)
  })

  it('returns no actions when canEdit/canDelete are false (other household member)', () => {
    const detail = makeDetail({ canEdit: false, canDelete: false })
    const actions = describeActions(detail)
    expect(actions.edit).toBe(false)
    expect(actions.delete).toBe(false)
  })

  // 兜底：旧云函数部署可能还没带 canEdit/canDelete（undefined）。
  // 这种情况下前端不应该暴露编辑/删除按钮（按"无权限"处理），让用户等云端升级。
  it('treats undefined canEdit/canDelete as no actions', () => {
    const detail = makeDetail({ canEdit: undefined, canDelete: undefined })
    const actions = describeActions(detail)
    expect(actions.edit).toBe(false)
    expect(actions.delete).toBe(false)
  })

  it('returns no actions for undefined detail', () => {
    expect(describeActions(undefined)).toEqual({ edit: false, delete: false })
  })
})

describe('describeAmountLine / describeAmountColor', () => {
  it('formats expense with - sign', () => {
    expect(describeAmountLine(makeDetail({ type: 'expense', amountCents: 1234 }))).toBe('-¥12.34')
  })

  it('formats income with + sign', () => {
    expect(describeAmountLine(makeDetail({ type: 'income', amountCents: 1234 }))).toBe('+¥12.34')
  })

  it('returns empty for undefined', () => {
    expect(describeAmountLine(undefined)).toBe('')
  })

  it('returns coral color for expense', () => {
    expect(describeAmountColor('expense')).toBe('#FF8F79')
  })

  it('returns mint color for income', () => {
    expect(describeAmountColor('income')).toBe('#43C89A')
  })
})

describe('describePayerLine', () => {
  it('formats normal payer', () => {
    const detail = makeDetail({ payer: { memberKey: 'user_self', nickname: '我', avatar: { kind: 'builtin', id: 'person-neutral' } } as any })
    expect(describePayerLine(detail)).toBe('由 我 付款')
  })

  it('formats left member with note', () => {
    const detail = makeDetail({ payer: { memberKey: 'user_old', nickname: '前任', avatar: { kind: 'builtin', id: 'person-neutral' }, hasLeft: true } as any })
    expect(describePayerLine(detail)).toBe('前任（已离开）')
  })

  it('returns empty for undefined', () => {
    expect(describePayerLine(undefined)).toBe('')
  })
})

describe('describeTypeLabel / describeDeleteConfirmMessage', () => {
  it('labels type', () => {
    expect(describeTypeLabel('expense')).toBe('支出')
    expect(describeTypeLabel('income')).toBe('收入')
    expect(describeTypeLabel(undefined)).toBe('')
  })

  it('formats delete confirm with note', () => {
    const detail = makeDetail({ note: '买菜' })
    expect(describeDeleteConfirmMessage(detail)).toContain('买菜')
  })

  it('falls back when no note', () => {
    const detail = makeDetail({ note: '' })
    expect(describeDeleteConfirmMessage(detail)).toContain('这条账目')
  })
})

describe('describeWhenLine', () => {
  const now = new Date(2026, 7, 17, 12, 0, 0)

  it('returns 今天 for today (no time, 账本只到日期)', () => {
    expect(describeWhenLine(makeDetail({ occurredAt: '2026-08-17T08:30:00' }), now)).toBe('今天')
  })

  it('returns 昨天 for yesterday (no time, 账本只到日期)', () => {
    expect(describeWhenLine(makeDetail({ occurredAt: '2026-08-16T20:00:00' }), now)).toBe('昨天')
  })

  it('returns empty for undefined', () => {
    expect(describeWhenLine(undefined, now)).toBe('')
  })
})

describe('formatRelativeTime', () => {
  const now = new Date(2026, 7, 17, 12, 0, 0)

  it('returns 刚刚 for < 1 min', () => {
    expect(formatRelativeTime('2026-08-17T11:59:30', now)).toBe('刚刚')
  })

  it('returns N 分钟前', () => {
    expect(formatRelativeTime('2026-08-17T11:55:00', now)).toBe('5 分钟前')
  })

  it('returns N 小时前', () => {
    expect(formatRelativeTime('2026-08-17T09:00:00', now)).toBe('3 小时前')
  })

  it('returns N 天前', () => {
    expect(formatRelativeTime('2026-08-15T12:00:00', now)).toBe('2 天前')
  })
})
