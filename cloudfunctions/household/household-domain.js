const crypto = require('crypto')
const { validateDisplayText } = require('./display-text')
const { validateAvatarReference } = require('./avatar-media')
// PRD 008：创建家庭时一次性初始化 8 个固定类目。
// 这里在 household 内部直接实现 initCategories（不再 require('../ledger/ledger-domain')），
// 因为 household 云函数部署时只打包自身目录，跨目录引用在云开发运行时会 443 失败。
// 类目数组与 ledger/preset-categories.js 保持一致；初始化逻辑与 ledger/ledger-domain.js initCategories 等价。
// 幂等：已存在则跳过；失败不影响家庭创建成功。
const PRESET_CATEGORIES = Object.freeze([
  Object.freeze({ key: 'dining',     name: '餐饮', iconKey: 'fork-spoon',    colorKey: 'amber',  sortOrder: 0 }),
  Object.freeze({ key: 'transport',  name: '交通', iconKey: 'car',           colorKey: 'blue',   sortOrder: 1 }),
  Object.freeze({ key: 'home',       name: '居家', iconKey: 'house',         colorKey: 'mint',   sortOrder: 2 }),
  Object.freeze({ key: 'entertain',  name: '娱乐', iconKey: 'gamepad',       colorKey: 'coral',  sortOrder: 3 }),
  Object.freeze({ key: 'medical',    name: '医疗', iconKey: 'first-aid',     colorKey: 'red',    sortOrder: 4 }),
  Object.freeze({ key: 'clothing',   name: '服饰', iconKey: 'shopping-bag',  colorKey: 'purple', sortOrder: 5 }),
  Object.freeze({ key: 'education',  name: '教育', iconKey: 'book',           colorKey: 'teal',   sortOrder: 6 }),
  Object.freeze({ key: 'other',      name: '其他', iconKey: 'tag',            colorKey: 'gray',   sortOrder: 7 }),
])

function categoryId() {
  return `cat_${crypto.randomBytes(12).toString('hex')}`
}

/** 给一个新创建的家庭写入 8 个固定类目。幂等：已存在则跳过。 */
async function initHouseholdCategories(householdId, dependencies) {
  if (!householdId || typeof householdId !== 'string') return
  const repo = dependencies.repository
  const existing = await repo.findCategoriesByHousehold(householdId)
  if (existing && existing.length > 0) return
  const now = dependencies.now().toISOString()
  for (const preset of PRESET_CATEGORIES) {
    await repo.addCategory({
      _id: categoryId(),
      householdId,
      key: preset.key,
      name: preset.name,
      iconKey: preset.iconKey,
      colorKey: preset.colorKey,
      isCustom: false,
      sortOrder: preset.sortOrder,
      isHiddenBy: [],
      createdAt: now,
    })
  }
}

const DEFAULT_HOUSEHOLD_NAME = '我们的小家'
const DEFAULT_PROFILE_NAME = '小伙伴'
const HOUSEHOLD_AVATARS = new Set(['household-01', 'household-02', 'household-03'])
const PROFILE_AVATARS = new Set(['person-neutral', 'person-01', 'person-02', 'person-03', 'person-04'])
const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{16,128}$/
const PROFILE_NAME_MAX_LENGTH = 10

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
  const savedNickname = record && typeof record.nickname === 'string' ? record.nickname.trim() : ''
  const nickname = savedNickname && !/\r|\n/u.test(savedNickname) ? savedNickname : DEFAULT_PROFILE_NAME
  const avatar = safeAvatar(record, PROFILE_AVATARS, { kind: 'builtin', id: 'person-neutral' })
  return { nickname, avatar }
}

/** 将家庭成员资料收敛为页面仅需的昵称、头像与“我”标记，内部身份编号永不离开云端。 */
function memberDisplays(record, identityKey, profileRecord, profilesByKey = {}) {
  const memberKeys = Array.isArray(record.memberKeys) && record.memberKeys.length > 0 ? record.memberKeys.slice(0, 2) : [identityKey]
  return memberKeys.map((memberKey) => ({
    ...normaliseProfile(memberKey === identityKey ? profileRecord : profilesByKey[memberKey]),
    isSelf: memberKey === identityKey,
  }))
}

function toResult(record, identityKey, created, profileRecord, profilesByKey) {
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
      members: memberDisplays(record, identityKey, profileRecord, profilesByKey),
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
  }).then(async (result) => {
    // PRD 008：创建家庭后初始化 8 个固定类目。放在事务外（addCategory 是独立 add 操作），
    // 即使类目初始化失败也不影响家庭创建成功（用户进 ledger 模块时由 ledger 端 initCategories 兜底）。
    try {
      const newHouseholdId = result && result.household && result.household.id
      if (newHouseholdId) await initHouseholdCategories(newHouseholdId, dependencies)
    } catch (error) {
      console.error('initHouseholdCategories after createHousehold failed', error && error.message)
    }
    return result
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
  const memberKeys = Array.isArray(existing[0].memberKeys) ? existing[0].memberKeys.slice(0, 2) : []
  const profiles = repository.getUser
    ? await Promise.all(memberKeys.filter((memberKey) => memberKey !== identityKey).map(async (memberKey) => [memberKey, await repository.getUser(memberKey)]))
    : []
  return toResult(existing[0], identityKey, false, profile, Object.fromEntries(profiles))
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
  const nickname = typeof (input && input.nickname) === 'string' ? input.nickname.trim() : ''
  const avatar = input && input.avatar
  if (!nickname || /\r|\n/u.test(nickname) || !avatar) {
    throw new HouseholdDomainError('INVALID_REQUEST')
  }
  const existing = await repository.findHouseholdsByMemberKey(identityKey)
  if (existing.length > 1) throw new HouseholdDomainError('MULTIPLE_HOUSEHOLDS')
  if (existing.length === 0) throw new HouseholdDomainError('NO_HOME')
  const previous = repository.getUser ? await repository.getUser(identityKey) : null
  const previousNickname = normaliseProfile(previous).nickname
  const isRenaming = nickname !== previousNickname
  if (isRenaming && !validateDisplayText(nickname, PROFILE_NAME_MAX_LENGTH)) throw new HouseholdDomainError('INVALID_REQUEST')
  if (isRenaming && ![DEFAULT_PROFILE_NAME, '小帅', '小美'].includes(nickname) && (!dependencies.checkText || !await dependencies.checkText(nickname))) throw new HouseholdDomainError('CONTENT_REJECTED')
  const validAvatar = avatar.kind === 'builtin' && PROFILE_AVATARS.has(avatar.id)
    ? { kind: 'builtin', id: avatar.id }
    : repository.avatarMedia ? await validateAvatarReference(avatar, 'profile', identityKey, repository.avatarMedia) : null
  if (!validAvatar) throw new HouseholdDomainError('INVALID_REQUEST')
  const profile = { nickname, avatar: validAvatar, updatedAt: now() }
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
  memberDisplays,
  creationLockId,
  HouseholdDomainError,
  DEFAULT_HOUSEHOLD_NAME,
  DEFAULT_PROFILE_NAME,
}
