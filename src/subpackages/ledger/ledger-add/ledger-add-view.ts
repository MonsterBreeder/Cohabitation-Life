// 记一笔页（PRD 008 / Plan U5）视图描述器。
// 模式：纯函数 + 不持有状态。负责表单初始草稿、校验、tab 切换文案。

import type { LedgerEntryType, LedgerCategory } from '../../../types/ledger'
import { validateAmountCents, validateLedgerNote, validateLedgerCategoryName, toLedgerMonthString } from '../../../utils/ledger-validators'

/** 草稿：所有字段都是原始输入（金额是分、occurredAt 是 ISO 字符串）。 */
export interface AddEntryDraft {
  type: LedgerEntryType
  amountCents: number
  categoryId: string | null
  payerMemberKey: string
  note: string
  occurredAt: string
  receiptMediaId: string | null
}

export function defaultAddDraft(overrides: Partial<AddEntryDraft> = {}): AddEntryDraft {
  const now = new Date()
  return {
    type: 'expense',
    amountCents: 0,
    categoryId: null,
    // 'self' 是字面量占位符；ledger 云端 addEntry 在收到时映射到 identityKey。
    // 前端不需要持有可能变化的家庭 memberKey 字符串。
    payerMemberKey: 'self',
    note: '',
    occurredAt: now.toISOString(),
    receiptMediaId: null,
    ...overrides,
  }
}

/** 编辑模式预填。 */
export function draftFromEntry(input: {
  type: LedgerEntryType
  amountCents: number
  categoryId: string
  payer: { memberKey: string }
  note: string
  occurredAt: string
  receiptMediaId: string | null
}): AddEntryDraft {
  return {
    type: input.type,
    amountCents: input.amountCents,
    categoryId: input.categoryId,
    // 入参的 memberKey 是真实值（user_xxx）；fallback 才用 'self' 让云端映射。
    payerMemberKey: input.payer.memberKey || 'self',
    note: input.note,
    occurredAt: input.occurredAt,
    receiptMediaId: input.receiptMediaId,
  }
}

/** 表单校验。返回 errors 列表；空表示通过。 */
export interface DraftErrors {
  amount?: string
  category?: string
  note?: string
  time?: string
}

export function validateDraft(draft: AddEntryDraft): DraftErrors {
  const errors: DraftErrors = {}
  if (!draft.amountCents || draft.amountCents <= 0) {
    errors.amount = '请输入金额'
  } else {
    try {
      validateAmountCents(draft.amountCents)
    } catch (err) {
      errors.amount = err instanceof Error ? err.message : '金额格式不正确'
    }
  }
  if (!draft.categoryId) {
    errors.category = '请选择类目'
  }
  try {
    validateLedgerNote(draft.note)
  } catch (err) {
    errors.note = err instanceof Error ? err.message : '备注格式不正确'
  }
  if (draft.occurredAt) {
    const d = new Date(draft.occurredAt)
    if (Number.isNaN(d.getTime())) errors.time = '时间格式不正确'
    else {
      const now = Date.now()
      const maxFuture = now + 24 * 60 * 60 * 1000
      if (d.getTime() > maxFuture) errors.time = '时间不能晚于明天'
      if (d.getTime() < new Date('2020-01-01T00:00:00.000Z').getTime()) errors.time = '时间不能早于 2020-01-01'
    }
  }
  return errors
}

export function hasErrors(errors: DraftErrors): boolean {
  return Boolean(errors.amount || errors.category || errors.note || errors.time)
}

/** 类型 tab 文案。 */
export interface TypeTab {
  value: LedgerEntryType
  label: string
  amountColor: string
}

export function describeTypeTabs(): TypeTab[] {
  return [
    { value: 'expense', label: '支出', amountColor: '#FF8F79' },
    { value: 'income', label: '收入', amountColor: '#43C89A' },
  ]
}

/** 付款人选项。 */
export interface PayerOption {
  value: string
  label: string
}

export function describePayerOptions(selfMemberKey: string, otherMemberKey: string, memberCount: number): PayerOption[] {
  if (memberCount < 2) return [{ value: selfMemberKey, label: '我' }]
  return [
    { value: selfMemberKey, label: '我' },
    { value: otherMemberKey, label: '对方' },
  ]
}

/** 提交按钮描述。 */
export interface SaveButtonState {
  enabled: boolean
  label: string
}

export function describeSaveButton(errors: DraftErrors, isBusy: boolean, isEdit: boolean): SaveButtonState {
  if (isBusy) return { enabled: false, label: '保存中…' }
  if (hasErrors(errors)) return { enabled: false, label: isEdit ? '保存修改' : '保存' }
  return { enabled: true, label: isEdit ? '保存修改' : '保存' }
}

/** 类目编辑弹窗的初始值。 */
export interface CategoryDraft {
  name: string
  iconKey: string
  colorKey: string
}

export function defaultCategoryDraft(): CategoryDraft {
  return { name: '', iconKey: 'tag', colorKey: 'gray' }
}

export function validateCategoryDraft(draft: CategoryDraft): string | null {
  try {
    validateLedgerCategoryName(draft.name)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : '类目名格式不正确'
  }
}

/** 8 个图标 / 8 个颜色的预设池（前端不能上传自定义，只能从这 8 选 1）。 */
export const CATEGORY_ICON_OPTIONS: Array<{ value: string; label: string; iconName: string }> = [
  { value: 'fork-spoon', label: '餐饮', iconName: 'fork-spoon' },
  { value: 'car', label: '交通', iconName: 'car' },
  { value: 'house', label: '居家', iconName: 'house' },
  { value: 'gamepad', label: '娱乐', iconName: 'gamepad' },
  { value: 'first-aid', label: '医疗', iconName: 'first-aid' },
  { value: 'shopping-bag', label: '服饰', iconName: 'shopping-bag' },
  { value: 'book', label: '教育', iconName: 'book' },
  { value: 'tag', label: '其他', iconName: 'tag' },
]

export const CATEGORY_COLOR_OPTIONS: Array<{ value: string; label: string; hex: string }> = [
  { value: 'amber', label: '暖黄', hex: '#E8B647' },
  { value: 'blue', label: '蓝', hex: '#4A90E2' },
  { value: 'mint', label: '薄荷', hex: '#5BBE93' },
  { value: 'coral', label: '珊瑚', hex: '#E78A7B' },
  { value: 'red', label: '红', hex: '#BA564B' },
  { value: 'purple', label: '紫', hex: '#9575CD' },
  { value: 'teal', label: '青', hex: '#4DB6AC' },
  { value: 'gray', label: '灰', hex: '#74847D' },
]

/** 时间格式：把 ISO 转成"今天"/"昨天"/"M月D日"/"yyyy-MM-dd"。PRD 008 后期决定账本不记时分，只到日期。 */
export function describeOccurredAtShort(occurredAt: string, now: Date = new Date()): string {
  if (!occurredAt) return ''
  const d = new Date(occurredAt)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.floor((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 月份：转 yyyy-MM 用于 Picker 模式。 */
export function describeMonthForPicker(occurredAt: string): string {
  if (!occurredAt) return toLedgerMonthString(new Date())
  return toLedgerMonthString(occurredAt)
}
