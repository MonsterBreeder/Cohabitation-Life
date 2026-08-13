const crypto = require('crypto')

// 邀请必须是高强度、不透明且长度受限的文本。
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/

/** 只在服务端保存邀请摘要，数据库不保存分享链接中的原值。 */
function hashInviteToken(inviteToken) {
  return crypto.createHash('sha256').update(inviteToken).digest('hex')
}

/** 对外统一返回邀请无效，避免泄露邀请是否真实存在。 */
function invalidInvite() {
  return { status: 'INVITE_INVALID', retryable: false, notice: 'invite_invalid' }
}

/** 校验客户端唯一允许传入的邀请字段。 */
function normaliseInviteToken(inviteToken) {
  if (typeof inviteToken !== 'string' || !INVITE_TOKEN_PATTERN.test(inviteToken)) {
    return null
  }

  return inviteToken
}

/** 查询邀请及目标家庭，但绝不在登录模块中消费邀请。 */
async function resolveInvitation(inviteToken, repository, now) {
  if (!inviteToken) {
    return { kind: 'none' }
  }

  const invitation = await repository.findInvitationByTokenHash(hashInviteToken(inviteToken))
  if (!invitation || invitation.authorized === false) {
    return { kind: 'invalid' }
  }

  const expiresAt = new Date(invitation.expiresAt).getTime()
  if (!Number.isFinite(expiresAt)) {
    return { kind: 'invalid' }
  }

  if (expiresAt <= now.getTime()) {
    return { kind: 'expired' }
  }

  if (invitation.usedAt) {
    return { kind: 'used' }
  }

  const household = await repository.findHouseholdById(invitation.householdId)
  if (!household || household.authorized === false) {
    return { kind: 'invalid' }
  }

  if ((household.memberKeys || []).length >= 2) {
    return { kind: 'full' }
  }

  return { kind: 'valid' }
}

/**
 * 根据可信身份、家庭成员名单和邀请状态决定唯一入口。
 * login 允许幂等创建用户，resume 始终保持只读。
 */
async function resolveLoginEntry({ intent, inviteToken }, { identityKey, repository, now = new Date() }) {
  if (intent !== 'login' && intent !== 'resume') {
    throw new Error('Unsupported login intent')
  }

  if (!identityKey) {
    throw new Error('Missing trusted caller identity')
  }

  // 先做纯格式校验，异常邀请不会触发数据库查询或用户创建。
  const hasInvite = inviteToken !== undefined && inviteToken !== null && inviteToken !== ''
  const validInviteToken = hasInvite ? normaliseInviteToken(inviteToken) : undefined
  if (hasInvite && !validInviteToken) {
    return invalidInvite()
  }

  // 已有家庭优先返回自己的首页，不依赖邀请集合是否可用。
  const existingUser = await repository.findUserByIdentityKey(identityKey)
  const existingHousehold = existingUser
    ? await repository.findHouseholdByMemberKey(identityKey)
    : null

  if (existingHousehold) {
    return validInviteToken
      ? { status: 'ALREADY_IN_HOME', retryable: false, notice: 'already_in_home' }
      : { status: 'HOME', retryable: false }
  }

  if (intent === 'resume' && !existingUser) {
    return { status: 'NEED_LOGIN', retryable: false }
  }

  // 只有无家庭的主动登录才继续核验邀请。
  const invitation = await resolveInvitation(validInviteToken, repository, now)
  if (invitation.kind === 'invalid') {
    return invalidInvite()
  }

  if (intent === 'login' && !existingUser) {
    await repository.ensureUser(identityKey)
  }

  switch (invitation.kind) {
    case 'expired':
      return { status: 'INVITE_EXPIRED', retryable: false, notice: 'invite_expired' }
    case 'used':
      return { status: 'INVITE_USED', retryable: false, notice: 'invite_used' }
    case 'full':
      return { status: 'HOME_FULL', retryable: false, notice: 'home_full' }
    case 'valid':
      return { status: 'JOIN_CONFIRM', retryable: false }
    default:
      return { status: 'CREATE_HOME', retryable: false }
  }
}

module.exports = { hashInviteToken, normaliseInviteToken, resolveLoginEntry }
