import type { BuiltinProfileAvatarId, CurrentProfile } from '../../types/household'
import { validateDisplayText } from '../../utils/display-text'

export const profilePresets = [
  { id: 'xiaoshuai' as const, label: '小帅', nickname: '小帅', avatarId: 'person-01' as const },
  { id: 'xiaomei' as const, label: '小美', nickname: '小美', avatarId: 'person-02' as const },
]

export function hasHouseholdChanges(savedName: string, savedAvatarId: string, draftName: string, draftAvatarId: string): boolean {
  return savedName !== draftName || savedAvatarId !== draftAvatarId
}

export function hasProfileChanges(saved: CurrentProfile, draft: CurrentProfile): boolean {
  return saved.nickname !== draft.nickname || JSON.stringify(saved.avatar) !== JSON.stringify(draft.avatar) || saved.profilePreset !== draft.profilePreset
}

export function pickRandomProfileAvatar(random = Math.random): BuiltinProfileAvatarId {
  const ids: BuiltinProfileAvatarId[] = ['person-01', 'person-02', 'person-03', 'person-04']
  return ids[Math.min(ids.length - 1, Math.floor(random() * ids.length))]
}

export function householdNameError(value: string): string {
  const result = validateDisplayText(value, 20)
  if (result.valid) return ''
  if (result.reason === 'multiline') return '家庭名称不能换行'
  if (result.reason === 'too_long') return '家庭名称最多 20 个完整字符'
  return '请填写家庭名称'
}

export function nicknameError(value: string): string {
  const result = validateDisplayText(value, 12)
  if (result.valid) return ''
  if (result.reason === 'multiline') return '昵称不能换行'
  if (result.reason === 'too_long') return '昵称最多 12 个完整字符'
  return '请填写昵称'
}
