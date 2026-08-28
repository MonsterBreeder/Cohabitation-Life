// 家庭共同流水账领域规则（PRD 008）。
// 模式与 task-domain 一致：纯函数 + 依赖注入 + 自定义错误类型。
// 关键规则：
//   - 单一共同模式（没有"共同/各自"开关）
//   - 双方都能记 / 改 / 删自己记的账；编辑/删除绑定 payerMemberKey
//   - 任何成员都能软删 / 恢复（与 PRD 007 一致）
//   - 类目家庭级共享，8 个固定 + 用户可自定义
//   - 金额整数分（amountCents），前端按"元"输入

const crypto = require('crypto')
const { PRESET_CATEGORIES, PRESET_KEYS, ALLOWED_ICON_KEYS, ALLOWED_COLOR_KEYS } = require('./preset-categories')
const { filterActive, normaliseEntry, normaliseEntryDetail, normaliseCategory, withoutDocumentId } = require('./repository-data')

const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{16,128}$/
const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
const ENTRY_TYPE_SET = new Set(['expense', 'income'])
const NOTE_MAX_LENGTH = 100
const CATEGORY_NAME_MIN = 2
const CATEGORY_NAME_MAX = 8
const AMOUNT_MIN_CENTS = 1
// 与客户端一致支持七位数金额，避免前端可录入但云端拒绝。
const AMOUNT_MAX_CENTS = 999_999_999
const OCCURRED_AT_MIN = '2020-01-01'

class LedgerDomainError extends Error {
  constructor(code, retryable = false) {
    super(code)
    this.code = code
    this.retryable = retryable
  }
}

function entryId() {
  return `ledger_${crypto.randomBytes(16).toString('hex')}`
}

function categoryId() {
  return `cat_${crypto.randomBytes(12).toString('hex')}`
}

function creationLockId(householdId, requestId) {
  return `lcrequest_${crypto.createHash('sha256').update(`${householdId}:${requestId}`).digest('hex')}`
}

function operationId(entityId, operationToken) {
  return `lop_${entityId}_${crypto.createHash('sha256').update(`${entityId}:${operationToken}`).digest('hex').slice(0, 32)}`
}

function validateCredential(value, name) {
  if (typeof value !== 'string' || !CREDENTIAL_PATTERN.test(value)) {
    throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
  }
}

function validateId(value, name) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
  }
}

function validateNote(input) {
  if (typeof input !== 'string') throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
  if (input.length > NOTE_MAX_LENGTH) throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
  return input.trim()
}

function validateAmount(amountCents) {
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) {
    throw new LedgerDomainError('LEDGER_AMOUNT_INVALID', false)
  }
  if (amountCents < AMOUNT_MIN_CENTS || amountCents > AMOUNT_MAX_CENTS) {
    throw new LedgerDomainError('LEDGER_AMOUNT_INVALID', false)
  }
  return amountCents
}

function validateOccurredAt(occurredAt) {
  if (typeof occurredAt !== 'string') throw new LedgerDomainError('LEDGER_TIME_INVALID', false)
  const date = new Date(occurredAt)
  if (Number.isNaN(date.getTime())) throw new LedgerDomainError('LEDGER_TIME_INVALID', false)
  const minDate = new Date(`${OCCURRED_AT_MIN}T00:00:00.000Z`)
  if (date.getTime() < minDate.getTime()) throw new LedgerDomainError('LEDGER_TIME_INVALID', false)
  const maxFutureMs = Date.now() + 24 * 60 * 60 * 1000
  if (date.getTime() > maxFutureMs) throw new LedgerDomainError('LEDGER_TIME_INVALID', false)
  return date.toISOString()
}

function validateCategoryName(name) {
  if (typeof name !== 'string') throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
  const trimmed = name.trim()
  if (trimmed.length < CATEGORY_NAME_MIN || trimmed.length > CATEGORY_NAME_MAX) {
    throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
  }
  return trimmed
}

function validateIconKey(iconKey) {
  if (typeof iconKey !== 'string' || !ALLOWED_ICON_KEYS.has(iconKey)) {
    throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
  }
  return iconKey
}

function validateColorKey(colorKey) {
  if (typeof colorKey !== 'string' || !ALLOWED_COLOR_KEYS.has(colorKey)) {
    throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
  }
  return colorKey
}

function validatePayerMemberKey(payerMemberKey) {
  if (typeof payerMemberKey !== 'string' || payerMemberKey.length === 0) {
    throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
  }
  return payerMemberKey
}

function buildPayerDisplay(memberKey, profile, hasLeft) {
  const nickname = profile && typeof profile.nickname === 'string' && profile.nickname.trim()
    ? profile.nickname.trim()
    : '（已离开）'
  const avatar = profile && profile.avatar && profile.avatar.kind === 'builtin'
    ? { kind: 'builtin', id: profile.avatar.id }
    : { kind: 'builtin', id: 'person-neutral' }
  return { memberKey, nickname, avatar, hasLeft: hasLeft === true }
}

/** 只有云端完成家庭成员校验后，才为凭证签发短期访问地址。 */
async function attachReceiptUrls(entries, dependencies) {
  const list = Array.isArray(entries) ? entries : []
  const fileIds = [...new Set(list.map((entry) => entry && entry.receiptMediaId).filter(Boolean))]
  if (fileIds.length === 0 || typeof dependencies.getTempFileUrls !== 'function') return list
  try {
    const urls = await dependencies.getTempFileUrls(fileIds)
    return list.map((entry) => ({
      ...entry,
      receiptUrl: entry.receiptMediaId && urls && typeof urls[entry.receiptMediaId] === 'string'
        ? urls[entry.receiptMediaId]
        : undefined,
    }))
  } catch {
    // 图片地址获取失败不应阻断账本正文，客户端仍可显示可重试占位。
    return list
  }
}

/** 初始化 8 个固定类目。幂等：已存在则跳过。 */
async function initCategories(input, dependencies) {
  validateCredential(input && input.requestId, 'requestId')
  const householdId = (input && input.householdId) || (dependencies.householdId)
  validateId(householdId, 'householdId')

  const repo = dependencies.repository
  const existing = await repo.findCategoriesByHousehold(householdId)
  if (existing && existing.length > 0) {
    return {
      status: 'INITED',
      retryable: false,
      categories: existing.map(normaliseCategory),
    }
  }

  const created = []
  for (const preset of PRESET_CATEGORIES) {
    const record = {
      _id: categoryId(),
      householdId,
      key: preset.key,
      name: preset.name,
      iconKey: preset.iconKey,
      colorKey: preset.colorKey,
      isCustom: false,
      sortOrder: preset.sortOrder,
      isHiddenBy: [],
      createdAt: dependencies.now().toISOString(),
    }
    await repo.addCategory(withoutDocumentId(record))
    created.push(record)
  }

  return {
    status: 'INITED',
    retryable: false,
    categories: created.map(normaliseCategory),
  }
}

/** 创建账目。
 * 幂等锁：使用 `requestId`（`creationLockId`），不需要 `operationToken`。
 * 这是创建类 action 的统一模式（与 `initCategories` / `addCategory` 一致）；
 * `operationToken` 只用于"对已有实体的操作"（update / delete / restore）。 */
async function addEntry(input, dependencies) {
  validateCredential(input && input.requestId, 'requestId')
  if (!ENTRY_TYPE_SET.has(input.type)) throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
  const amountCents = validateAmount(input.amountCents)
  const note = validateNote(input.note || '')
  const occurredAt = validateOccurredAt(input.occurredAt)
  let receiptMediaId = null
  if (input.receiptMediaId != null) {
    if (typeof input.receiptMediaId !== 'string') throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
    receiptMediaId = input.receiptMediaId
  }
  validateId(input.categoryId, 'categoryId')
  let payerMemberKey = validatePayerMemberKey(input.payerMemberKey)

  const repo = dependencies.repository
  const isMember = await repo.isMemberOfHousehold(dependencies.identityKey, dependencies.householdId)
  if (!isMember) throw new LedgerDomainError('LEDGER_FORBIDDEN', false)
  const category = await repo.findCategoryById(input.categoryId)
  if (!category) throw new LedgerDomainError('LEDGER_CATEGORY_NOT_FOUND', false)
  if (category.householdId !== dependencies.householdId) throw new LedgerDomainError('LEDGER_CATEGORY_NOT_FOUND', false)
  const household = await repo.getHousehold(dependencies.householdId)
  if (!household) throw new LedgerDomainError('LEDGER_FORBIDDEN', false)
  // 前端 chip 用 'self' / 'other' 字面量标识付款人；这里映射到真实 memberKey。
  // 'self' → 当前 identityKey；'other' → household 里除自己外的另一位成员。
  // 这样前端不需要持有真实的 memberKey（memberKey 只在云端流转）。
  if (payerMemberKey === 'self') {
    payerMemberKey = dependencies.identityKey
  } else if (payerMemberKey === 'other') {
    const others = Array.isArray(household.memberKeys)
      ? household.memberKeys.filter((k) => k !== dependencies.identityKey)
      : []
    if (others.length === 0) {
      throw new LedgerDomainError('LEDGER_PAYER_NOT_MEMBER', false)
    }
    payerMemberKey = others[0]
  }
  if (!Array.isArray(household.memberKeys) || !household.memberKeys.includes(payerMemberKey)) {
    throw new LedgerDomainError('LEDGER_PAYER_NOT_MEMBER', false)
  }
  const lockId = creationLockId(dependencies.householdId, input.requestId)
  const existingOp = await repo.getOperation(lockId)
  if (existingOp && existingOp.entryId) {
    const existingEntry = await repo.getEntry(existingOp.entryId)
    if (existingEntry) {
      return { status: 'ADDED', retryable: false, entry: normaliseEntry(existingEntry) }
    }
  }
  const now = dependencies.now().toISOString()
  const payerProfile = await repo.getProfileForMember(payerMemberKey)
  const hasLeft = !Array.isArray(household.memberKeys) || !household.memberKeys.includes(payerMemberKey)
  const record = {
    _id: entryId(),
    householdId: dependencies.householdId,
    type: input.type,
    amountCents,
    categoryId: input.categoryId,
    note,
    occurredAt,
    receiptMediaId,
    payerMemberKey,
    payer: buildPayerDisplay(payerMemberKey, payerProfile, hasLeft),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    deletedBy: null,
  }
  await repo.runTransaction(async (tx) => {
    await tx.addEntry(withoutDocumentId(record))
    await tx.addOperation({
      _id: lockId,
      kind: 'add',
      entryId: record._id,
      at: now,
    })
  })
  return { status: 'ADDED', retryable: false, entry: normaliseEntry(record) }
}

/** 编辑账目。仅创建者可改；type 不可改。
 *  payerMemberKey 可选：
 *  - 不传 / null / ''  → 保持原 payer 不变
 *  - 'self' / 'other' / 真实 memberKey → 校验后覆盖；
 *    'self' 映射为 identityKey；'other' 取 household.memberKeys 中除自己的另一位；
 *    其他值必须在 household.memberKeys 里
 */
async function updateEntry(input, dependencies) {
  validateId(input && input.entryId, 'entryId')
  validateCredential(input && input.operationToken, 'operationToken')
  const amountCents = validateAmount(input.amountCents)
  const note = validateNote(input.note || '')
  const occurredAt = validateOccurredAt(input.occurredAt)
  let receiptMediaId = null
  if (input.receiptMediaId != null) {
    if (typeof input.receiptMediaId !== 'string') throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
    receiptMediaId = input.receiptMediaId
  }
  validateId(input.categoryId, 'categoryId')

  const repo = dependencies.repository
  const isMember = await repo.isMemberOfHousehold(dependencies.identityKey, dependencies.householdId)
  if (!isMember) throw new LedgerDomainError('LEDGER_FORBIDDEN', false)

  const opId = operationId(input.entryId, input.operationToken)
  const existingOp = await repo.getOperation(opId)
  if (existingOp && existingOp.entryId) {
    const existingEntry = await repo.getEntry(existingOp.entryId)
    if (existingEntry) {
      return { status: 'UPDATED', retryable: false, entry: normaliseEntry(existingEntry) }
    }
  }

  const existing = await repo.getEntry(input.entryId)
  if (!existing || existing.deletedAt != null) throw new LedgerDomainError('LEDGER_NOT_FOUND', false)
  if (existing.householdId !== dependencies.householdId) throw new LedgerDomainError('LEDGER_NOT_FOUND', false)
  if (existing.payerMemberKey !== dependencies.identityKey) {
    throw new LedgerDomainError('LEDGER_FORBIDDEN', false)
  }
  const category = await repo.findCategoryById(input.categoryId)
  if (!category) throw new LedgerDomainError('LEDGER_CATEGORY_NOT_FOUND', false)
  if (category.householdId !== dependencies.householdId) throw new LedgerDomainError('LEDGER_CATEGORY_NOT_FOUND', false)

  // 解析 payerMemberKey（可选）。保持 addEntry 的 'self'/'other' 字面量映射，
  // 这样编辑表单不需要持有真实 memberKey 也能表达"切给对方"。
  let resolvedPayerMemberKey = existing.payerMemberKey
  let payerChanged = false
  if (input.payerMemberKey != null && input.payerMemberKey !== '') {
    if (typeof input.payerMemberKey !== 'string') {
      throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
    }
    const household = await repo.getHousehold(dependencies.householdId)
    if (!household) throw new LedgerDomainError('LEDGER_FORBIDDEN', false)
    let candidate = input.payerMemberKey
    if (candidate === 'self') {
      candidate = dependencies.identityKey
    } else if (candidate === 'other') {
      const others = Array.isArray(household.memberKeys)
        ? household.memberKeys.filter((k) => k !== dependencies.identityKey)
        : []
      if (others.length === 0) {
        throw new LedgerDomainError('LEDGER_PAYER_NOT_MEMBER', false)
      }
      candidate = others[0]
    }
    if (!Array.isArray(household.memberKeys) || !household.memberKeys.includes(candidate)) {
      throw new LedgerDomainError('LEDGER_PAYER_NOT_MEMBER', false)
    }
    if (candidate !== existing.payerMemberKey) {
      resolvedPayerMemberKey = candidate
      payerChanged = true
    }
  }

  const now = dependencies.now().toISOString()
  const updates = {
    amountCents,
    categoryId: input.categoryId,
    note,
    occurredAt,
    receiptMediaId,
    updatedAt: now,
  }
  // payer 改了：重新拉取 profile、构建 payer 展示；同步把 payerMemberKey 也写进去。
  let newPayer = existing.payer
  if (payerChanged) {
    const household = await repo.getHousehold(dependencies.householdId)
    const payerProfile = await repo.getProfileForMember(resolvedPayerMemberKey)
    const stillInHousehold = Array.isArray(household.memberKeys)
      && household.memberKeys.includes(resolvedPayerMemberKey)
    newPayer = buildPayerDisplay(resolvedPayerMemberKey, payerProfile, !stillInHousehold)
    updates.payerMemberKey = resolvedPayerMemberKey
    updates.payer = newPayer
  }
  await repo.runTransaction(async (tx) => {
    await tx.updateEntry(input.entryId, updates)
    await tx.addOperation({
      _id: opId,
      kind: 'update',
      entryId: input.entryId,
      at: now,
    })
  })
  return { status: 'UPDATED', retryable: false, entry: normaliseEntry({ ...existing, ...updates }) }
}

/** 软删除账目。PRD 008：只创建者可软删（与 updateEntry 权限一致）。
 * 撤销删除（restoreEntry）任何成员都可做——防止误删后只有创建者能恢复。 */
async function deleteEntry(input, dependencies) {
  validateId(input && input.entryId, 'entryId')
  validateCredential(input && input.operationToken, 'operationToken')
  const repo = dependencies.repository
  const isMember = await repo.isMemberOfHousehold(dependencies.identityKey, dependencies.householdId)
  if (!isMember) throw new LedgerDomainError('LEDGER_FORBIDDEN', false)

  const opId = operationId(input.entryId, input.operationToken)
  const existingOp = await repo.getOperation(opId)
  if (existingOp && existingOp.deletedAt) {
    return { status: 'DELETED', retryable: false, entryId: input.entryId, deletedAt: existingOp.deletedAt }
  }

  const existing = await repo.getEntry(input.entryId)
  if (!existing || existing.deletedAt != null) throw new LedgerDomainError('LEDGER_NOT_FOUND', false)
  if (existing.householdId !== dependencies.householdId) throw new LedgerDomainError('LEDGER_NOT_FOUND', false)
  if (existing.payerMemberKey !== dependencies.identityKey) {
    throw new LedgerDomainError('LEDGER_FORBIDDEN', false)
  }

  const now = dependencies.now().toISOString()
  await repo.runTransaction(async (tx) => {
    await tx.updateEntry(input.entryId, { deletedAt: now, deletedBy: dependencies.identityKey })
    await tx.addOperation({
      _id: opId,
      kind: 'delete',
      entryId: input.entryId,
      deletedAt: now,
      at: now,
    })
  })
  return { status: 'DELETED', retryable: false, entryId: input.entryId, deletedAt: now }
}

/** 恢复软删的账目。任何成员都能恢复。 */
async function restoreEntry(input, dependencies) {
  validateId(input && input.entryId, 'entryId')
  validateCredential(input && input.operationToken, 'operationToken')
  const repo = dependencies.repository
  const isMember = await repo.isMemberOfHousehold(dependencies.identityKey, dependencies.householdId)
  if (!isMember) throw new LedgerDomainError('LEDGER_FORBIDDEN', false)

  const existing = await repo.getEntry(input.entryId)
  if (!existing) throw new LedgerDomainError('LEDGER_NOT_FOUND', false)
  if (existing.householdId !== dependencies.householdId) throw new LedgerDomainError('LEDGER_NOT_FOUND', false)
  if (existing.deletedAt == null) {
    return { status: 'RESTORED', retryable: false, entry: normaliseEntry(existing) }
  }
  const now = dependencies.now().toISOString()
  const updates = { deletedAt: null, deletedBy: null, updatedAt: now }
  await repo.runTransaction(async (tx) => {
    await tx.updateEntry(input.entryId, updates)
    await tx.addOperation({
      _id: operationId(input.entryId, input.operationToken),
      kind: 'restore',
      entryId: input.entryId,
      at: now,
    })
  })
  return { status: 'RESTORED', retryable: false, entry: normaliseEntry({ ...existing, ...updates }) }
}

async function listEntries(input, dependencies) {
  const month = (input && input.month) || 'all'
  const payerMode = (input && input.payerMode) || 'all'
  // PRD 008 优化 R1：listEntries 与 getStats 复用同一套过滤（typeFilter / payerMode / month），
  // 让列表和头部统计永远保持一致。
  const typeFilter = (input && input.typeFilter) || 'all'
  const categoryIds = Array.isArray(input && input.categoryIds) ? input.categoryIds : []
  const includeDeleted = input && input.includeDeleted === true
  const requestedPageSize = Number.parseInt(input && input.pageSize, 10)
  const pageSize = Number.isFinite(requestedPageSize) ? Math.min(Math.max(requestedPageSize, 1), 50) : 0
  const requestedPage = Number.parseInt(input && input.page, 10)
  const page = pageSize > 0 ? Math.max(requestedPage || 1, 1) : 1

  const repo = dependencies.repository
  const isMember = await repo.isMemberOfHousehold(dependencies.identityKey, dependencies.householdId)
  if (!isMember) throw new LedgerDomainError('LEDGER_FORBIDDEN', false)

  const records = await repo.findEntriesByHousehold(dependencies.householdId, {
    month,
    payerMode,
    typeFilter,
    categoryIds,
    selfMemberKey: dependencies.selfMemberKey || dependencies.identityKey,
    includeDeleted,
    offset: pageSize > 0 ? (page - 1) * pageSize : 0,
    limit: pageSize > 0 ? pageSize + 1 : 0,
  })
  const hasMore = pageSize > 0 && records.length > pageSize
  const pageRecords = pageSize > 0 ? records.slice(0, pageSize) : records
  const active = await attachReceiptUrls(filterActive(pageRecords).map(normaliseEntry), dependencies)
  const deleted = includeDeleted
    ? await attachReceiptUrls((Array.isArray(pageRecords) ? pageRecords.filter((r) => r && r.deletedAt != null) : []).map(normaliseEntry), dependencies)
    : []
  return { status: 'LISTED', retryable: false, entries: active, deletedEntries: deleted, hasMore }
}

async function getEntry(input, dependencies) {
  validateId(input && input.entryId, 'entryId')
  const repo = dependencies.repository
  const isMember = await repo.isMemberOfHousehold(dependencies.identityKey, dependencies.householdId)
  if (!isMember) throw new LedgerDomainError('LEDGER_FORBIDDEN', false)
  const record = await repo.getEntry(input.entryId)
  if (!record || record.deletedAt != null) throw new LedgerDomainError('LEDGER_NOT_FOUND', false)
  if (record.householdId !== dependencies.householdId) throw new LedgerDomainError('LEDGER_NOT_FOUND', false)
  // 服务端算 canEdit / canDelete 一起返回（前端拿不到 identityKey，自己算不了）。
  // PRD 008：编辑和软删都只允许创建者（payerMemberKey === identityKey）。
  // 撤销删除（restoreEntry）任何成员都可做——所以 canDelete 跟 PRD 一致、不放开。
  // isCurrentUserPayer：当前账目付款人是否是当前用户，供编辑页把 payer.memberKey
  // 反推为 'self' / 'other' 字面量（前端不持有 identityKey）。
  const [detail] = await attachReceiptUrls([normaliseEntryDetail(record)], dependencies)
  const isCurrentUserPayer = record.payerMemberKey === dependencies.identityKey
  return {
    status: 'LOADED',
    retryable: false,
    detail: {
      ...detail,
      canEdit: isCurrentUserPayer,
      canDelete: isCurrentUserPayer,
      isCurrentUserPayer,
    },
  }
}

async function addCategory(input, dependencies) {
  // 幂等锁：使用 `requestId`（`creationLockId`），不需要 `operationToken`。
  // 理由与 addEntry 一致：创建类 action 用 requestId 做幂等锁；operationToken 只用于对已有实体的操作。
  validateCredential(input && input.requestId, 'requestId')
  const name = validateCategoryName(input.name)
  const iconKey = validateIconKey(input.iconKey)
  const colorKey = validateColorKey(input.colorKey)
  const repo = dependencies.repository
  const isMember = await repo.isMemberOfHousehold(dependencies.identityKey, dependencies.householdId)
  if (!isMember) throw new LedgerDomainError('LEDGER_FORBIDDEN', false)

  const existing = await repo.findCategoriesByHousehold(dependencies.householdId)
  const nameTaken = existing.some((c) => c.name === name)
  if (nameTaken) throw new LedgerDomainError('LEDGER_CATEGORY_NAME_TAKEN', false)

  const lockId = creationLockId(dependencies.householdId, input.requestId)
  const existingOp = await repo.getOperation(lockId)
  if (existingOp && existingOp.categoryId) {
    const existingCat = await repo.findCategoryById(existingOp.categoryId)
    if (existingCat) {
      return { status: 'ADDED', retryable: false, category: normaliseCategory(existingCat) }
    }
  }

  const now = dependencies.now().toISOString()
  const record = {
    _id: categoryId(),
    householdId: dependencies.householdId,
    key: `custom_${crypto.createHash('sha256').update(`${dependencies.householdId}:${name}`).digest('hex').slice(0, 12)}`,
    name,
    iconKey,
    colorKey,
    isCustom: true,
    sortOrder: 100 + existing.length,
    isHiddenBy: [],
    createdAt: now,
  }
  await repo.runTransaction(async (tx) => {
    await tx.addCategory(withoutDocumentId(record))
    await tx.addOperation({
      _id: lockId,
      kind: 'addCategory',
      categoryId: record._id,
      at: now,
    })
  })
  return { status: 'ADDED', retryable: false, category: normaliseCategory(record) }
}

async function updateCategory(input, dependencies) {
  validateId(input && input.categoryId, 'categoryId')
  validateCredential(input && input.operationToken, 'operationToken')
  const repo = dependencies.repository
  const isMember = await repo.isMemberOfHousehold(dependencies.identityKey, dependencies.householdId)
  if (!isMember) throw new LedgerDomainError('LEDGER_FORBIDDEN', false)

  const existing = await repo.findCategoryById(input.categoryId)
  if (!existing) throw new LedgerDomainError('LEDGER_CATEGORY_NOT_FOUND', false)
  if (existing.householdId !== dependencies.householdId) throw new LedgerDomainError('LEDGER_CATEGORY_NOT_FOUND', false)

  const updates = {}
  let hiddenByMe = false
  const selfKey = dependencies.selfMemberKey || dependencies.identityKey
  const currentHiddenBy = Array.isArray(existing.isHiddenBy) ? existing.isHiddenBy : []
  if (input.setHiddenByMe !== undefined) {
    if (typeof input.setHiddenByMe !== 'boolean') throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
    let nextHiddenBy = currentHiddenBy.slice()
    if (input.setHiddenByMe && !nextHiddenBy.includes(selfKey)) nextHiddenBy.push(selfKey)
    if (!input.setHiddenByMe) nextHiddenBy = nextHiddenBy.filter((k) => k !== selfKey)
    updates.isHiddenBy = nextHiddenBy
    hiddenByMe = nextHiddenBy.includes(selfKey)
  }
  if (input.name !== undefined) {
    if (existing.isCustom !== true) {
      throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
    }
    const name = validateCategoryName(input.name)
    if (name !== existing.name) {
      const all = await repo.findCategoriesByHousehold(dependencies.householdId)
      const nameTaken = all.some((c) => c._id !== existing._id && c.name === name)
      if (nameTaken) throw new LedgerDomainError('LEDGER_CATEGORY_NAME_TAKEN', false)
    }
    updates.name = name
  }
  if (Object.keys(updates).length === 0) {
    return { status: 'UPDATED', retryable: false, category: normaliseCategory(existing), hiddenByMe: currentHiddenBy.includes(selfKey) }
  }
  await repo.updateCategory(input.categoryId, updates)
  const updated = await repo.findCategoryById(input.categoryId)
  return { status: 'UPDATED', retryable: false, category: normaliseCategory(updated), hiddenByMe: (Array.isArray(updated.isHiddenBy) ? updated.isHiddenBy : []).includes(selfKey) }
}

async function removeCategory(input, dependencies) {
  validateId(input && input.categoryId, 'categoryId')
  validateCredential(input && input.operationToken, 'operationToken')
  const repo = dependencies.repository
  const isMember = await repo.isMemberOfHousehold(dependencies.identityKey, dependencies.householdId)
  if (!isMember) throw new LedgerDomainError('LEDGER_FORBIDDEN', false)

  const existing = await repo.findCategoryById(input.categoryId)
  if (!existing) throw new LedgerDomainError('LEDGER_CATEGORY_NOT_FOUND', false)
  if (existing.householdId !== dependencies.householdId) throw new LedgerDomainError('LEDGER_CATEGORY_NOT_FOUND', false)
  if (existing.isCustom !== true) throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)

  const refCount = await repo.countEntriesByCategory(input.categoryId, dependencies.householdId)
  if (refCount > 0) throw new LedgerDomainError('LEDGER_CATEGORY_IN_USE', false)

  await repo.removeCategory(input.categoryId)
  return { status: 'REMOVED', retryable: false, categoryId: input.categoryId }
}

async function getStats(input, dependencies) {
  // PRD 008 优化 R5 / R20-R22：getStats 接收 payerMode / typeFilter / categoryIds / month
  // 与 listEntries 复用同一套过滤，让头部 stats 跟列表保持一致
  const month = (input && input.month) || ''
  const payerMode = (input && input.payerMode) || 'all'
  const typeFilter = (input && input.typeFilter) || 'all'
  const categoryIds = Array.isArray(input && input.categoryIds) ? input.categoryIds : []
  const repo = dependencies.repository
  const isMember = await repo.isMemberOfHousehold(dependencies.identityKey, dependencies.householdId)
  if (!isMember) throw new LedgerDomainError('LEDGER_FORBIDDEN', false)

  const records = await repo.findEntriesByHousehold(dependencies.householdId, {
    month,
    payerMode,
    typeFilter,
    categoryIds,
    selfMemberKey: dependencies.selfMemberKey || dependencies.identityKey,
  })
  const active = filterActive(records)

  let monthExpenseCents = 0
  let monthIncomeCents = 0
  const byCategoryMap = new Map()
  const byPayerMap = new Map()
  for (const r of active) {
    if (r.type === 'expense') monthExpenseCents += r.amountCents
    else if (r.type === 'income') monthIncomeCents += r.amountCents
    if (!byCategoryMap.has(r.categoryId)) byCategoryMap.set(r.categoryId, { categoryId: r.categoryId, expenseCents: 0, incomeCents: 0 })
    const c = byCategoryMap.get(r.categoryId)
    if (r.type === 'expense') c.expenseCents += r.amountCents
    else c.incomeCents += r.amountCents
    const payerKey = r.payerMemberKey || (r.payer && r.payer.memberKey) || 'unknown'
    if (!byPayerMap.has(payerKey)) byPayerMap.set(payerKey, { payerMemberKey: payerKey, expenseCents: 0, incomeCents: 0 })
    const p = byPayerMap.get(payerKey)
    if (r.type === 'expense') p.expenseCents += r.amountCents
    else p.incomeCents += r.amountCents
  }
  return {
    status: 'LOADED',
    retryable: false,
    stats: {
      month: month || '',
      monthExpenseCents,
      monthIncomeCents,
      netCents: monthIncomeCents - monthExpenseCents,
      byCategory: Array.from(byCategoryMap.values()),
      byPayer: Array.from(byPayerMap.values()),
    },
  }
}

module.exports = {
  LedgerDomainError,
  initCategories,
  addEntry,
  updateEntry,
  deleteEntry,
  restoreEntry,
  listEntries,
  getEntry,
  addCategory,
  updateCategory,
  removeCategory,
  getStats,
  _internal: {
    validateAmount,
    validateOccurredAt,
    validateCategoryName,
    validateIconKey,
    validateColorKey,
    normaliseEntry,
    normaliseCategory,
    buildPayerDisplay,
    PRESET_CATEGORIES,
    PRESET_KEYS,
  },
}
