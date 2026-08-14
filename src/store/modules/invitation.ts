import { defineStore } from 'pinia'
import { createInvitationInCloud, joinInvitationInCloud, previewInvitationInCloud, removeOtherMemberInCloud } from '../../services/invitation-cloud'
import type { InvitationResult, JoinInvitationRequest, PendingInvitation } from '../../types/invitation'
import { clearPendingInvitation, markPendingInvitationShared, readPendingInvitation, renamePendingInvitation, savePendingInvitation } from '../../utils/pending-invitation'
import store from '..'
import { useHouseholdStore } from './household'

type InvitationPhase = 'idle' | 'creating' | 'previewing' | 'joining' | 'removing' | 'failed'

/** 邀请的短期凭证、确认过程与错误留在独立状态中，家庭资料始终由家庭状态统一保存。 */
export const useInvitationStore = defineStore('invitation', {
  state: () => ({
    phase: 'idle' as InvitationPhase,
    pending: readPendingInvitation() as PendingInvitation | undefined,
    preview: undefined as Extract<InvitationResult, { status: 'INVITE_PREVIEW' }> | undefined,
    result: undefined as InvitationResult | undefined,
    errorMessage: undefined as string | undefined,
  }),
  getters: {
    isBusy: (state) => ['creating', 'previewing', 'joining', 'removing'].includes(state.phase),
  },
  actions: {
    async create(inviteeName: string): Promise<InvitationResult | undefined> {
      if (this.isBusy) return undefined
      this.phase = 'creating'; this.errorMessage = undefined
      try {
        const result = await createInvitationInCloud(inviteeName)
        this.result = result
        if (result.status === 'INVITE_READY') {
          this.pending = { version: 2, inviteToken: result.inviteToken, expiresAt: Date.parse(result.expiresAt), inviteeName: result.inviteeName }
          savePendingInvitation(this.pending)
        }
        this.phase = 'idle'
        return result
      } catch {
        this.phase = 'failed'; this.errorMessage = '邀请暂时没有准备好，请稍后重试'
        return undefined
      }
    },
    async previewInvite(inviteToken: string): Promise<InvitationResult | undefined> {
      if (this.isBusy) return undefined
      this.phase = 'previewing'; this.errorMessage = undefined
      try {
        const result = await previewInvitationInCloud(inviteToken)
        this.result = result
        this.preview = result.status === 'INVITE_PREVIEW' ? result : undefined
        this.phase = 'idle'
        return result
      } catch {
        this.phase = 'failed'; this.errorMessage = '暂时无法确认这份邀请，请稍后重试'
        return undefined
      }
    },
    async join(input: JoinInvitationRequest): Promise<InvitationResult | undefined> {
      if (this.isBusy) return undefined
      this.phase = 'joining'; this.errorMessage = undefined
      try {
        const result = await joinInvitationInCloud(input)
        this.result = result
        if (result.status === 'HOME') {
          useHouseholdStore().applyHome(result)
          clearPendingInvitation()
        }
        this.phase = 'idle'
        return result
      } catch {
        this.phase = 'failed'; this.errorMessage = '加入结果暂时无法确认，请稍后重试'
        return undefined
      }
    },
    async removeOther(): Promise<InvitationResult | undefined> {
      if (this.isBusy) return undefined
      this.phase = 'removing'; this.errorMessage = undefined
      try {
        const result = await removeOtherMemberInCloud()
        this.result = result
        if (result.status === 'HOME') useHouseholdStore().applyHome(result)
        this.phase = 'idle'
        return result
      } catch {
        this.phase = 'failed'; this.errorMessage = '暂时无法移除成员，请稍后重试'
        return undefined
      }
    },
    clearResult(): void { this.result = undefined; this.errorMessage = undefined },
    /** 分享回调只更新“已发出”提示；是否加入仍以随后读到的家庭成员数为准。 */
    markShared(): void { this.pending = markPendingInvitationShared() },
    renamePending(inviteeName: string): void { this.pending = renamePendingInvitation(inviteeName) },
  },
})

export function useInvitationStoreWithOut() { return useInvitationStore(store) }
