// 体验页纯状态相关类型。
// 约束：不引用云端、Pinia、本地存储；只描述单次页面内可操作的对象。

export type ExperienceEntryType = 'expense' | 'income'

export interface ExperienceTaskSample {
  id: string
  title: string
  description: string
  /** 固定责任方：仅做展示，不暗示任何家庭成员。 */
  assigneeLabel: string
}

export type ExperienceTaskState = 'pending' | 'claimed'

export interface ExperienceTask {
  id: string
  title: string
  description: string
  assigneeLabel: string
  state: ExperienceTaskState
}

export interface ExperienceLedgerCategory {
  id: string
  label: string
  /** 体验用的固定类目；颜色用品牌色变量值，不引用真实家庭类目集合。 */
  colorHex: string
}

export interface ExperienceLedgerEntry {
  id: string
  type: ExperienceEntryType
  amountCents: number
  categoryId: string
  note: string
}

export interface ExperienceLedgerStats {
  expenseCents: number
  incomeCents: number
  /** 顺序与 categories 保持一致。 */
  byCategoryCents: Record<string, number>
}

export interface ExperienceFootprintSample {
  id: string
  title: string
  dateLabel: string
  description: string
  /** 与 src/pages/experience/assets/footprint-sample.png 对应；构建时直接走相对路径。 */
  imagePath: string
  expandedCopy: string
}

export interface ExperienceFootprint {
  id: string
  title: string
  dateLabel: string
  description: string
  imagePath: string
  expanded: boolean
  expandedCopy: string
}

export interface ExperienceState {
  tasks: ExperienceTask[]
  categories: ExperienceLedgerCategory[]
  entries: ExperienceLedgerEntry[]
  stats: ExperienceLedgerStats
  footprints: ExperienceFootprint[]
}

export type ExperienceActionResult =
  | { ok: true; state: ExperienceState }
  | { ok: false; error: string; state: ExperienceState }
