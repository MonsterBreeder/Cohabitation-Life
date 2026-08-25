// 家庭共同流水账详情页（PRD 008 / Plan U6）视图描述器。
// 模式与 task/task-detail-view 一致：纯函数 + 不持有状态。

import type { LedgerEntryDetail, LedgerEntryType } from '../../../types/ledger'
import { formatYuan } from '../../../utils/format'
import { describePayerLine as describePayerLineByType } from '../../../pages/ledger/ledger-home-view'

export type DetailAction = 'edit' | 'delete'

export interface DetailActionAvailability {
  /** 编辑：仅当当前用户是创建者（payerMemberKey === selfMemberKey）时开放。 */
  edit: boolean
  /** 删除：仅当当前用户是创建者时开放（PRD 008 R3）。 */
  delete: boolean
}

/** 编辑/删除：根据服务端返回的 canEdit / canDelete 决定按钮显隐。
 *  历史版本用 detail.payer.memberKey === selfMemberKey 算，但前端没有 identityKey
 *  （identityKey 是云端从 APPID+OPENID 算出来的），selfMemberKey 一直是 ''，导致创建者
 *  也看不到编辑按钮。新版由 getEntry 响应里直接带 canEdit / canDelete 回来。 */
export function describeActions(detail: LedgerEntryDetail | undefined): DetailActionAvailability {
  if (!detail) return { edit: false, delete: false }
  return { edit: detail.canEdit === true, delete: detail.canDelete === true }
}

/** 顶部金额显示：支出红 / 收入绿。 */
export function describeAmountLine(detail: LedgerEntryDetail | undefined): string {
  if (!detail) return ''
  return formatYuan(detail.amountCents, { sign: detail.type === 'expense' ? 'expense' : 'income' })
}

/** 金额色：按 type 决定。 */
export function describeAmountColor(type: LedgerEntryType | undefined): string {
  if (type === 'income') return '#43C89A'
  if (type === 'expense') return '#FF8F79'
  return '#29443A'
}

/** 给定删除动作，需要先弹二次确认的文案（PRD 008 R10）。 */
export function describeDeleteConfirmMessage(detail: LedgerEntryDetail | undefined): string {
  if (!detail) return '删除后无法在产品内恢复，30 天后系统清理。是否继续？'
  const note = detail.note && detail.note.length > 0 ? detail.note : '这条账目'
  return `「${note}」删除后无法在产品内恢复，30 天后系统清理。是否继续？`
}

/** 付款人显示文案。PRD 008 优化 R17：按 type 区分"付款"和"入账"。
 *  实际文案生成委托给 ledger-home-view:describePayerLine（共享描述器避免漂移）。 */
export function describePayerLine(detail: LedgerEntryDetail | undefined): string {
  if (!detail) return ''
  return describePayerLineByType(detail.type, detail.payer)
}

/** 状态描述：当前账目所属时间窗口（今天 / 昨天 / M月D日 / yyyy-MM-dd）。PRD 008 后期决定账本不记时分，只到日期。 */
export function describeWhenLine(detail: LedgerEntryDetail | undefined, now: Date = new Date()): string {
  if (!detail || !detail.occurredAt) return ''
  const d = new Date(detail.occurredAt)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.floor((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000))
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 相对时间格式：刚刚/N 分钟前/N 小时前/N 天前。 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const diffMs = now.getTime() - date.getTime()
  if (diffMs < 0) return formatAbsolute(date)
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay < 7) return `${diffDay} 天前`
  return formatAbsolute(date)
}

function formatAbsolute(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}

/** 类型 label。 */
export function describeTypeLabel(type: LedgerEntryType | undefined): string {
  if (type === 'expense') return '支出'
  if (type === 'income') return '收入'
  return ''
}
