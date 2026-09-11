// 邀请终态页（PRD 001 / Plan U3）视图描述器。
// 模式：纯函数 + 不持有状态。根据本地有限提示编号 + 是否已开始使用，返回唯一下一步。

import type { EntryNotice } from '../../../types/auth'

export type InviteStatusAction = 'end-invite-and-welcome' | 'create-home' | 'back-home' | 'retry' | null

export interface InviteStatusInput {
  notice: EntryNotice | null
  hasStartedUse: boolean
  hasHousehold: boolean
  isResolving: boolean
  errorMessage: string | null
}

export interface InviteStatusView {
  title: string
  description: string
  primaryLabel: string
  primaryAction: InviteStatusAction
  primaryLoading: boolean
  primaryDisabled: boolean
  showSecondary: boolean
  secondaryLabel: string
  secondaryAction: InviteStatusAction
}

const TERMINAL_COPY: Record<Exclude<EntryNotice, 'already_in_home' | 'removed_from_home'>, { title: string; description: string }> = {
  invite_invalid: { title: '这份邀请无效', description: '请确认你打开的是对方刚刚发来的邀请。' },
  invite_expired: { title: '这份邀请已失效', description: '它可能已经超过了有效时间。' },
  invite_used: { title: '这份邀请已被使用', description: '每份邀请只能用于一次加入确认。' },
  home_full: { title: '这个家已经满员', description: '一个家目前只能由两位成员共同使用。' },
}

export function describeInviteStatusView(input: InviteStatusInput): InviteStatusView {
  // 已开始使用且有家庭：返回自己的家庭即可。
  if (input.hasStartedUse && input.hasHousehold) {
    return {
      title: '这份邀请已不适用',
      description: '你已经有自己的家。可以回到自己的家继续使用，或联系对方重新发送邀请。',
      primaryLabel: '回到自己的家',
      primaryAction: 'back-home',
      primaryLoading: false,
      primaryDisabled: false,
      showSecondary: false,
      secondaryLabel: '',
      secondaryAction: null,
    }
  }

  // 已开始使用但没有家庭：协议确认后再核验邀请会变成受控终态，主动去创建家庭。
  if (input.hasStartedUse && !input.hasHousehold) {
    const copy = input.notice ? TERMINAL_COPY[input.notice as keyof typeof TERMINAL_COPY] : null
    return {
      title: copy?.title ?? '邀请暂时无法使用',
      description: copy?.description ?? '请联系对方重新发一份邀请，或先创建一个新家庭。',
      primaryLabel: '创建我的家',
      primaryAction: 'create-home',
      primaryLoading: input.isResolving,
      primaryDisabled: input.isResolving,
      showSecondary: false,
      secondaryLabel: '',
      secondaryAction: null,
    }
  }

  // 未开始使用：只能结束邀请回到欢迎页，不允许在终态页自动开始使用或加入。
  const copy = input.notice ? TERMINAL_COPY[input.notice as keyof typeof TERMINAL_COPY] : null
  return {
    title: copy?.title ?? '邀请暂时无法使用',
    description: copy?.description ?? '请联系对方重新发一份邀请。',
    primaryLabel: '结束这份邀请',
    primaryAction: 'end-invite-and-welcome',
    primaryLoading: false,
    primaryDisabled: false,
    showSecondary: false,
    secondaryLabel: '',
    secondaryAction: null,
  }
}

/** 给上层提供在加载/失败/未知状态时的占位视图，避免页面只剩白屏。 */
export function describeInviteStatusLoading(): InviteStatusView {
  return {
    title: '正在确认这份邀请',
    description: '请稍候，我们正在和对方核对。',
    primaryLabel: '正在确认…',
    primaryAction: null,
    primaryLoading: true,
    primaryDisabled: true,
    showSecondary: false,
    secondaryLabel: '',
    secondaryAction: null,
  }
}
