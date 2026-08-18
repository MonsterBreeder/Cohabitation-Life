// 家庭共同流水账的短期操作凭证 storage。
// 模式与 pending-task.ts 一致：保存到本地 in-flight 操作凭证，
// 用途：网络中断或页面刷新时能拿到上次的 requestId / operationToken 去云端做幂等去重。
// 关键安全：凭证只用于去重，不携带任何用户身份或家庭信息；过期/成功/失败后立即清理。

import { getStringStorage, setStringStorage } from './storage'

const PENDING_KEY = 'ledger.pending.operation'

const PENDING_TTL_MS = 5 * 60 * 1000 // 5 分钟

export type PendingLedgerKind =
  | 'add'
  | 'update'
  | 'delete'
  | 'restore'
  | 'addCategory'
  | 'updateCategory'
  | 'removeCategory'

/** 草稿。add / update 共享一个 shape（update 时多一个 entryId）。 */
export interface LedgerPendingDraft {
  type: 'expense' | 'income'
  amountCents: number
  categoryId: string
  payerMemberKey: string
  note: string
  occurredAt: string
  receiptMediaId: string | null
}

export interface LedgerCategoryPendingDraft {
  name: string
  iconKey: string
  colorKey: string
}

export interface PendingLedger {
  kind: PendingLedgerKind
  entryId?: string
  categoryId?: string
  requestId: string
  operationToken: string
  startedAt: number
  draft?: LedgerPendingDraft | LedgerCategoryPendingDraft
}

/** 读取当前 in-flight 凭证；过期或缺失返回 undefined。 */
export function readPendingLedger(): PendingLedger | undefined {
  const raw = getStringStorage(PENDING_KEY)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as PendingLedger
    if (!parsed || typeof parsed !== 'object') return undefined
    if (typeof parsed.requestId !== 'string' || typeof parsed.operationToken !== 'string') return undefined
    if (typeof parsed.startedAt !== 'number') return undefined
    if (Date.now() - parsed.startedAt > PENDING_TTL_MS) {
      setStringStorage(PENDING_KEY)
      return undefined
    }
    return parsed
  } catch {
    setStringStorage(PENDING_KEY)
    return undefined
  }
}

/** 写入或覆盖当前 in-flight 凭证。 */
export function writePendingLedger(pending: PendingLedger): void {
  setStringStorage(PENDING_KEY, JSON.stringify(pending))
}

/** 清理当前 in-flight 凭证。 */
export function clearPendingLedger(): void {
  setStringStorage(PENDING_KEY)
}
