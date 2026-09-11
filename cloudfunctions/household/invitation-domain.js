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
  }
}

/**
 * 邀请预览阶段专用的邀请人资料：
 * - 内置头像直接返回受控编号
 * - 自定义头像由云端在有效邀请凭证授权后换取短时展示 URL
 * - 短时 URL 生成失败时退化为默认头像，但邀请仍可继续
 * 整个流程不返回资源编号、存储路径或可长期复用的地址，避免扩大未登录访问范围。
 */
async function safePreviewInviter(user, dependencies) {
  const nickname = typeof user?.nickname === 'string' && user.nickname.trim() ? user.nickname.trim() : '小伙伴'
  if (user?.avatar?.kind === 'builtin') {
    return { nickname, avatar: user.avatar }
  }
  if (
    user?.avatar?.kind === 'custom'
    && typeof user.avatar.resourceId === 'string'
    && user.avatar.resourceId.length > 0
    && dependencies
    && typeof dependencies.tempUrl === 'function'
  ) {
    try {
      const result = await dependencies.tempUrl([user.avatar.resourceId])
      const fileList = Array.isArray(result && result.fileList) ? result.fileList : []
      const entry = fileList[0]
      const url = entry && entry.tempFileURL
      if (entry && entry.status === 0 && typeof url === 'string' && url.startsWith('https://') && !url.includes('cloud://') && !url.includes('tcb-qcloud.com')) {
        return { nickname, avatar: { kind: 'temp', url } }
      }
    } catch (error) {
      // 临时 URL 失败时按默认头像处理；邀请本身仍可继续，不应把整份邀请标记成无效。
      if (dependencies && typeof dependencies.logTempUrlFailure === 'function') {
        dependencies.logTempUrlFailure(user.avatar.resourceId, error)
      }
    }
  }
  return { nickname, avatar: DEFAULT_PROFILE_AVATAR }
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
  // 受邀者只需要知道"谁邀请我"，且头像只能是受控编号或短时 URL；自定义头像不暴露资源编号。
  return {
    status: 'INVITE_PREVIEW',
    retryable: false,
    household: safeHousehold(home),
    inviter: await safePreviewInviter(await dependencies.repository.getUser(home.ownerKey), dependencies),
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

    const joinedAt = now()
    const updatedTarget = { ...target, memberKeys: [...target.memberKeys, identityKey], updatedAt: joinedAt }
    await transaction.setHousehold(updatedTarget)
    if (current) await transaction.deleteHousehold(current._id)
    // 加入时间供足迹模块判断“加入前历史”提示；使用云端时间，不能信任页面传值。
    await transaction.setMembershipLock({ _id: membershipLockId(identityKey), householdId: targetHomeId, joinedAt, updatedAt: joinedAt })
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
