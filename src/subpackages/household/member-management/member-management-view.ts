import type { HouseholdSummary } from '../../../types/household'
import { validateDisplayText } from '../../../utils/display-text'

/** 兼容输入组件直接传值与小程序事件对象两种形式，确保页面始终使用用户最新输入。 */
export function invitationNameFromInput(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const detail = (value as { detail?: unknown }).detail
    if (detail && typeof detail === 'object' && typeof (detail as { value?: unknown }).value === 'string') return (detail as { value: string }).value
  }
  return ''
}

/** 点击事件直接调用校验，避免依赖页面渲染阶段产生的中间状态。 */
export function invitationNameValidation(value: unknown) {
  return validateDisplayText(invitationNameFromInput(value), 12)
}

/** 只有创建者在真实双人家庭里看到移除动作，其他状态不渲染假入口。 */
export function canRemoveOtherMember(household?: HouseholdSummary): boolean {
  return household?.currentMemberRole === 'owner' && household.memberCount === 2
}

export function canInvite(household?: HouseholdSummary): boolean {
  return household?.currentMemberRole === 'owner' && household.memberCount === 1
}

export type InvitationPanelState = 'ready' | 'preparing' | 'failed' | 'idle'

/** 页面状态必须以真实请求状态为准，不能把“没有邀请”一律显示成“正在准备”。 */
export function invitationPanelState(hasPending: boolean, isBusy: boolean, hasError: boolean): InvitationPanelState {
  if (hasPending) return 'ready'
  if (isBusy) return 'preparing'
  if (hasError) return 'failed'
  return 'idle'
}
