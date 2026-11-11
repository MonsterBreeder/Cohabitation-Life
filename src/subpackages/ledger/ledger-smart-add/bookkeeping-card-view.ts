/** 文件用途：将已核对的草稿类目、餐段与金额转换为小票展示，结果不参与保存。 */
import type { DraftChoice, DraftEntry } from '../../../types/ledger-draft'
import { formatYuan } from '../../../utils/format'

/** 优先使用可信的餐饮标记，车辆图案仅为现有交通名称的展示。 */
export function categoryAppearance(category?: DraftChoice) {
  if (category?.dining) return { icon: 'bowl', tone: 'meal' } as const
  if (category?.name === '交通') return { icon: 'car', tone: 'mint' } as const
  return { icon: 'tag', tone: 'neutral' } as const
}

const meals = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }

/** 将短编号解析为当前快照中的名称，历史回执无草稿时由调用方显示顺序。 */
export function entryDisplay(
  entry: DraftEntry,
  categories: readonly DraftChoice[],
  members: readonly DraftChoice[],
) {
  const category = categories.find((item) => item.key === entry.categoryKey)
  const member = members.find((item) => item.key === entry.memberKey)
  const meal = entry.mealPeriod && meals[entry.mealPeriod]
  const income = entry.type === 'income'
  return {
    title: meal || category?.name || '待补充类目',
    detail: [
      meal && category?.name,
      entry.date || '待补充日期',
      member
        ? member.self
          ? income
            ? '我的收入'
            : '我付款'
          : `${member.name}${income ? '收入' : '付款'}`
        : '待补充成员',
    ]
      .filter(Boolean)
      .join(' · '),
    amount:
      entry.amountCents === null
        ? '待补充'
        : formatYuan(entry.amountCents, { sign: income ? 'income' : 'none' }),
    income,
    ...categoryAppearance(category),
  }
}
