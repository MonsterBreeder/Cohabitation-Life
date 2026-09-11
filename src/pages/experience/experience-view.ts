// 体验页纯逻辑视图描述器（PRD 001 / Plan U4-U5）。
// 模式：纯函数 + 不持有状态。所有副作用都返回新的 ExperienceState。
// 约束：不调用云端服务、不写 Pinia、不读本地存储；复用正式账本金额校验。

import { validateAmountCents } from '../../utils/ledger-validators'
import type {
  ExperienceActionResult,
  ExperienceEntryType,
  ExperienceFootprint,
  ExperienceFootprintSample,
  ExperienceLedgerCategory,
  ExperienceLedgerEntry,
  ExperienceLedgerStats,
  ExperienceState,
  ExperienceTask,
  ExperienceTaskSample,
} from '../../types/experience'

export const EXPERIENCE_CATEGORIES: ExperienceLedgerCategory[] = [
  { id: 'food', label: '餐饮', colorHex: '#FF8F79' },
  { id: 'transport', label: '交通', colorHex: '#4A90E2' },
  { id: 'home', label: '居家', colorHex: '#43C89A' },
  { id: 'fun', label: '娱乐', colorHex: '#9575CD' },
  { id: 'other', label: '其他', colorHex: '#74847D' },
]

export const EXPERIENCE_TASK_SAMPLES: ExperienceTaskSample[] = [
  {
    id: 'task-1',
    title: '整理阳台',
    description: '把阳台的绿植浇一下水，顺便把上周晾的衣服收回来。',
    assigneeLabel: '示例责任方',
  },
  {
    id: 'task-2',
    title: '下周做饭',
    description: '周一到周五的晚餐安排一下，可以参考周末列好的菜单。',
    assigneeLabel: '示例责任方',
  },
]

export const EXPERIENCE_FOOTPRINT_SAMPLES: ExperienceFootprintSample[] = [
  {
    id: 'footprint-1',
    title: '周末公园',
    dateLabel: '2026-08-30',
    description: '傍晚一起绕湖走了一圈。',
    imagePath: '/static/experience/footprint-sample.png',
    expandedCopy: '示例正文：点开后这里会显示完整的故事、当时拍的照片和心情备注，仅作展示用，关闭示例后不会保存。',
  },
]

function zeroStats(): ExperienceLedgerStats {
  return {
    expenseCents: 0,
    incomeCents: 0,
    byCategoryCents: Object.fromEntries(EXPERIENCE_CATEGORIES.map((category) => [category.id, 0])),
  }
}

function computeStats(entries: ExperienceLedgerEntry[]): ExperienceLedgerStats {
  const stats = zeroStats()
  for (const entry of entries) {
    if (entry.type === 'expense') stats.expenseCents += entry.amountCents
    else stats.incomeCents += entry.amountCents
    stats.byCategoryCents[entry.categoryId] = (stats.byCategoryCents[entry.categoryId] ?? 0) + entry.amountCents
  }
  return stats
}

/** 生成体验页的初始状态；每次进入页面都重新构建，不保留跨页数据。 */
export function createExperienceState(): ExperienceState {
  return {
    tasks: EXPERIENCE_TASK_SAMPLES.map<ExperienceTask>((sample) => ({ ...sample, state: 'pending' })),
    categories: EXPERIENCE_CATEGORIES.slice(),
    entries: [],
    stats: zeroStats(),
    footprints: EXPERIENCE_FOOTPRINT_SAMPLES.map<ExperienceFootprint>((sample) => ({
      id: sample.id,
      title: sample.title,
      dateLabel: sample.dateLabel,
      description: sample.description,
      imagePath: sample.imagePath,
      expandedCopy: sample.expandedCopy,
      expanded: false,
    })),
  }
}

/** 切换事项的认领状态。 */
export function toggleTaskClaim(state: ExperienceState, taskId: string): ExperienceState {
  return {
    ...state,
    tasks: state.tasks.map((task) => task.id === taskId
      ? { ...task, state: task.state === 'pending' ? 'claimed' : 'pending' }
      : task),
  }
}

/** 提交一笔体验记账；输入是元为单位的字符串，错误时不修改状态。 */
export function submitExperienceEntry(
  state: ExperienceState,
  input: { type: ExperienceEntryType; amountText: string; categoryId: string; note?: string },
): ExperienceActionResult {
  let amountCents = 0
  try {
    amountCents = validateAmountCents(input.amountText)
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '金额格式不正确', state }
  }
  if (!EXPERIENCE_CATEGORIES.some((category) => category.id === input.categoryId)) {
    return { ok: false, error: '请选择类目', state }
  }
  const note = (input.note ?? '').trim().slice(0, 100)
  const entry: ExperienceLedgerEntry = {
    id: `entry-${state.entries.length + 1}-${Date.now()}`,
    type: input.type,
    amountCents,
    categoryId: input.categoryId,
    note,
  }
  const entries = [...state.entries, entry]
  return {
    ok: true,
    state: { ...state, entries, stats: computeStats(entries) },
  }
}

/** 切换足迹展开 / 收起。 */
export function toggleFootprint(state: ExperienceState, footprintId: string): ExperienceState {
  return {
    ...state,
    footprints: state.footprints.map((footprint) => footprint.id === footprintId
      ? { ...footprint, expanded: !footprint.expanded }
      : footprint),
  }
}

/** 重置：用于离开页面或重新进入。 */
export function resetExperienceState(): ExperienceState {
  return createExperienceState()
}
