import type { HouseholdAvatar } from '../types/household'

const storageKey = 'household.create.pending.v1'
const credentialPattern = /^[A-Za-z0-9_-]{16,128}$/

export interface PendingHousehold {
  version: 1
  requestId: string
  operationToken: string
  draft: {
    name: string
    avatar: HouseholdAvatar
  }
  createdAt: number
}

function isPendingHousehold(value: unknown): value is PendingHousehold {
  if (!value || typeof value !== 'object') return false
  const pending = value as Partial<PendingHousehold>
  return pending.version === 1
    && credentialPattern.test(pending.requestId || '')
    && credentialPattern.test(pending.operationToken || '')
    && typeof pending.createdAt === 'number'
    && typeof pending.draft?.name === 'string'
    && isHouseholdAvatar(pending.draft.avatar)
}

function isHouseholdAvatar(value: unknown): value is HouseholdAvatar {
  if (!value || typeof value !== 'object') return false
  const avatar = value as { kind?: unknown; id?: unknown; resourceId?: unknown; digest?: unknown }
  if (avatar.kind === 'builtin') return ['household-01', 'household-02', 'household-03'].includes(String(avatar.id))
  return avatar.kind === 'custom'
    && /^avatar_[a-f0-9]{32}$/.test(String(avatar.resourceId || ''))
    && /^[a-f0-9]{64}$/.test(String(avatar.digest || ''))
}

/** 读取仍需向云端确认的创建操作；本地内容从不作为家庭归属依据。 */
export function listPendingHouseholds(): PendingHousehold[] {
  try {
    const raw = uni.getStorageSync(storageKey)
    if (typeof raw !== 'string') return []
    const values: unknown = JSON.parse(raw)
    return Array.isArray(values) ? values.filter(isPendingHousehold) : []
  } catch {
    return []
  }
}

function save(values: PendingHousehold[]): void {
  try {
    if (values.length === 0) uni.removeStorageSync(storageKey)
    else uni.setStorageSync(storageKey, JSON.stringify(values))
  } catch {
    // 本地写入失败时仍以云端家庭状态为准。
  }
}

export function addPendingHousehold(pending: PendingHousehold): void {
  const values = listPendingHouseholds().filter((item) => item.requestId !== pending.requestId)
  save([...values, pending])
}

export function removePendingHousehold(operationToken: string): void {
  save(listPendingHouseholds().filter((item) => item.operationToken !== operationToken))
}

export function clearPendingHouseholds(): void {
  save([])
}
