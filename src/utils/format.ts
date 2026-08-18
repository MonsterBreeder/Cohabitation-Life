// 通用格式化工具。
// 范围：金额（元 / 分）、日期（yesterday / today / M月D日 / yyyy-MM-dd）、月份（yyyy-MM）。
// 与 task / ledger 模块都共用。金额格式化是 PRD 008 引入，月份格式化也是 PRD 008 引入。

/** 把整数分格式化为 ¥xx.xx 字符串。 */
export function formatYuan(amountCents: number, options?: { sign?: 'expense' | 'income' | 'none' }): string {
  if (!Number.isFinite(amountCents)) return '¥0.00'
  const sign = amountCents < 0 ? '-' : ''
  const absCents = Math.abs(Math.trunc(amountCents))
  const yuan = Math.floor(absCents / 100)
  const cents = absCents % 100
  const yuanStr = String(yuan).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const centsStr = String(cents).padStart(2, '0')
  let prefix = ''
  if (options?.sign === 'expense') prefix = '-'
  else if (options?.sign === 'income') prefix = '+'
  else prefix = sign
  return `${prefix}¥${yuanStr}.${centsStr}`
}

/** 把日期 / ISO 字符串格式化为 yyyy-MM 字符串。 */
export function formatLedgerMonth(input: Date | string): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** 把日期 / ISO 字符串格式化为 yyyy-MM-dd 字符串（用于日期分组标签）。 */
export function formatDateYMD(input: Date | string): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 把日期 / ISO 字符串格式化为"今天" / "昨天" / "M月D日" / "yyyy-MM-dd"。 */
export function formatDateGroupLabel(input: Date | string, now: Date = new Date()): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.floor((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }
  return formatDateYMD(date)
}
