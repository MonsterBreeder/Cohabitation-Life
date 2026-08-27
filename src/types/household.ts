export type BuiltinHouseholdAvatarId = 'household-01' | 'household-02' | 'household-03'
export type BuiltinProfileAvatarId = 'person-neutral' | 'person-01' | 'person-02' | 'person-03' | 'person-04'

export interface BuiltinAvatar<T extends string> {
  kind: 'builtin'
  id: T
}

export type CustomAvatarPurpose = 'household' | 'profile'
export interface CustomAvatar { kind: 'custom'; resourceId: string; digest: string }
export type HouseholdAvatar = BuiltinAvatar<BuiltinHouseholdAvatarId> | CustomAvatar
export type ProfileAvatar = BuiltinAvatar<BuiltinProfileAvatarId> | CustomAvatar

export interface HouseholdSummary {
  id: string
  name: string
  avatar: HouseholdAvatar
  memberCount: number
  currentMemberRole: 'owner' | 'member'
  members: HouseholdMemberDisplay[]
}

/** 成员编号只保留在云端；首页仅凭这些资料显示“我”和另一位成员。 */
export interface HouseholdMemberDisplay {
  nickname: string
  avatar: ProfileAvatar
  isSelf: boolean
}

export interface CurrentProfile {
  nickname: string
  avatar: ProfileAvatar
}

export interface UpdateHouseholdRequest {
  name: string
  avatar: HouseholdAvatar
}

export interface UpdateProfileRequest {
  nickname: string
  avatar: ProfileAvatar
}

export interface CreateHouseholdRequest {
  requestId: string
  operationToken: string
  name: string
  avatar: HouseholdAvatar
}

export type HouseholdResult =
  | { status: 'HOME'; retryable: false; created: boolean; household: HouseholdSummary; profile: CurrentProfile }
  | { status: 'NO_HOME' | 'OPERATION_MISMATCH' | 'INVALID_REQUEST' | 'MULTIPLE_HOUSEHOLDS' | 'TEMPORARY_FAILURE'; retryable: boolean }

export interface ConfirmHouseholdRequest {
  requestId: string
  operationToken: string
}
