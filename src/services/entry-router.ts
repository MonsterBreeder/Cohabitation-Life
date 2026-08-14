import type { EntryNotice, EntryPage, EntryRouteDecision, EntryStatus } from '../types/auth'

// 页面地址集中维护，防止 store 和各页面分别拼写路由。
const pageUrls: Record<EntryPage, string> = {
  login: '/pages/login/index',
  home: '/pages/index/index',
  'create-home': '/subpackages/household/create-home/index',
  'join-home': '/subpackages/household/join-home/index',
  'invite-status': '/subpackages/household/invite-status/index',
}

// 邀请异常只映射为有限提示，不携带云端内部原因。
const inviteNotices: Partial<Record<EntryStatus, EntryNotice>> = {
  INVITE_INVALID: 'invite_invalid',
  INVITE_EXPIRED: 'invite_expired',
  INVITE_USED: 'invite_used',
  HOME_FULL: 'home_full',
  REMOVED_FROM_HOME: 'removed_from_home',
}

/** 创建统一的重新进入页面动作。 */
function relaunch(page: EntryPage, notice?: EntryNotice): EntryRouteDecision {
  return {
    type: 'relaunch',
    page,
    url: pageUrls[page],
    ...(notice ? { notice } : {}),
  }
}

/** 把云端有限状态转换为唯一页面去向，未知状态保持当前页。 */
export function resolveEntryRoute(status: unknown): EntryRouteDecision {
  switch (status) {
    case 'NEED_LOGIN':
      return relaunch('login')
    case 'CREATE_HOME':
      return relaunch('create-home')
    case 'JOIN_CONFIRM':
    case 'TRANSFER_CONFIRM':
      return relaunch('join-home')
    case 'HOME':
      return relaunch('home')
    case 'ALREADY_IN_HOME':
      return relaunch('home', 'already_in_home')
    case 'INVITE_INVALID':
    case 'INVITE_EXPIRED':
    case 'INVITE_USED':
    case 'HOME_FULL':
      return relaunch('invite-status', inviteNotices[status])
    case 'REMOVED_FROM_HOME':
      return relaunch('create-home', inviteNotices[status])
    case 'TEMPORARY_FAILURE':
    default:
      return { type: 'none' }
  }
}
