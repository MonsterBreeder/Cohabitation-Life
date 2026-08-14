const crypto = require('crypto')
const { validateDisplayText } = require('./display-text')
const { validateAvatarReference } = require('./avatar-media')

const DEFAULT_HOUSEHOLD_NAME = '我们的小家'
const DEFAULT_PROFILE_NAME = '小伙伴'
const HOUSEHOLD_AVATARS = new Set(['household-01', 'household-02', 'household-03'])
const PROFILE_AVATARS = new Set(['person-neutral', 'person-01', 'person-02', 'person-03', 'person-04'])
const PROFILE_PRESETS = new Set(['neutral', 'xiaoshuai', 'xiaomei', 'random', 'custom'])
const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{16,128}$/

class HouseholdDomainError extends Error {
  constructor(code, retryable = false) {
    super(code)
    this.code = code
    this.retryable = retryable
  }
}

function creationLockId(identityKey) {
  return `create_${crypto.createHash('sha256').update(identityKey).digest('hex')}`
}

function operationId(operationToken) {
  return `operation_${crypto.createHash('sha256').update(operationToken).digest('hex')}`
}

async function validateRequest(input, dependencies) {
  const name = validateDisplayText(input && input.name, 20)
  const avatar = input && input.avatar
  if (!name || !CREDENTIAL_PATTERN.test(input.requestId || '') || !CREDENTIAL_PATTERN.test(input.operationToken || '')) {
    throw new HouseholdDomainError('INVALID_REQUEST')
  }
  const validAvatar = avatar?.kind === 'builtin' && HOUSEHOLD_AVATARS.has(avatar.id)
    ? { kind: 'builtin', id: avatar.id }
    : dependencies.repository.avatarMedia
      ? await validateAvatarReference(avatar, 'household', dependencies.identityKey, dependencies.repository.avatarMedia)
      : null
  if (!validAvatar) throw new HouseholdDomainError('INVALID_REQUEST')
  return { name, avatar: validAvatar }
}

/** 只返回页面需要的资料，绝不返回成员身份键、拥有者身份键或创建锁。 */
function safeAvatar(record, builtinSet, fallback) {
  if (record && record.avatar && record.avatar.kind === 'custom' && typeof record.avatar.resourceId === 'string' && typeof record.avatar.digest === 'string') return { ...record.avatar }
  return record && record.avatar && record.avatar.kind === 'builtin' && builtinSet.has(record.avatar.id) ? { kind: 'builtin', id: record.avatar.id } : fallback
}

function normaliseProfile(record) {
  const nickname = validateDisplayText(record && record.nickname, 12) || DEFAULT_PROFILE_NAME
  const avatar = safeAvatar(record, PROFILE_AVATARS, { kind: 'builtin', id: 'person-neutral' })
  const profilePreset = record && PROFILE_PRESETS.has(record.profilePreset) ? record.profilePreset : 'neutral'
  return { nickname, avatar, profilePreset }
}

function toResult(record, identityKey, created, profileRecord) {
  return {
    status: 'HOME',
    retryable: false,
    created,
    household: {
      id: record._id,
      name: validateDisplayText(record.name, 20) || DEFAULT_HOUSEHOLD_NAME,
      avatar: safeAvatar(record, HOUSEHOLD_AVATARS, { kind: 'builtin', id: 'household-01' }),
      memberCount: Array.isArray(record.memberKeys) && record.memberKeys.length > 0 ? record.memberKeys.length : 1,
      currentMemberRole: record.ownerKey === identityKey ? 'owner' : 'member',
    },
    profile: normaliseProfile(profileRecord),
  }
}

async function createHousehold(input, dependencies) {
  const { identityKey, repository, now, createHouseholdId } = dependencies
  if (!identityKey || !repository) throw new HouseholdDomainError('INVALID_REQUEST')
  const valid = await validateRequest(input, dependencies)

  // 先兼容上线前已存在的任意编号家庭；多归属必须人工处理，不能自行挑选。
  const existing = await repository.findHouseholdsByMemberKey(identityKey)
  if (existing.length > 1) throw new HouseholdDomainError('MULTIPLE_HOUSEHOLDS')
  if (existing.length === 1) return toResult(existing[0], identityKey, false)

  return repository.runTransaction(async (transaction) => {
    const lockId = creationLockId(identityKey)
    const lock = await transaction.getCreationLock(lockId)
    if (lock) {
      const household = await transaction.getHousehold(lock.householdId)
      if (!household) throw new HouseholdDomainError('TEMPORARY_FAILURE', true)
      return toResult(household, identityKey, false)
    }

    const householdId = createHouseholdId()
    const createdAt = now()
    const household = {
      _id: householdId,
      name: valid.name,
      avatar: valid.avatar,
      ownerKey: identityKey,
      memberKeys: [identityKey],
      createdAt,
      updatedAt: createdAt,
    }
    await transaction.createHousehold(household)
    await transaction.createCreationLock({
      _id: lockId,
      householdId,
      requestIdHash: crypto.createHash('sha256').update(input.requestId).digest('hex'),
      operationTokenHash: crypto.createHash('sha256').update(`${identityKey}:${input.operationToken}`).digest('hex'),
      createdAt,
    })
    await transaction.createOperation({
      _id: operationId(input.operationToken),
      identityKey,
      requestIdHash: crypto.createHash('sha256').update(input.requestId).digest('hex'),
      householdId,
      createdAt,
    })
    return toResult(household, identityKey, true)
  })
}

async function confirmHousehold(input, dependencies) {
  const { identityKey, repository } = dependencies
  if (!identityKey || !repository || !CREDENTIAL_PATTERN.test(input.requestId || '') || !CREDENTIAL_PATTERN.test(input.operationToken || '')) {
    throw new HouseholdDomainError('INVALID_REQUEST')
  }
  const existing = await repository.findHouseholdsByMemberKey(identityKey)
  if (existing.length > 1) throw new HouseholdDomainError('MULTIPLE_HOUSEHOLDS')
  if (existing.length === 1) return toResult(existing[0], identityKey, false)

  const operation = await repository.getOperation(operationId(input.operationToken))
  if (!operation) return { status: 'NO_HOME', retryable: false }
  if (operation.identityKey !== identityKey) return { status: 'OPERATION_MISMATCH', retryable: false }
  const requestIdHash = crypto.createHash('sha256').update(input.requestId).digest('hex')
  if (operation.requestIdHash !== requestIdHash) return { status: 'OPERATION_MISMATCH', retryable: false }
  const household = await repository.getHousehold(operation.householdId)
  if (!household) throw new HouseholdDomainError('TEMPORARY_FAILURE', true)
  return toResult(household, identityKey, false)
}

/** 根据云端可信身份查询当前家庭，供首页重开时恢复真实资料。 */
async function getCurrentHousehold(dependencies) {
  const { identityKey, repository } = dependencies
  if (!identityKey || !repository) throw new HouseholdDomainError('INVALID_REQUEST')
  const existing = await repository.findHouseholdsByMemberKey(identityKey)
  if (existing.length > 1) throw new HouseholdDomainError('MULTIPLE_HOUSEHOLDS')
  if (existing.length === 0) return { status: 'NO_HOME', retryable: false }
  const profile = repository.getUser ? await repository.getUser(identityKey) : null
  return toResult(existing[0], identityKey, false, profile)
}

async function updateHousehold(input, dependencies) {
  const { identityKey, repository, now } = dependencies
  if (!identityKey || !repository) throw new HouseholdDomainError('INVALID_REQUEST')
  const name = validateDisplayText(input && input.name, 20)
  const avatar = input && input.avatar
  if (!name || !avatar) throw new HouseholdDomainError('INVALID_REQUEST')
  if (name !== DEFAULT_HOUSEHOLD_NAME && (!dependencies.checkText || !await dependencies.checkText(name))) throw new HouseholdDomainError('CONTENT_REJECTED')
  const validAvatar = avatar.kind === 'builtin' && HOUSEHOLD_AVATARS.has(avatar.id)
    ? { kind: 'builtin', id: avatar.id }
    : repository.avatarMedia ? await validateAvatarReference(avatar, 'household', identityKey, repository.avatarMedia) : null
  if (!validAvatar) throw new HouseholdDomainError('INVALID_REQUEST')
  const existing = await repository.findHouseholdsByMemberKey(identityKey)
  if (existing.length > 1) throw new HouseholdDomainError('MULTIPLE_HOUSEHOLDS')
  if (existing.length === 0) throw new HouseholdDomainError('NO_HOME')
  const oldAvatar = existing[0].avatar
  const updated = { ...existing[0], name, avatar: validAvatar, updatedAt: now() }
  const updateData = { name: updated.name, avatar: updated.avatar, updatedAt: updated.updatedAt }
  if (repository.swapHouseholdAvatar) await repository.swapHouseholdAvatar({ householdId: updated._id, identityKey, data: updateData, now: updated.updatedAt })
  else await repository.updateHousehold(updated._id, updateData)
  const profile = repository.getUser ? await repository.getUser(identityKey) : null
  return toResult(updated, identityKey, false, profile)
}

async function updateProfile(input, dependencies) {
  const { identityKey, repository, now } = dependencies
  if (!identityKey || !repository) throw new HouseholdDomainError('INVALID_REQUEST')
  const nickname = validateDisplayText(input && input.nickname, 12)
  const avatar = input && input.avatar
  if (!nickname || !avatar || !PROFILE_PRESETS.has(input.profilePreset)) {
    throw new HouseholdDomainError('INVALID_REQUEST')
  }
  if (![DEFAULT_PROFILE_NAME, '小帅', '小美'].includes(nickname) && (!dependencies.checkText || !await dependencies.checkText(nickname))) throw new HouseholdDomainError('CONTENT_REJECTED')
  const existing = await repository.findHouseholdsByMemberKey(identityKey)
  if (existing.length > 1) throw new HouseholdDomainError('MULTIPLE_HOUSEHOLDS')
  if (existing.length === 0) throw new HouseholdDomainError('NO_HOME')
  const validAvatar = avatar.kind === 'builtin' && PROFILE_AVATARS.has(avatar.id)
    ? { kind: 'builtin', id: avatar.id }
    : repository.avatarMedia ? await validateAvatarReference(avatar, 'profile', identityKey, repository.avatarMedia) : null
  if (!validAvatar) throw new HouseholdDomainError('INVALID_REQUEST')
  const previous = repository.getUser ? await repository.getUser(identityKey) : null
  const profile = { nickname, avatar: validAvatar, profilePreset: input.profilePreset, updatedAt: now() }
  if (repository.swapProfileAvatar) await repository.swapProfileAvatar({ householdId: existing[0]._id, identityKey, data: profile, now: profile.updatedAt })
  else await repository.updateUser(identityKey, profile)
  return toResult(existing[0], identityKey, false, profile)
}

module.exports = {
  createHousehold,
  confirmHousehold,
  getCurrentHousehold,
  updateHousehold,
  updateProfile,
  normaliseProfile,
  creationLockId,
  HouseholdDomainError,
  DEFAULT_HOUSEHOLD_NAME,
  DEFAULT_PROFILE_NAME,
}
