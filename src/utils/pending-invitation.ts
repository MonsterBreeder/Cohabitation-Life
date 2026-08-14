import type { PendingInvitation } from '../types/invitation'

const storageKey = 'household.invite.pending.v2'
const tokenPattern = /^[A-Za-z0-9_-]{32,128}$/

/** 本地仅保留尚未过期的原始邀请凭证，用于创建者再次分享；云端永远只保存摘要。 */
export function readPendingInvitation(): PendingInvitation | undefined {
  try {
    const raw = uni.getStorageSync(storageKey)
    if (typeof raw !== 'string') return undefined
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return undefined
    const invitation = value as Partial<PendingInvitation>
    if (invitation.version !== 2 || !tokenPattern.test(invitation.inviteToken || '') || typeof invitation.inviteeName !== 'string' || !invitation.inviteeName.trim() || typeof invitation.expiresAt !== 'number' || invitation.expiresAt <= Date.now()) {
      uni.removeStorageSync(storageKey)
      return undefined
    }
    return invitation as PendingInvitation
  } catch {
    return undefined
  }
}

export function savePendingInvitation(invitation: PendingInvitation): void {
  try { uni.setStorageSync(storageKey, JSON.stringify(invitation)) } catch { /* 本地保存失败不影响云端邀请本身。 */ }
}

/** 分享成功只记录本机已发出的状态，不把“对方已收到”误当成“对方已加入”。 */
export function markPendingInvitationShared(): PendingInvitation | undefined {
  const current = readPendingInvitation()
  if (!current) return undefined
  const updated = { ...current, sharedAt: Date.now() }
  savePendingInvitation(updated)
  return updated
}

/** 邀请链接不变，只更新创建者在本机看到的邀请对象称呼。 */
export function renamePendingInvitation(inviteeName: string): PendingInvitation | undefined {
  const current = readPendingInvitation()
  if (!current) return undefined
  const updated = { ...current, inviteeName }
  savePendingInvitation(updated)
  return updated
}

export function clearPendingInvitation(): void {
  try { uni.removeStorageSync(storageKey) } catch { /* 存储不可用时由过期时间继续兜底。 */ }
}
