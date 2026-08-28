// 家庭共同流水账的输入校验工具。
// 范围：金额 / 备注 / 发生时间 / 类目名。所有抛错都使用自定义错误类型，便于 service / store 区分。
// 设计原则：与 task-validators 风格一致；不可静默纠正，必须由调用方决定是否提示。

/** 金额上限：999999999 分 = ¥9,999,999.99，覆盖七位数收入和大额共同支出。 */
export const LEDGER_AMOUNT_MAX_CENTS = 999_999_999

/** 备注最大长度（与 PRD 008 §"字段"表一致）。 */
export const LEDGER_NOTE_MAX_LENGTH = 100

/** 类目名长度范围。 */
export const LEDGER_CATEGORY_NAME_MIN = 2
export const LEDGER_CATEGORY_NAME_MAX = 8

/** 最早允许的发生时间：2020-01-01。防止历史乱填。 */
export const LEDGER_OCCURRED_AT_MIN = '2020-01-01'

/** 允许的未来天数：今天 + 1 天（防客户端时区错乱）。 */
export const LEDGER_OCCURRED_AT_MAX_FUTURE_DAYS = 1

/** 校验失败时抛错。message 给用户，code 给程序判断。 */
export class LedgerValidationError extends Error {
  constructor(
    public readonly code: 'AMOUNT_INVALID' | 'NOTE_INVALID' | 'TIME_INVALID' | 'CATEGORY_NAME_INVALID',
    message: string,
  ) {
    super(message)
    this.name = 'LedgerValidationError'
  }
}

/** 把"元"输入（字符串 / 数字）转换为整数分。 */
export function validateAmountCents(input: string | number): number {
  let numeric: number
  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (trimmed.length === 0) {
      throw new LedgerValidationError('AMOUNT_INVALID', '请输入金额')
    }
    if (!/^-?\d+(\.\d{1,3})?$/.test(trimmed)) {
      throw new LedgerValidationError('AMOUNT_INVALID', '金额格式不正确')
    }
    numeric = Number.parseFloat(trimmed)
  } else if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new LedgerValidationError('AMOUNT_INVALID', '金额格式不正确')
    }
    numeric = input
  } else {
    throw new LedgerValidationError('AMOUNT_INVALID', '金额格式不正确')
  }

  // 用 cents 整数化：toFixed(2) 后 parseFloat 拿到的就是 2 位小数
  // 例：12.5 → "12.50" → 12.5 → ×100 → 1250
  // 例：12.345 → "12.35"（银行家舍入）→ 12.35 → ×100 → 1235
  const cents = Math.round(numeric * 100)

  if (!Number.isFinite(cents)) {
    throw new LedgerValidationError('AMOUNT_INVALID', '金额格式不正确')
  }
  if (cents <= 0) {
    throw new LedgerValidationError('AMOUNT_INVALID', '金额必须大于 0')
  }
  if (cents > LEDGER_AMOUNT_MAX_CENTS) {
    throw new LedgerValidationError('AMOUNT_INVALID', '金额超过上限')
  }
  if (!Number.isInteger(cents)) {
    // 二次兜底：虽然 cents 是 Math.round 结果理论上一定整数，但防御性写
    throw new LedgerValidationError('AMOUNT_INVALID', '金额格式不正确')
  }
  return cents
}

/** 校验并清洗备注。空字符串合法。 */
export function validateLedgerNote(input: string): string {
  if (typeof input !== 'string') {
    throw new LedgerValidationError('NOTE_INVALID', '备注格式不正确')
  }
  const trimmed = input.trim()
  if (trimmed.length > LEDGER_NOTE_MAX_LENGTH) {
    throw new LedgerValidationError('NOTE_INVALID', `备注最多 ${LEDGER_NOTE_MAX_LENGTH} 字`)
  }
  return trimmed
}

/** 校验发生时间。返回 Date 对象。 */
export function validateLedgerOccurredAt(input: Date | string): Date {
  let date: Date
  if (input instanceof Date) {
    date = input
  } else if (typeof input === 'string') {
    date = new Date(input)
  } else {
    throw new LedgerValidationError('TIME_INVALID', '时间格式不正确')
  }
  if (Number.isNaN(date.getTime())) {
    throw new LedgerValidationError('TIME_INVALID', '时间格式不正确')
  }
  // 最早边界：2020-01-01
  const minDate = new Date(`${LEDGER_OCCURRED_AT_MIN}T00:00:00.000Z`)
  if (date.getTime() < minDate.getTime()) {
    throw new LedgerValidationError('TIME_INVALID', '时间不能早于 2020-01-01')
  }
  // 最晚边界：今天 + 1 天
  const now = new Date()
  const maxFutureMs = now.getTime() + LEDGER_OCCURRED_AT_MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000
  if (date.getTime() > maxFutureMs) {
    throw new LedgerValidationError('TIME_INVALID', '时间不能晚于明天')
  }
  return date
}

/** 校验类目名。返回清洗后的字符串。 */
export function validateLedgerCategoryName(input: string): string {
  if (typeof input !== 'string') {
    throw new LedgerValidationError('CATEGORY_NAME_INVALID', '类目名格式不正确')
  }
  const trimmed = input.trim()
  if (trimmed.length < LEDGER_CATEGORY_NAME_MIN) {
    throw new LedgerValidationError('CATEGORY_NAME_INVALID', `类目名至少 ${LEDGER_CATEGORY_NAME_MIN} 个字`)
  }
  if (trimmed.length > LEDGER_CATEGORY_NAME_MAX) {
    throw new LedgerValidationError('CATEGORY_NAME_INVALID', `类目名最多 ${LEDGER_CATEGORY_NAME_MAX} 个字`)
  }
  return trimmed
}

/** 把 ISO 字符串转为 yyyy-MM 月份字符串。 */
export function toLedgerMonthString(input: Date | string): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) {
    throw new LedgerValidationError('TIME_INVALID', '时间格式不正确')
  }
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}
