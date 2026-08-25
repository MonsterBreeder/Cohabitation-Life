// 家庭共同流水账（PRD 008）的视图描述器。
// 模式与 task/task-detail-view 一致：纯函数 + 不持有状态。
// 负责：类目色/图标映射、成员筛选、日期分组、金额格式化（消费 utils/format）。

import type { LedgerCategory, LedgerCategoryColorKey, LedgerCategoryIconKey, LedgerEntrySummary } from '../../types/ledger'
import { formatDateGroupLabel, formatYuan } from '../../utils/format'

/** 8 个类目 colorKey → CSS hex 颜色值。
 *  - 与 docs/brand/visual-standard.md 的事项三色（amber/mint/coral）保持一致
 *  - 其余颜色用同色系低饱和度，避开过于鲜艳的纯色
 */
export const LEDGER_CATEGORY_COLOR_MAP: Record<LedgerCategoryColorKey, string> = {
  amber: '#E8B647',   // 餐饮
  blue: '#4A90E2',    // 交通
  mint: '#5BBE93',    // 居家
  coral: '#E78A7B',   // 娱乐
  red: '#BA564B',     // 医疗
  purple: '#9575CD',  // 服饰
  teal: '#4DB6AC',    // 教育
  gray: '#74847D',    // 其他
}

/** 8 个类目 iconKey → Wot UI 内置 icon 名称。
 *  不用 PNG，全部用 SVG，节省 60KB 资源。
 */
export const LEDGER_CATEGORY_ICON_MAP: Record<LedgerCategoryIconKey, string> = {
  'fork-spoon': 'fork-spoon',
  'car': 'car',
  'house': 'house',
  'gamepad': 'gamepad',
  'first-aid': 'first-aid',
  'shopping-bag': 'shopping-bag',
  'book': 'book',
  'tag': 'tag',
}

/** 类目显示名（固定 8 个 + 自定义沿用 name 字段） */
export interface CategoryView {
  id: string
  name: string
  iconKey: LedgerCategoryIconKey
  colorKey: LedgerCategoryColorKey
  isCustom: boolean
  colorHex: string
  iconName: string
}

export function describeCategory(c: LedgerCategory): CategoryView {
  return {
    id: c.id,
    name: c.name,
    iconKey: c.iconKey,
    colorKey: c.colorKey,
    isCustom: c.isCustom,
    colorHex: LEDGER_CATEGORY_COLOR_MAP[c.colorKey] || LEDGER_CATEGORY_COLOR_MAP.gray,
    iconName: LEDGER_CATEGORY_ICON_MAP[c.iconKey] || LEDGER_CATEGORY_ICON_MAP.tag,
  }
}

/** 把账目按 "今天 / 昨天 / 2026-08-15" 等日期标签分组。 */
export interface EntryDateGroup {
  label: string
  entries: LedgerEntrySummary[]
}

export function groupEntriesByDate(entries: LedgerEntrySummary[], now: Date = new Date()): EntryDateGroup[] {
  const groups: Record<string, LedgerEntrySummary[]> = {}
  const labels: string[] = []
  for (const e of entries) {
    const label = formatDateGroupLabel(e.occurredAt, now)
    if (!groups[label]) {
      groups[label] = []
      labels.push(label)
    }
    groups[label].push(e)
  }
  return labels.map((label) => ({ label, entries: groups[label] }))
}

/** 格式化金额显示。type=expense 用 -，type=income 用 +，合计/统计用 'none' */
export function describeEntryAmount(type: 'expense' | 'income', amountCents: number): string {
  return formatYuan(amountCents, { sign: type === 'expense' ? 'expense' : type === 'income' ? 'income' : 'none' })
}

/** 付款人字段描述。type 决定动词（付款 / 入账），hasLeft 决定是否追加"（已离开）"。
 *  PRD 008 优化 R16-R19：收入账目不再统一显示"付款"，按 type 区分。 */
export function describePayerLine(
  type: 'expense' | 'income',
  payer: { hasLeft?: boolean; nickname: string } | null | undefined,
): string {
  const name = payer?.nickname || '成员'
  const verb = type === 'income' ? '入账' : '付款'
  const tail = payer?.hasLeft ? '（已离开）' : ''
  return `由 ${name} ${verb}${tail}`
}

/** 成员筛选描述。 */
export type PayerFilter = 'all' | 'me' | 'other'

export interface PayerFilterOption {
  value: PayerFilter
  label: string
}

export function describePayerFilterOptions(selfMemberKey: string): PayerFilterOption[] {
  return [
    { value: 'all', label: '全部' },
    { value: 'me', label: '我付的' },
    { value: 'other', label: '对方付的' },
  ]
}

/** 类型筛选描述。PRD 008 优化 R1：双维度 chip 第二行（支出 / 收入）。 */
export interface TypeFilterOption {
  value: 'all' | 'expense' | 'income'
  label: string
}

export function describeTypeFilterOptions(): TypeFilterOption[] {
  return [
    { value: 'all', label: '全部' },
    { value: 'expense', label: '支出' },
    { value: 'income', label: '收入' },
  ]
}

/** 月份格式化（yyyy-MM）。 */
export function describeEntryMonth(entry: LedgerEntrySummary): string {
  const d = new Date(entry.occurredAt)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** 月份切换：上 / 下个月。 */
export function shiftMonth(month: string, delta: number): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return ''
  const [y, m] = month.split('-').map((v) => Number.parseInt(v, 10))
  if (!y || !m) return ''
  const date = new Date(y, m - 1 + delta, 1)
  const ny = date.getFullYear()
  const nm = String(date.getMonth() + 1).padStart(2, '0')
  return `${ny}-${nm}`
}

/** 日期切换：上 / 下一天。yyyy-MM-dd 字符串；delta 可正可负。
 *  跨月 / 跨年通过 Date 自动进位（8 月 31 + 1 → 9 月 1，12 月 31 + 1 → 次年 1 月 1）。
 *  delta 不是有限数（如 NaN）→ 返回空串。 */
export function shiftDay(date: string, delta: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  if (!Number.isFinite(delta)) return ''
  const [y, m, d] = date.split('-').map((v) => Number.parseInt(v, 10))
  if (!y || !m || !d) return ''
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  if (!Number.isFinite(dt.getTime())) return ''
  const ny = dt.getFullYear()
  const nm = String(dt.getMonth() + 1).padStart(2, '0')
  const nd = String(dt.getDate()).padStart(2, '0')
  return `${ny}-${nm}-${nd}`
}

/** 日期显示：yyyy-MM → "2026 年 8 月"；yyyy-MM-dd → "2026 年 8 月 15 日"。 */
export function describeMonthLabel(month: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(month)) {
    const [y, m, d] = month.split('-').map((v) => Number.parseInt(v, 10))
    if (!y || !m || !d) return ''
    return `${y} 年 ${m} 月 ${d} 日`
  }
  if (!/^\d{4}-\d{2}$/.test(month)) return ''
  const [y, m] = month.split('-').map((v) => Number.parseInt(v, 10))
  return `${y} 年 ${m} 月`
}

/** 类目分布条：把 stats.byCategory 转换为按金额从大到小排序的色块。 */
export interface CategorySlice {
  categoryId: string
  expenseCents: number
  percent: number
  colorHex: string
}

export function describeCategorySlices(
  byCategory: Array<{ categoryId: string; expenseCents: number; incomeCents: number }>,
  totalExpenseCents: number,
  categories: LedgerCategory[],
): CategorySlice[] {
  const colorById = new Map<string, string>()
  for (const c of categories) {
    colorById.set(c.id, LEDGER_CATEGORY_COLOR_MAP[c.colorKey] || LEDGER_CATEGORY_COLOR_MAP.gray)
  }
  const slices = byCategory
    .filter((b) => b.expenseCents > 0)
    .map((b) => ({
      categoryId: b.categoryId,
      expenseCents: b.expenseCents,
      percent: totalExpenseCents > 0 ? b.expenseCents / totalExpenseCents : 0,
      colorHex: colorById.get(b.categoryId) || LEDGER_CATEGORY_COLOR_MAP.gray,
    }))
    .sort((a, b) => b.expenseCents - a.expenseCents)
  return slices
}

/** 家庭账本首页的所有操作描述（用于空态 / FAB 等）。 */
export interface HomeActions {
  canAdd: boolean
  canSeeDeleted: boolean
}

export function describeHomeActions(canAdd: boolean, canSeeDeleted: boolean): HomeActions {
  return { canAdd, canSeeDeleted }
}

/** 已删除项的描述：剩余多少天可恢复。 */
export function describeDeletedEntryHint(deletedAt: string | null, now: Date = new Date()): string {
  if (!deletedAt) return ''
  const d = new Date(deletedAt)
  if (Number.isNaN(d.getTime())) return ''
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
  const remaining = Math.max(0, 30 - diffDays)
  if (remaining === 0) return '今天清理'
  return `还剩 ${remaining} 天可恢复`
}
