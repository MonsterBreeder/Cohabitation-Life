import { validateDisplayText } from '../../../utils/display-text'
import type { TaskType } from '../../../types/task'

// 添加页与测试共用：标题、类型、截止日期、备注的受限描述。
// 返回受控的 valid / value / count / remaining / errorMessage，UI 只展示。

export const TITLE_MAX = 20
export const NOTE_MAX = 100

export const TASK_TYPES_DISPLAY: { value: TaskType; label: string; description: string }[] = [
  { value: 'low_stock', label: '快没了', description: '纸巾、洗衣液等用完前提醒' },
  { value: 'to_handle', label: '待处理', description: '退货、维修、联系房东等' },
  { value: 'expiring', label: '快到期', description: '房租、会员、滤芯等到期前提醒' },
]

export const TYPE_ERROR = '请选择事项类型'

export interface TitleState {
  valid: boolean
  value: string
  remaining: number
  errorMessage: string
}

export function describeTitle(value: string): TitleState {
  const result = validateDisplayText(value, TITLE_MAX)
  let errorMessage = ''
  if (!result.valid) {
    if (result.reason === 'empty') errorMessage = '请输入事项名称'
    else if (result.reason === 'multiline') errorMessage = '事项名称不能换行'
    else if (result.reason === 'too_long') errorMessage = `事项名称最多 ${TITLE_MAX} 个字`
  }
  return {
    valid: result.valid,
    value: result.value,
    remaining: Math.max(0, TITLE_MAX - result.count),
    errorMessage,
  }
}

export interface NoteState {
  valid: boolean
  value: string
  remaining: number
  errorMessage: string
}

/** 备注为空时 valid=true，不强制要求填写；过长才拒绝。 */
export function describeNote(value: string): NoteState {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return { valid: true, value: '', remaining: NOTE_MAX, errorMessage: '' }
  const result = validateDisplayText(value, NOTE_MAX)
  let errorMessage = ''
  if (!result.valid) {
    if (result.reason === 'multiline') errorMessage = '备注不能换行'
    else if (result.reason === 'too_long') errorMessage = `备注最多 ${NOTE_MAX} 个字`
  }
  return {
    valid: result.valid,
    value: result.value,
    remaining: Math.max(0, NOTE_MAX - result.count),
    errorMessage,
  }
}

/** 截止日期：yyyy-MM-dd 格式，且不早于今天。 */
export interface DueDateState {
  valid: boolean
  errorMessage: string
}

export function describeDueDate(value: string | undefined, today: string): DueDateState {
  if (!value) return { valid: true, errorMessage: '' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { valid: false, errorMessage: '请选择有效的截止日期' }
  if (value < today) return { valid: false, errorMessage: '截止日期不能早于今天' }
  return { valid: true, errorMessage: '' }
}

/** 提取"今天"日期字符串 yyyy-MM-dd，调用方传入稳定时基以保证可测。 */
export function todayIso(now: Date = new Date()): string {
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** 整个表单的提交门控：标题必填、类型必选、截止日期合法、备注合法。 */
export interface AddTaskDraft {
  title: string
  type: TaskType | undefined
  dueDate: string | undefined
  note: string
}

export function isDraftReady(draft: AddTaskDraft, today: string): boolean {
  if (!describeTitle(draft.title).valid) return false
  if (!draft.type) return false
  if (!describeNote(draft.note).valid) return false
  if (!describeDueDate(draft.dueDate, today).valid) return false
  return true
}
