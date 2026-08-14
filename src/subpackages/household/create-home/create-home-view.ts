import { validateDisplayText } from '../../../utils/display-text'

export interface HouseholdNameState {
  valid: boolean
  value: string
  remaining: number
  errorMessage: string
}

/** 创建页和测试共用同一份家庭名称提示，避免按钮状态与错误文案互相矛盾。 */
export function describeHouseholdName(value: string): HouseholdNameState {
  const result = validateDisplayText(value, 20)
  const errorMessages = {
    empty: '请输入家庭名称',
    multiline: '家庭名称不能换行',
    too_long: '家庭名称最多 20 个字',
  } as const

  return {
    valid: result.valid,
    value: result.value,
    remaining: Math.max(0, 20 - result.count),
    errorMessage: result.valid ? '' : errorMessages[result.reason],
  }
}
