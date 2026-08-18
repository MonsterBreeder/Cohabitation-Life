// 类目管理页（PRD 008 / Plan U6）视图描述器。

import type { LedgerCategory } from '../../../types/ledger'
import { CATEGORY_COLOR_OPTIONS, CATEGORY_ICON_OPTIONS } from '../ledger-add/ledger-add-view'

export type CategoryRowAction = 'rename' | 'hide' | 'remove' | 'unhide'

export interface CategoryRowActions {
  /** 重命名：仅自定义类目可改 name。 */
  rename: boolean
  /** 隐藏：所有类目都可"对自己隐藏"。 */
  hide: boolean
  /** 取消隐藏：当已隐藏时显示。 */
  unhide: boolean
  /** 删除：仅当无引用账目时；自定义类目才有"删除"动作。 */
  remove: boolean
}

/** 描述每个类目行的可执行操作。 */
export function describeCategoryRowActions(category: LedgerCategory, hiddenByMe: boolean, refCount: number): CategoryRowActions {
  const isCustom = category.isCustom === true
  return {
    rename: isCustom,
    hide: !hiddenByMe,
    unhide: hiddenByMe,
    remove: isCustom && refCount === 0,
  }
}

export interface CategorySection {
  title: string
  categories: LedgerCategory[]
}

export function describeCategorySections(presetCategories: LedgerCategory[], customCategories: LedgerCategory[]): CategorySection[] {
  return [
    { title: '系统预设', categories: presetCategories },
    { title: '我的自定义', categories: customCategories },
  ]
}

/** 重命名/删除确认弹窗的标题与占位符。 */
export function describeRenameDialog(category: LedgerCategory | null): { title: string; placeholder: string; initial: string } {
  if (!category) return { title: '重命名类目', placeholder: '2-8 字', initial: '' }
  return { title: `重命名「${category.name}」`, placeholder: '2-8 字', initial: category.name }
}

export function describeRemoveDialog(category: LedgerCategory | null): { title: string; message: string } {
  if (!category) return { title: '删除类目', message: '确定删除？' }
  return { title: `删除「${category.name}」`, message: '类目删除后无法恢复。' }
}

/** 类目添加弹窗的初始值（与 ledger-add 复用）。 */
export { CATEGORY_COLOR_OPTIONS, CATEGORY_ICON_OPTIONS }
