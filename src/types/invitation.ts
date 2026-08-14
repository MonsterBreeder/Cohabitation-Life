import type { CurrentProfile, HouseholdAvatar, HouseholdResult, HouseholdSummary } from './household'

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

export interface InvitationPreviewHousehold {
  name: string
  avatar: HouseholdAvatar
  memberCount: number
}

export type InvitationResult =
  | { status: 'INVITE_READY'; retryable: false; inviteToken: string; expiresAt: string; inviteeName: string }
  | { status: 'INVITE_PREVIEW'; retryable: false; household: InvitationPreviewHousehold; inviter: CurrentProfile }
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
