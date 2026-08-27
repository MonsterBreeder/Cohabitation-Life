import type { BuiltinProfileAvatarId, CurrentProfile, ProfileAvatar } from '../../types/household'
import { normaliseDisplayText, PROFILE_NAME_MAX_LENGTH, validateDisplayText } from '../../utils/display-text'

export function hasHouseholdChanges(savedName: string, savedAvatarId: string, draftName: string, draftAvatarId: string): boolean {
  return savedName !== draftName || savedAvatarId !== draftAvatarId
}

export function hasProfileChanges(saved: CurrentProfile, draft: CurrentProfile): boolean {
  return saved.nickname !== draft.nickname || JSON.stringify(saved.avatar) !== JSON.stringify(draft.avatar)
}

/** 把 Picker 的"哪一格高亮、第 5 格显示什么"这些视觉状态从模板里抽出来，便于单测。 */
export interface ProfilePickerState {
  activeBuiltinId: BuiltinProfileAvatarId | null
  isCustomSelected: boolean
  hasCustomPreview: boolean
  customLabel: '我的头像' | '上传'
  customAriaLabel: '我的自定义头像，点击重新上传' | '上传自定义头像'
}

export function describeProfilePickerState(modelValue: ProfileAvatar | null, customPreview?: string): ProfilePickerState {
  const isBuiltin = modelValue?.kind === 'builtin'
  const isCustomSelected = modelValue?.kind === 'custom'
  const hasCustomPreview = typeof customPreview === 'string' && customPreview.length > 0
  return {
    activeBuiltinId: isBuiltin ? modelValue.id : null,
    isCustomSelected,
    hasCustomPreview,
    customLabel: isCustomSelected ? '我的头像' : '上传',
    customAriaLabel: isCustomSelected ? '我的自定义头像，点击重新上传' : '上传自定义头像',
  }
}

export function householdNameError(value: string): string {
  const result = validateDisplayText(value, 20)
  if (result.valid) return ''
  if (result.reason === 'multiline') return '家庭名称不能换行'
  if (result.reason === 'too_long') return '家庭名称最多 20 个完整字符'
  return '请填写家庭名称'
}

export function nicknameError(value: string): string {
  const result = validateDisplayText(value, PROFILE_NAME_MAX_LENGTH)
  if (result.valid) return ''
  if (result.reason === 'multiline') return '昵称不能换行'
  if (result.reason === 'too_long') return `昵称最多 ${PROFILE_NAME_MAX_LENGTH} 个完整字符`
  return '请填写昵称'
}

/** 已有昵称原样保留；只有用户真正提交了不同名字时才执行新规则。 */
export function nicknameChangeError(savedValue: string, draftValue: string): string {
  if (normaliseDisplayText(savedValue) === normaliseDisplayText(draftValue)) return ''
  return nicknameError(draftValue)
}
