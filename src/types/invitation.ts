import type {
  BuiltinProfileAvatarId,
  CurrentProfile,
  HouseholdAvatar,
  HouseholdResult,
  HouseholdSummary,
} from './household'

/** 预览阶段专用的临时头像：服务端用有效邀请凭证换取短时 URL，失败时退化为默认头像。 */
export interface TempAvatar { kind: 'temp'; url: string }

/** 邀请摘要中展示的头像：受控的内置编号或短时 URL；不暴露云存储路径或资源编号。 */
export type PreviewAvatar =
  | { kind: 'builtin'; id: BuiltinProfileAvatarId }
  | TempAvatar

/** 邀请摘要中的邀请人资料；头像只能是 PreviewAvatar，避免泄露存储位置。 */
export interface PreviewProfile {
  nickname: string
  avatar: PreviewAvatar
}

/** 页面只处理这些受限结果，避免把云端任意文本直接用于展示或跳转。 */
export type InvitationStatus =
  | 'INVITE_READY'
  | 'INVITE_PREVIEW'
  | 'TRANSFER_CONFIRM'
  | 'INVITE_INVALID'
  | 'INVITE_EXPIRED'
  | 'INVITE_USED'
  | 'HOME_FULL'
  | 'ALREADY_IN_HOME'
  | 'FORBIDDEN'
  | 'NO_OTHER_MEMBER'
  | 'NO_HOME'
  | 'MULTIPLE_HOUSEHOLDS'
  | 'INVALID_REQUEST'
  | 'CONTENT_REJECTED'
  | 'TEMPORARY_FAILURE'

/**
 * 公开的邀请预览只返回四项必要展示信息：
 * - 邀请人昵称与头像（受控编号或短时 URL）
 * - 家庭名称与当前成员数
 * 不包含家庭头像自定义资源、成员列表、内部用户编号、家庭编号、家庭业务数据或邀请原文。
 */
export interface InvitationPreviewHousehold {
  name: string
  avatar: HouseholdAvatar
  memberCount: number
}

export type InvitationResult =
  | { status: 'INVITE_READY'; retryable: false; inviteToken: string; expiresAt: string; inviteeName: string }
  | { status: 'INVITE_PREVIEW'; retryable: false; household: InvitationPreviewHousehold; inviter: PreviewProfile }
  | { status: 'TRANSFER_CONFIRM'; retryable: false; household?: InvitationPreviewHousehold }
  | Extract<HouseholdResult, { status: 'HOME' }>
  | { status: Exclude<InvitationStatus, 'INVITE_READY' | 'INVITE_PREVIEW' | 'TRANSFER_CONFIRM'>; retryable: boolean }

export interface JoinInvitationRequest {
  inviteToken: string
  mode: 'join' | 'transfer'
}

export interface PendingInvitation {
  version: 2
  inviteToken: string
  expiresAt: number
  inviteeName: string
  sharedAt?: number
}

export type InvitationHomeResult = Extract<HouseholdResult, { status: 'HOME' }> & { household: HouseholdSummary }
