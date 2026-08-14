const crypto = require('crypto')

const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/
const DEFAULT_HOUSEHOLD_AVATAR = { kind: 'builtin', id: 'household-01' }
const DEFAULT_PROFILE_AVATAR = { kind: 'builtin', id: 'person-neutral' }

/** 将家庭邀请固定为每个家庭一份文档，重发时替换旧凭证，避免留下可并发使用的旧邀请。 */
function invitationId(householdId) {
  return `invite_${householdId}`
}

/** 沿用创建家庭时的固定归属锁，使同一账号并发加入不同家庭时只能有一个事务提交。 */
function membershipLockId(identityKey) {
  return `create_${crypto.createHash('sha256').update(identityKey).digest('hex')}`
}

function hashInviteToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function safeHousehold(home) {
  return {
    name: typeof home?.name === 'string' && home.name.trim() ? home.name.trim() : '我们的小家',
    avatar: home?.avatar?.kind === 'builtin' ? home.avatar : DEFAULT_HOUSEHOLD_AVATAR,
    memberCount: Array.isArray(home?.memberKeys) && home.memberKeys.length > 0 ? home.memberKeys.length : 1,
  }
}

function safeProfile(user) {
  return {
    nickname: typeof user?.nickname === 'string' && user.nickname.trim() ? user.nickname.trim() : '小伙伴',
    avatar: user?.avatar?.kind === 'builtin' ? user.avatar : DEFAULT_PROFILE_AVATAR,
    profilePreset: user?.profilePreset || 'neutral',
  }
}

async function homeResult(home, identityKey, getUser) {
  const members = await Promise.all((home.memberKeys || []).slice(0, 2).map(async (memberKey) => ({
    ...safeProfile(await getUser(memberKey)),
    isSelf: memberKey === identityKey,
  })))
  return {
    status: 'HOME',
    retryable: false,
    created: false,
    household: {
      id: home._id,
      ...safeHousehold(home),
      currentMemberRole: home.ownerKey === identityKey ? 'owner' : 'member',
      members,
    },
    profile: safeProfile(await getUser(identityKey)),
  }
}

function inviteFailure(status) {
  return { status, retryable: false }
}

async function loadInvitation(input, dependencies) {
  const token = input && input.inviteToken
  if (typeof token !== 'string' || !INVITE_TOKEN_PATTERN.test(token)) return { failure: inviteFailure('INVITE_INVALID') }
  const invitation = await dependencies.repository.findInvitationByTokenHash(hashInviteToken(token))
  if (!invitation || invitation.authorized === false) return { failure: inviteFailure('INVITE_INVALID') }
  const expiresAt = new Date(invitation.expiresAt).getTime()
  if (!Number.isFinite(expiresAt)) return { failure: inviteFailure('INVITE_INVALID') }
  if (expiresAt <= dependencies.now().getTime()) return { failure: inviteFailure('INVITE_EXPIRED') }
  if (invitation.usedAt || invitation.revokedAt) return { failure: inviteFailure('INVITE_USED') }
  return { token, invitation }
}

/** 仅单人家庭的创建者可生成邀请；原凭证不保存，返回值只用于当前设备分享。 */
async function createInvitation(_input, dependencies) {
  const { identityKey, repository, now, createToken } = dependencies
  const homes = await repository.findHouseholdsByMemberKey(identityKey)
  if (homes.length !== 1) return inviteFailure('NO_HOME')
  const homeId = homes[0]._id
  const token = createToken ? createToken() : crypto.randomBytes(32).toString('base64url')
  if (!INVITE_TOKEN_PATTERN.test(token)) throw new Error('Invalid invite token generator')
  const createdAt = now()
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000)
  const result = await repository.runTransaction(async (transaction) => {
    const home = await transaction.getHousehold(homeId)
    if (!home || home.ownerKey !== identityKey) return inviteFailure('FORBIDDEN')
    if (!Array.isArray(home.memberKeys) || home.memberKeys.length !== 1) return inviteFailure('HOME_FULL')
    await transaction.setInvitation({
      _id: invitationId(homeId),
      householdId: homeId,
      issuerKey: identityKey,
      tokenHash: hashInviteToken(token),
      createdAt,
      expiresAt,
    })
    return { status: 'INVITE_READY', retryable: false, inviteToken: token, expiresAt: expiresAt.toISOString() }
  })
  return result
}

/** 预览邀请时只返回公开的家庭概况，绝不返回创建者或成员内部标识。 */
async function previewInvitation(input, dependencies) {
  const loaded = await loadInvitation(input, dependencies)
  if (loaded.failure) return loaded.failure
  const home = await dependencies.repository.getHousehold(loaded.invitation.householdId)
  if (!home || !Array.isArray(home.memberKeys)) return inviteFailure('INVITE_INVALID')
  if (home.memberKeys.length >= 2) return inviteFailure('HOME_FULL')
  // 受邀者只需要知道“谁邀请我”，不应得到邀请人的身份编号或任何可用于越权的信息。
  return {
    status: 'INVITE_PREVIEW',
    retryable: false,
    household: safeHousehold(home),
    inviter: safeProfile(await dependencies.repository.getUser(home.ownerKey)),
  }
}

/** 加入与转入都在同一事务内重新核验邀请、双方家庭和成员数，避免并发产生第三位成员。 */
async function joinInvitation(input, dependencies) {
  const { identityKey, repository, now } = dependencies
  const loaded = await loadInvitation(input, dependencies)
  if (loaded.failure) return loaded.failure
  const actorHomes = await repository.findHouseholdsByMemberKey(identityKey)
  if (actorHomes.length > 1) return inviteFailure('MULTIPLE_HOUSEHOLDS')
  const currentHomeId = actorHomes[0]?._id
  const targetHomeId = loaded.invitation.householdId
  if (currentHomeId === targetHomeId) return inviteFailure('ALREADY_IN_HOME')
  if (currentHomeId && actorHomes[0].memberKeys?.length !== 1) return inviteFailure('ALREADY_IN_HOME')
  if (currentHomeId && input?.mode !== 'transfer') return inviteFailure('TRANSFER_CONFIRM')
  if (!currentHomeId && input?.mode !== 'join') return inviteFailure('INVALID_REQUEST')

  return repository.runTransaction(async (transaction) => {
    const invitation = await transaction.getInvitation(invitationId(targetHomeId))
    const target = await transaction.getHousehold(targetHomeId)
    const current = currentHomeId ? await transaction.getHousehold(currentHomeId) : null
    const membershipLock = await transaction.getMembershipLock(membershipLockId(identityKey))
    if (!invitation || invitation.tokenHash !== hashInviteToken(loaded.token) || invitation.usedAt || invitation.revokedAt) return inviteFailure('INVITE_USED')
    if (new Date(invitation.expiresAt).getTime() <= now().getTime()) return inviteFailure('INVITE_EXPIRED')
    if (!target || target.ownerKey === identityKey || !Array.isArray(target.memberKeys)) return inviteFailure('INVITE_INVALID')
    if (target.memberKeys.includes(identityKey)) return inviteFailure('ALREADY_IN_HOME')
    if (target.memberKeys.length !== 1) return inviteFailure('HOME_FULL')
    if (membershipLock && membershipLock.householdId !== currentHomeId) return inviteFailure('ALREADY_IN_HOME')
    if (currentHomeId && (!current || current.ownerKey !== identityKey || current.memberKeys?.length !== 1 || input.mode !== 'transfer')) return inviteFailure('ALREADY_IN_HOME')

    const updatedTarget = { ...target, memberKeys: [...target.memberKeys, identityKey], updatedAt: now() }
    await transaction.setHousehold(updatedTarget)
    if (current) await transaction.deleteHousehold(current._id)
    await transaction.setMembershipLock({ _id: membershipLockId(identityKey), householdId: targetHomeId, updatedAt: now() })
    await transaction.setInvitation({ ...invitation, usedAt: now(), usedByKey: identityKey })
    return homeResult(updatedTarget, identityKey, transaction.getUser)
  })
}

/** 目标成员由云端从唯一“另一位成员”计算，页面不能指定任意用户作为移除对象。 */
async function removeOtherMember(_input, dependencies) {
  const { identityKey, repository, now } = dependencies
  const homes = await repository.findHouseholdsByMemberKey(identityKey)
  if (homes.length !== 1) return inviteFailure('NO_HOME')
  const homeId = homes[0]._id
  return repository.runTransaction(async (transaction) => {
    const home = await transaction.getHousehold(homeId)
    if (!home || home.ownerKey !== identityKey) return inviteFailure('FORBIDDEN')
    if (!Array.isArray(home.memberKeys) || home.memberKeys.length !== 2) return inviteFailure('NO_OTHER_MEMBER')
    const removedKey = home.memberKeys.find((memberKey) => memberKey !== identityKey)
    if (!removedKey) return inviteFailure('NO_OTHER_MEMBER')
    const updated = { ...home, memberKeys: [identityKey], updatedAt: now() }
    const removedUser = await transaction.getUser(removedKey)
    await transaction.setHousehold(updated)
    await transaction.deleteMembershipLock(membershipLockId(removedKey))
    await transaction.setUser({ ...(removedUser || { _id: removedKey }), _id: removedKey, membershipNotice: 'removed_from_home', updatedAt: now() })
    const invitation = await transaction.getInvitation(invitationId(homeId))
    if (invitation && !invitation.usedAt) await transaction.setInvitation({ ...invitation, revokedAt: now() })
    return homeResult(updated, identityKey, transaction.getUser)
  })
}

module.exports = {
  createInvitation,
  previewInvitation,
  joinInvitation,
  removeOtherMember,
  invitationId,
  membershipLockId,
  hashInviteToken,
}
