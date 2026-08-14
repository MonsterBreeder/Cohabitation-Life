// 云端只允许返回这些有限状态，页面不能自行推测用户或家庭归属。
export const entryStatuses = [
  'NEED_LOGIN',
  'CREATE_HOME',
  'JOIN_CONFIRM',
  'TRANSFER_CONFIRM',
  'HOME',
  'ALREADY_IN_HOME',
  'INVITE_INVALID',
  'INVITE_EXPIRED',
  'INVITE_USED',
  'HOME_FULL',
  'TEMPORARY_FAILURE',
  'REMOVED_FROM_HOME',
] as const

export type EntryStatus = (typeof entryStatuses)[number]

export type AuthIntent = 'login' | 'resume'

// 提示编号由本地状态映射产生，避免直接展示云端任意文本。
export type EntryNotice =
  | 'already_in_home'
  | 'invite_invalid'
  | 'invite_expired'
  | 'invite_used'
  | 'home_full'
  | 'removed_from_home'

export interface EntryResolution {
  status: EntryStatus
  retryable: boolean
  notice?: EntryNotice
}

export type EntryPage = 'login' | 'home' | 'create-home' | 'join-home' | 'invite-status'

// 最终分流统一清空旧页面栈，避免用户返回登录页。
export interface EntryRoute {
  type: 'relaunch'
  page: EntryPage
  url: string
  notice?: EntryNotice
}

export interface NoEntryRoute {
  type: 'none'
}

export type EntryRouteDecision = EntryRoute | NoEntryRoute
