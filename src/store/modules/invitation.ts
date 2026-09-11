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
    /** 当前预览绑定的邀请原文；迟到结果只在等于这个 token 时才允许写入。 */
    previewToken: undefined as string | undefined,
    /** 单调递增的预览凭证版本；切换邀请或重试时递增，用于丢弃旧请求的迟到响应。 */
    previewVersion: 0,
    result: undefined as InvitationResult | undefined,
    errorMessage: undefined as string | undefined,
  }),
  getters: {
    isBusy: (state) => ['creating', 'previewing', 'joining', 'removing'].includes(state.phase),
    /**
     * 邀请预览归一化状态，供页面判断当前应渲染欢迎 / 加载 / 失败 / 摘要：
     * - idle：当前未在请求，预览可直接展示
     * - previewing：正在请求云端预览，按钮禁用、显示加载
     * - failed：上一次预览失败，可重试
     * - other：正在 create / join / remove 等其它动作，按邀请未准备处理
     */
    invitePreviewStatus: (state): 'idle' | 'previewing' | 'failed' | 'other' => {
      if (state.phase === 'previewing') return 'previewing'
      if (state.phase === 'failed') return 'failed'
      if (state.phase === 'idle') return 'idle'
      return 'other'
    },
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
    /**
     * 预览邀请，并把响应绑定到当前 inviteToken：
     * - 每次调用递增 `previewVersion`，并把 `previewToken` 设为新传入的 token
     * - 迟到响应只有在 `previewVersion` 仍匹配时才写入，避免把上一份邀请显示给当前链接
     * - 切换 token、开始使用或主动结束时清空旧摘要和错误
     * - 网络或临时失败保留当前 token 与入口，不自动跳到受控终态
     * - 同一 token 连续请求会被新一次调用接管（沿用 in-flight + 版本号作废），
     *   不阻塞新请求；其它动作（create/join/remove）才受 isBusy 保护。
     */
    async previewInvite(inviteToken: string): Promise<InvitationResult | undefined> {
      if (this.phase !== 'idle' && this.phase !== 'previewing' && this.phase !== 'failed') return undefined
      const version = this.previewVersion + 1
      this.previewVersion = version
      this.previewToken = inviteToken
      this.phase = 'previewing'
      this.errorMessage = undefined
      this.preview = undefined
      try {
        const result = await previewInvitationInCloud(inviteToken)
        // 迟到结果：与最新一次预览不匹配时丢弃，不修改 state，避免显示错误邀请。
        if (this.previewVersion !== version) return undefined
        if (this.previewToken !== inviteToken) return undefined
        this.result = result
        this.preview = result.status === 'INVITE_PREVIEW' ? result : undefined
        this.phase = 'idle'
        return result
      } catch {
        if (this.previewVersion !== version || this.previewToken !== inviteToken) return undefined
        this.phase = 'failed'
        this.errorMessage = '暂时无法确认这份邀请，请稍后重试'
        return undefined
      }
    },
    /** 清空当前预览摘要：用于切换邀请、用户主动结束邀请或开始使用后。 */
    clearPreview(): void {
      this.preview = undefined
      this.previewToken = undefined
      this.previewVersion = this.previewVersion + 1
      this.errorMessage = undefined
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
    /** 分享回调只更新"已发出"提示；是否加入仍以随后读到的家庭成员数为准。 */
    markShared(): void { this.pending = markPendingInvitationShared() },
    renamePending(inviteeName: string): void { this.pending = renamePendingInvitation(inviteeName) },
  },
})

export function useInvitationStoreWithOut() { return useInvitationStore(store) }
