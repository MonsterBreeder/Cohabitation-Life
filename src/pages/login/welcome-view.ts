// 启动页视图描述器：把 auth / invitation / agreement 状态映射到受控的展示组合。
// 约束：
// - 不读 Pinia 或云端，只接受入参；方便单元测试覆盖所有视图模式与按钮文案
// - 不返回原始邀请原文、家庭编号或内部标识
// - 按钮 action 是字符串枚举，调用方按 action 决定路由；避免页面写死判断

import type { PreviewAvatar } from '../../types/invitation'

export type WelcomeMode =
  | 'recovery-pending' // 已有标记，正在恢复
  | 'recovery-failed' // 恢复失败，保留重试
  | 'welcome' // 普通欢迎页
  | 'invite-pending' // 有邀请，正在确认
  | 'invite-summary' // 邀请摘要可见
  | 'invite-failed' // 邀请暂时无法确认，可重试
  | 'invite-terminal' // 邀请终态：邀请无效/过期/已使用/满员

export type WelcomeAction =
  | 'start-use' // 用户确认协议后开始使用（create/join 入口统一在这里）
  | 'preview-experience' // 跳转到独立功能体验
  | 'end-invite' // 用户主动结束无效邀请
  | 'retry' // 重新尝试恢复或预览
  | null

export interface WelcomeButton {
  label: string
  action: WelcomeAction
  loading: boolean
  disabled: boolean
}

export interface WelcomeInvitationCard {
  inviterNickname: string
  inviterAvatar: PreviewAvatar | null
  householdName: string
  memberCount: number
}

export interface WelcomeView {
  mode: WelcomeMode
  loadingText: string | null
  errorMessage: string | null
  /** 终态说明卡片：邀请失败或终态时给用户一句"为什么"。 */
  terminalTitle: string | null
  terminalMessage: string | null
  invitation: WelcomeInvitationCard | null
  primary: WelcomeButton
  secondary: WelcomeButton
  /** 当前视图是否需要展示协议勾选：仅 welcome / invite-summary 模式下需要。 */
  showAgreement: boolean
  /** 协议勾选区下方的受控提示文案。 */
  agreementHint: string
  /**
   * 用于 e2e / 单测的稳定标识：主按钮在不同 mode 下行为不同（welcome=create / invite-summary=join），
   * 测试时通过 testid 区分。空字符串表示当前 mode 不需要可点的主按钮。
   */
  primaryTestId: string
}

export interface WelcomeViewInput {
  hasStartedUse: boolean
  authResolving: boolean
  authErrorMessage: string | null
  invitePhase: 'idle' | 'previewing' | 'failed' | 'other'
  invitePreview: WelcomeInvitationCard | null
  inviteErrorMessage: string | null
  /** 邀请预览的终态提示编号；与 authStore.notice 对齐。 */
  inviteTerminalNotice:
    | 'invite_invalid'
    | 'invite_expired'
    | 'invite_used'
    | 'home_full'
    | null
  /** 协议勾选状态。 */
  agreementChecked: boolean
}

const REVIEW_LABEL = '先看看怎么用'

/** 把状态折叠成单一视图模式；上层不再需要写判断。 */
export function resolveWelcomeMode(input: WelcomeViewInput): WelcomeMode {
  if (input.hasStartedUse) {
    if (input.authResolving) return 'recovery-pending'
    if (input.authErrorMessage) return 'recovery-failed'
    return 'recovery-pending'
  }
  if (input.inviteTerminalNotice) return 'invite-terminal'
  if (input.inviteErrorMessage) return 'invite-failed'
  if (input.invitePhase === 'previewing') return 'invite-pending'
  if (input.invitePreview) return 'invite-summary'
  return 'welcome'
}

/** 当前模式是否需要用户先勾选协议再点主按钮。 */
function requiresAgreement(mode: WelcomeMode): boolean {
  return mode === 'welcome' || mode === 'invite-summary'
}

/** 生成主按钮与次按钮的文案/动作。 */
function describeButtons(
  mode: WelcomeMode,
  isResolving: boolean,
  agreementRequired: boolean,
  agreementChecked: boolean,
): { primary: WelcomeButton; secondary: WelcomeButton } {
  if (mode === 'recovery-pending') {
    return {
      primary: { label: '正在确认…', action: null, loading: true, disabled: true },
      secondary: { label: '', action: null, loading: false, disabled: true },
    }
  }
  if (mode === 'recovery-failed') {
    return {
      primary: { label: '重新确认', action: 'retry', loading: isResolving, disabled: isResolving },
      secondary: { label: '', action: null, loading: false, disabled: true },
    }
  }
  if (mode === 'invite-pending') {
    return {
      primary: { label: '正在确认…', action: null, loading: true, disabled: true },
      secondary: { label: '', action: null, loading: false, disabled: true },
    }
  }
  if (mode === 'invite-failed') {
    return {
      primary: { label: '重新确认邀请', action: 'retry', loading: isResolving, disabled: isResolving },
      secondary: { label: '结束这份邀请', action: 'end-invite', loading: false, disabled: false },
    }
  }
  if (mode === 'invite-terminal') {
    return {
      primary: { label: '结束这份邀请', action: 'end-invite', loading: false, disabled: false },
      secondary: { label: REVIEW_LABEL, action: 'preview-experience', loading: false, disabled: false },
    }
  }
  if (mode === 'invite-summary') {
    return {
      primary: {
        label: '加入这个家',
        action: 'start-use',
        loading: false,
        disabled: isResolving || (agreementRequired && !agreementChecked),
      },
      secondary: { label: REVIEW_LABEL, action: 'preview-experience', loading: false, disabled: false },
    }
  }
  // welcome
  return {
    primary: {
      label: '开始使用',
      action: 'start-use',
      loading: false,
      disabled: isResolving || (agreementRequired && !agreementChecked),
    },
    secondary: { label: REVIEW_LABEL, action: 'preview-experience', loading: false, disabled: false },
  }
}

const TERMINAL_COPY: Record<NonNullable<WelcomeViewInput['inviteTerminalNotice']>, { title: string; message: string }> = {
  invite_invalid: { title: '这份邀请无效', message: '请确认你打开的是对方刚刚发来的邀请。' },
  invite_expired: { title: '这份邀请已失效', message: '它可能已经超过了有效时间。' },
  invite_used: { title: '这份邀请已被使用', message: '每份邀请只能用于一次加入确认。' },
  home_full: { title: '这个家已经满员', message: '一个家目前只能由两位成员共同使用。' },
}

const AGREEMENT_HINT_BY_MODE: Partial<Record<WelcomeMode, string>> = {
  welcome: '勾选后我们将为你建立最小身份，根据云端真实状态进入对应页面。',
  'invite-summary': '勾选后我们将核验这份邀请，然后进入对方家庭。',
}

export function describeWelcomeView(input: WelcomeViewInput): WelcomeView {
  const mode = resolveWelcomeMode(input)
  const isResolving = input.authResolving || input.invitePhase === 'previewing'
  const agreementRequired = requiresAgreement(mode)
  const { primary, secondary } = describeButtons(mode, isResolving, agreementRequired, input.agreementChecked)

  const showAgreement = agreementRequired
  const loadingText = mode === 'recovery-pending' ? '正在确认登录状态' : mode === 'invite-pending' ? '正在确认邀请' : null

  let errorMessage: string | null = null
  if (mode === 'recovery-failed') errorMessage = input.authErrorMessage
  else if (mode === 'invite-failed') errorMessage = input.inviteErrorMessage

  const terminal = input.inviteTerminalNotice ? TERMINAL_COPY[input.inviteTerminalNotice] : null
  // 用 mode 区分主按钮的 testid，方便 e2e 区分 welcome(create) 和 invite-summary(join) 两条路径
  const primaryTestId = primary.action ? `welcome-primary-${primary.action}--${mode}` : ''
  return {
    mode,
    loadingText,
    errorMessage,
    terminalTitle: mode === 'invite-terminal' ? terminal?.title ?? '邀请暂时无法使用' : null,
    terminalMessage: mode === 'invite-terminal' ? terminal?.message ?? '请让对方重新发一份邀请。' : null,
    invitation: mode === 'invite-summary' ? input.invitePreview : null,
    primary,
    secondary,
    showAgreement,
    agreementHint: AGREEMENT_HINT_BY_MODE[mode] ?? '',
    primaryTestId,
  }
}
