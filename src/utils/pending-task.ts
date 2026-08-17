// 短期操作凭证 storage：保存到本地的 in-flight 操作凭证。
// 用途：网络中断或页面刷新时，能拿到上次的 requestId / operationToken 去云端做幂等去重。
// 关键安全：凭证只用于去重，不携带任何用户身份或家庭信息；过期/成功/失败后立即清理。
import { getStringStorage, setStringStorage } from './storage'

const PENDING_KEY = 'task.pending.operation'

const PENDING_TTL_MS = 5 * 60 * 1000 // 5 分钟；超时自动清理

export type PendingTaskKind = 'create' | 'claim' | 'complete' | 'abandon' | 'update' | 'addComment'

export interface PendingTask {
  kind: PendingTaskKind
  taskId?: string
  requestId: string
  operationToken: string
  startedAt: number
  // 草稿：用于 create 时刷新页面恢复已填字段
  draft?: {
    title: string
    type: 'low_stock' | 'to_handle' | 'expiring'
    dueDate?: string
    note?: string
  }
}

/** 读取当前 in-flight 凭证；过期或缺失返回 undefined。 */
export function readPendingTask(): PendingTask | undefined {
  const raw = getStringStorage(PENDING_KEY)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as PendingTask
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
export function writePendingTask(pending: PendingTask): void {
  setStringStorage(PENDING_KEY, JSON.stringify(pending))
}

/** 清理当前 in-flight 凭证。成功或失败都应调用。 */
export function clearPendingTask(): void {
  setStringStorage(PENDING_KEY)
}
