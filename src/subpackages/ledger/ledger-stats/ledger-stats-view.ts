// 家庭共同流水账统计页（PRD 008 / Plan U7）视图描述器。
// 模式：纯函数 + 不持有状态。

import type { LedgerCategory, LedgerStats } from '../../../types/ledger'
import { formatYuan } from '../../../utils/format'
// PRD 008：ledger-home 提到主包 src/pages/ledger/ 后，stats 页从主包引用公共视图描述器。
import { LEDGER_CATEGORY_COLOR_MAP } from '../../../pages/ledger/ledger-home-view'

export interface CategorySlice {
  categoryId: string
  categoryName: string
  colorHex: string
  expenseCents: number
  percent: number
}

export interface PayerBar {
  payerKey: string
  payerName: string
  expenseCents: number
  percent: number
}

export interface MonthComparison {
  delta: number
  percent: number
  direction: 'up' | 'down' | 'flat'
}

/** 把 stats.byCategory 转换为饼图切片。 */
export function describeCategorySlices(stats: LedgerStats | null, categories: LedgerCategory[]): CategorySlice[] {
  if (!stats) return []
  const colorById = new Map<string, string>()
  const nameById = new Map<string, string>()
  for (const c of categories) {
    colorById.set(c.id, LEDGER_CATEGORY_COLOR_MAP[c.colorKey] || LEDGER_CATEGORY_COLOR_MAP.gray)
    nameById.set(c.id, c.name)
  }
  const totalExpense = Math.max(stats.monthExpenseCents, 0)
  return stats.byCategory
    .filter((b) => b.expenseCents > 0)
    .map((b) => ({
      categoryId: b.categoryId,
      categoryName: nameById.get(b.categoryId) || '已删除类目',
      colorHex: colorById.get(b.categoryId) || LEDGER_CATEGORY_COLOR_MAP.gray,
      expenseCents: b.expenseCents,
      percent: totalExpense > 0 ? b.expenseCents / totalExpense : 0,
    }))
    .sort((a, b) => b.expenseCents - a.expenseCents)
}

/** 把 stats.byPayer 转换为柱状图数据。 */
export function describePayerBars(stats: LedgerStats | null, payerNamesByKey: Record<string, string>): PayerBar[] {
  if (!stats) return []
  const totalExpense = Math.max(stats.monthExpenseCents, 0)
  return stats.byPayer
    .filter((p) => p.expenseCents > 0)
    .map((p) => ({
      payerKey: p.payerMemberKey,
      payerName: payerNamesByKey[p.payerMemberKey] || '成员',
      expenseCents: p.expenseCents,
      percent: totalExpense > 0 ? p.expenseCents / totalExpense : 0,
    }))
    .sort((a, b) => b.expenseCents - a.expenseCents)
}

/** 月度对比：当前支出 vs 上月支出。 */
export function describeMonthComparison(currentExpenseCents: number, previousExpenseCents: number): MonthComparison {
  if (previousExpenseCents === 0) {
    return { delta: currentExpenseCents, percent: currentExpenseCents > 0 ? 1 : 0, direction: currentExpenseCents > 0 ? 'up' : 'flat' }
  }
  const delta = currentExpenseCents - previousExpenseCents
  const percent = Math.abs(delta) / previousExpenseCents
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
  return { delta, percent, direction }
}

/** 月度概览卡字段。 */
export interface MonthOverview {
  monthLabel: string
  expenseText: string
  incomeText: string
  netText: string
}

export function describeMonthOverview(month: string, stats: LedgerStats | null): MonthOverview {
  const [y, m] = month.split('-').map((v) => Number.parseInt(v, 10))
  const monthLabel = (!y || !m) ? '' : `${y} 年 ${m} 月`
  const exp = stats?.monthExpenseCents || 0
  const inc = stats?.monthIncomeCents || 0
  const net = inc - exp
  const sign = net >= 0 ? '+' : '-'
  return {
    monthLabel,
    expenseText: formatYuan(exp, { sign: 'none' }),
    incomeText: formatYuan(inc, { sign: 'none' }),
    netText: `${sign}${formatYuan(Math.abs(net), { sign: 'none' })}`,
  }
}

/** 月份切换：上 / 下月。 */
export function shiftMonth(month: string, delta: number): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return ''
  const [y, m] = month.split('-').map((v) => Number.parseInt(v, 10))
  if (!y || !m) return ''
  const date = new Date(y, m - 1 + delta, 1)
  const ny = date.getFullYear()
  const nm = String(date.getMonth() + 1).padStart(2, '0')
  return `${ny}-${nm}`
}
