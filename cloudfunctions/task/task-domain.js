const crypto = require('crypto')
const { validateDisplayText } = require('./display-text')

// === 任务模块领域规则（PRD 005 + 实施计划 U2） ===
// 状态机：pending → claimed → (completed | abandoned)，终止态不可重新打开。
// 任一成员都能创建、认领、完成、放弃；不开放编辑、转交、删除。
// 操作幂等：同 (taskId, operationToken) 多次提交只生效一次。

const TASK_TYPES = new Set(['low_stock', 'to_handle', 'expiring'])
const OPEN_STATUSES = new Set(['pending', 'claimed'])
const TERMINAL_STATUSES = new Set(['completed', 'abandoned'])
const EVENT_KINDS = new Set(['create', 'claim', 'complete', 'abandon'])

const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{16,128}$/
const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PERSON_AVATAR_PATTERN = /^person-\d{2}$/

const TITLE_MAX = 20
const NOTE_MAX = 100
const LIST_PAGE_SIZE = 20
const DEFAULT_NICKNAME = '小伙伴'
const DEFAULT_AVATAR = { kind: 'builtin', id: 'person-neutral' }

class TaskDomainError extends Error {
  constructor(code, retryable = false) {
    super(code)
    this.code = code
    this.retryable = retryable
  }
}

function taskId() {
  return `task_${crypto.randomBytes(16).toString('hex')}`
}

// (taskId, operationToken) → 唯一 op id；同 token 提交得到同 id，实现幂等。
function operationId(taskId, operationToken) {
  const tokenHash = crypto.createHash('sha256').update(`${taskId}:${operationToken}`).digest('hex')
  return `taskop_${taskId}_${tokenHash.slice(0, 32)}`
}

// 创建幂等锁：同 (identityKey, requestId) 只创建一次 task，避免重复点击产生多条。
function creationLockId(identityKey, requestId) {
  return `tcrequest_${crypto.createHash('sha256').update(`${identityKey}:${requestId}`).digest('hex')}`
}

function normaliseTask(record) {
  if (!record) return null
  return {
    id: record._id,
    type: record.type,
    title: record.title,
    dueDate: record.dueDate || undefined,
    isOverdueOrToday: computeIsOverdueOrToday(record.dueDate),
    status: record.status,
    assigneeKey: record.assigneeKey || undefined,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    terminalAt: record.terminalAt || undefined,
    terminalBy: record.terminalBy || undefined,
    terminalKind: record.terminalKind || undefined,
  }
}

function safeAssigneeDisplay(record, profile) {
  if (!record) return undefined
  const profileRecord = profile || (record.assigneeProfile) || null
  const nickname = (profileRecord && typeof profileRecord.nickname === 'string' && profileRecord.nickname.trim())
    ? profileRecord.nickname.trim()
    : DEFAULT_NICKNAME
  const avatar = profileRecord && profileRecord.avatar && profileRecord.avatar.kind === 'builtin' && PERSON_AVATAR_PATTERN.test(profileRecord.avatar.id)
    ? { kind: 'builtin', id: profileRecord.avatar.id }
    : DEFAULT_AVATAR
  return { nickname, avatar }
}

function safeCreatorDisplay(record, profile) {
  if (!record) return undefined
  return safeAssigneeDisplay({ assigneeProfile: profile }, profile)
}

function taskSummaryFromRecord(record, profilesByKey = {}) {
  const normalised = normaliseTask(record)
  if (!normalised) return null
  return {
    id: normalised.id,
    type: normalised.type,
    title: normalised.title,
    dueDate: normalised.dueDate,
    isOverdueOrToday: normalised.isOverdueOrToday,
    status: normalised.status,
    assignee: normalised.assigneeKey
      ? safeAssigneeDisplay(record, profilesByKey[normalised.assigneeKey])
      : undefined,
  }
}

function taskEventFromRecord(record, profilesByKey = {}) {
  if (!record || !EVENT_KINDS.has(record.kind)) return null
  return {
    kind: record.kind,
    actor: safeAssigneeDisplay({ assigneeProfile: profilesByKey[record.actorKey] }),
    at: toIsoString(record.at) || '',
  }
}

function completedTaskItemFromRecord(record, profile) {
  return {
    id: record._id,
    type: record.type,
    title: record.title,
    terminalAt: toIsoString(record.terminalAt) || '',
    terminalActor: safeAssigneeDisplay({ assigneeProfile: profile }),
    terminalKind: record.terminalKind,
  }
}

function toIsoString(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return value
  return null
}

// "今天"或"已逾期"的判断：仅比较 yyyy-MM-dd 字符串，本地时区。
function computeIsOverdueOrToday(dueDate) {
  if (!dueDate || typeof dueDate !== 'string' || !DUE_DATE_PATTERN.test(dueDate)) return false
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return dueDate <= `${yyyy}-${mm}-${dd}`
}

// === 校验 ===

function validateCreateInput(input) {
  if (!input) throw new TaskDomainError('TASK_INVALID_REQUEST')
  const title = validateDisplayText(input.title, TITLE_MAX)
  if (!title) throw new TaskDomainError('TASK_INVALID_REQUEST')
  if (!TASK_TYPES.has(input.type)) throw new TaskDomainError('TASK_INVALID_REQUEST')
  if (input.dueDate !== undefined && input.dueDate !== null && input.dueDate !== '') {
    if (typeof input.dueDate !== 'string' || !DUE_DATE_PATTERN.test(input.dueDate)) {
      throw new TaskDomainError('TASK_INVALID_REQUEST')
    }
  }
  if (input.note !== undefined && input.note !== null && input.note !== '') {
    const note = validateDisplayText(input.note, NOTE_MAX)
    if (!note) throw new TaskDomainError('TASK_INVALID_REQUEST')
  }
  if (!CREDENTIAL_PATTERN.test(input.requestId || '') || !CREDENTIAL_PATTERN.test(input.operationToken || '')) {
    throw new TaskDomainError('TASK_INVALID_REQUEST')
  }
  return { title, type: input.type, dueDate: input.dueDate || undefined, note: input.note || undefined }
}

function validateCommonAuth(input) {
  if (!CREDENTIAL_PATTERN.test(input && input.requestId || '')) throw new TaskDomainError('TASK_INVALID_REQUEST')
  if (!CREDENTIAL_PATTERN.test(input && input.operationToken || '')) throw new TaskDomainError('TASK_INVALID_REQUEST')
}

function loadProfilesForTask(taskRecord, repository) {
  if (!taskRecord) return Promise.resolve({})
  const keys = new Set()
  if (taskRecord.assigneeKey) keys.add(taskRecord.assigneeKey)
  if (taskRecord.createdBy) keys.add(taskRecord.createdBy)
  if (taskRecord.terminalBy) keys.add(taskRecord.terminalBy)
  if (!repository.getUser) return Promise.resolve({})
  return Promise.all([...keys].map(async (key) => [key, await repository.getUser(key)])).then((entries) => Object.fromEntries(entries))
}

function loadProfilesForTasks(records, repository) {
  if (!Array.isArray(records) || records.length === 0) return Promise.resolve({})
  const keys = new Set()
  for (const r of records) {
    if (!r) continue
    if (r.assigneeKey) keys.add(r.assigneeKey)
    if (r.createdBy) keys.add(r.createdBy)
    if (r.terminalBy) keys.add(r.terminalBy)
  }
  if (!repository.getUser) return Promise.resolve({})
  return Promise.all([...keys].map(async (key) => [key, await repository.getUser(key)])).then((entries) => Object.fromEntries(entries))
}

// === 7 个 action ===

async function createTask(input, dependencies) {
  const { identityKey, repository, now } = dependencies
  if (!identityKey || !repository) throw new TaskDomainError('TASK_INVALID_REQUEST')
  validateCommonAuth(input)
  const valid = validateCreateInput(input)

  // 校验身份属于至少一个家庭
  const homes = await repository.findHouseholdsByMemberKey(identityKey)
  if (homes.length === 0) throw new TaskDomainError('TASK_FORBIDDEN')
  if (homes.length > 1) throw new TaskDomainError('TASK_FORBIDDEN')
  const householdId = homes[0]._id

  // 内容安全检查（如有 checkText）
  if (valid.title !== '事项' && dependencies.checkText && !await dependencies.checkText(valid.title)) {
    throw new TaskDomainError('TASK_INVALID_REQUEST')
  }
  if (valid.note && dependencies.checkText && !await dependencies.checkText(valid.note)) {
    throw new TaskDomainError('TASK_INVALID_REQUEST')
  }

  return repository.runTransaction(async (transaction) => {
    const newId = taskId()
    const opId = operationId(newId, input.operationToken)
    const lockId = creationLockId(identityKey, input.requestId)
    // 幂等：同 (identityKey, requestId) 已创建 → 返回现有 task
    const existingLock = await transaction.getCreationLock ? await transaction.getCreationLock(lockId) : null
    if (existingLock) {
      const existing = await transaction.getTask(existingLock.taskId)
      if (existing) {
        const profiles = await loadProfilesForTask(existing, repository)
        return { status: 'CREATED', retryable: false, task: taskSummaryFromRecord(existing, profiles) }
      }
    }
    const createdAt = now()
    const task = {
      _id: newId,
      householdId,
      type: valid.type,
      title: valid.title,
      dueDate: valid.dueDate,
      note: valid.note,
      status: 'pending',
      createdBy: identityKey,
      createdAt,
      updatedAt: createdAt,
    }
    await transaction.createTask(task)
    await transaction.createOperation({
      _id: opId,
      taskId: newId,
      householdId,
      kind: 'create',
      actorKey: identityKey,
      at: createdAt,
    })
    if (transaction.createCreationLock) {
      await transaction.createCreationLock({
        _id: lockId,
        taskId: newId,
        householdId,
        identityKey,
        createdAt,
      })
    }
    const profile = repository.getUser ? await repository.getUser(identityKey) : null
    return {
      status: 'CREATED',
      retryable: false,
      task: taskSummaryFromRecord(task, { [identityKey]: profile }),
    }
  })
}

async function listCurrentTasks(dependencies) {
  const { identityKey, repository, now } = dependencies
  if (!identityKey || !repository) throw new TaskDomainError('TASK_INVALID_REQUEST')
  const homes = await repository.findHouseholdsByMemberKey(identityKey)
  if (homes.length === 0) throw new TaskDomainError('TASK_FORBIDDEN')
  if (homes.length > 1) throw new TaskDomainError('TASK_FORBIDDEN')

  const records = await repository.findOpenTasksByHousehold(homes[0]._id, now())
  const profiles = await loadProfilesForTasks(records, repository)
  const summaries = records.map((r) => taskSummaryFromRecord(r, profiles)).filter(Boolean)

  const priority = []
  const groups = { low_stock: [], to_handle: [], expiring: [] }
  for (const s of summaries) {
    if (s.isOverdueOrToday) priority.push(s)
    else if (groups[s.type]) groups[s.type].push(s)
  }
  // 排序：截止日期近的在前；无日期排最后
  const byDueAsc = (a, b) => {
    if (!a.dueDate && !b.dueDate) return 0
    if (!a.dueDate) return 1
    if (!b.dueDate) return -1
    return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0
  }
  priority.sort(byDueAsc)
  groups.low_stock.sort(byDueAsc)
  groups.to_handle.sort(byDueAsc)
  groups.expiring.sort(byDueAsc)
  return { status: 'LISTED', retryable: false, current: { priority, groups } }
}

async function getTaskDetail(input, dependencies) {
  const { identityKey, repository } = dependencies
  if (!identityKey || !repository) throw new TaskDomainError('TASK_INVALID_REQUEST')
  if (!input || typeof input.taskId !== 'string') throw new TaskDomainError('TASK_INVALID_REQUEST')

  const task = await repository.getTask(input.taskId)
  if (!task) throw new TaskDomainError('TASK_NOT_FOUND')
  // 校验家庭归属
  if (!await repository.isMemberOfHousehold(identityKey, task.householdId)) {
    throw new TaskDomainError('TASK_FORBIDDEN')
  }

  const events = await repository.findOperationsByTaskId(input.taskId)
  const profiles = await loadProfilesForTask(task, repository)
  for (const ev of events) {
    if (!profiles[ev.actorKey]) profiles[ev.actorKey] = await repository.getUser(ev.actorKey)
  }
  const summary = taskSummaryFromRecord(task, profiles)
  const terminalActor = task.terminalBy ? safeAssigneeDisplay({ assigneeProfile: profiles[task.terminalBy] }) : undefined
  return {
    status: 'LOADED',
    retryable: false,
    detail: {
      ...summary,
      note: task.note,
      events: events.map((e) => taskEventFromRecord(e, profiles)).filter(Boolean),
      terminalAt: toIsoString(task.terminalAt) || undefined,
      terminalActor: TERMINAL_STATUSES.has(task.status) ? terminalActor : undefined,
      terminalKind: TERMINAL_STATUSES.has(task.status) ? task.terminalKind : undefined,
    },
  }
}

async function transitionTask(input, dependencies, options) {
  // options: { kind: 'claim'|'complete'|'abandon', nextStatus: 'claimed'|'completed'|'abandoned' }
  const { identityKey, repository, now } = dependencies
  validateCommonAuth(input)
  if (!input || typeof input.taskId !== 'string') throw new TaskDomainError('TASK_INVALID_REQUEST')

  const task = await repository.getTask(input.taskId)
  if (!task) throw new TaskDomainError('TASK_NOT_FOUND')
  if (!await repository.isMemberOfHousehold(identityKey, task.householdId)) {
    throw new TaskDomainError('TASK_FORBIDDEN')
  }

  // 事务前幂等检查：同 (taskId, operationToken) 重复提交同 kind → 直接返回当前状态
  const opId = operationId(input.taskId, input.operationToken)
  const existingOp = await repository.getOperation(opId)
  if (existingOp && existingOp.kind === options.kind) {
    const profiles = await loadProfilesForTask(task, repository)
    if (options.kind === 'claim') {
      return { status: 'CLAIMED', retryable: false, task: taskSummaryFromRecord(task, profiles) }
    }
    return {
      status: options.kind === 'complete' ? 'COMPLETED' : 'ABANDONED',
      retryable: false,
      taskId: task._id,
      terminalAt: toIsoString(task.terminalAt) || toIsoString(now()),
    }
  }

  // 状态校验
  if (TERMINAL_STATUSES.has(task.status)) throw new TaskDomainError('TASK_TERMINAL')
  if (options.kind === 'claim' && task.status !== 'pending') throw new TaskDomainError('TASK_TERMINAL')
  if ((options.kind === 'complete' || options.kind === 'abandon') && !OPEN_STATUSES.has(task.status)) throw new TaskDomainError('TASK_TERMINAL')

  return repository.runTransaction(async (transaction) => {
    const at = now()
    const update = {
      status: options.nextStatus,
      updatedAt: at,
    }
    if (options.kind === 'claim') update.assigneeKey = identityKey
    if (options.kind === 'complete' || options.kind === 'abandon') {
      update.terminalAt = at
      update.terminalBy = identityKey
      update.terminalKind = options.nextStatus
    }
    await transaction.updateTask(input.taskId, update)
    await transaction.createOperation({
      _id: opId,
      taskId: input.taskId,
      householdId: task.householdId,
      kind: options.kind,
      actorKey: identityKey,
      at,
    })
    if (options.kind === 'claim') {
      const refreshed = await transaction.getTask(input.taskId)
      const profiles = await loadProfilesForTask(refreshed, repository)
      return { status: 'CLAIMED', retryable: false, task: taskSummaryFromRecord(refreshed, profiles) }
    }
    return {
      status: options.kind === 'complete' ? 'COMPLETED' : 'ABANDONED',
      retryable: false,
      taskId: input.taskId,
      terminalAt: toIsoString(at),
    }
  })
}

async function claimTask(input, dependencies) {
  const { identityKey, repository } = dependencies
  if (!identityKey || !repository) throw new TaskDomainError('TASK_INVALID_REQUEST')
  return transitionTask(input, dependencies, { kind: 'claim', nextStatus: 'claimed' })
}

async function completeTask(input, dependencies) {
  const { identityKey, repository } = dependencies
  if (!identityKey || !repository) throw new TaskDomainError('TASK_INVALID_REQUEST')
  return transitionTask(input, dependencies, { kind: 'complete', nextStatus: 'completed' })
}

async function abandonTask(input, dependencies) {
  const { identityKey, repository } = dependencies
  if (!identityKey || !repository) throw new TaskDomainError('TASK_INVALID_REQUEST')
  return transitionTask(input, dependencies, { kind: 'abandon', nextStatus: 'abandoned' })
}

async function listCompletedTasks(input, dependencies) {
  const { identityKey, repository } = dependencies
  if (!identityKey || !repository) throw new TaskDomainError('TASK_INVALID_REQUEST')
  const limit = Math.min(Math.max(parseInt(input && input.limit, 10) || LIST_PAGE_SIZE, 1), 50)
  const homes = await repository.findHouseholdsByMemberKey(identityKey)
  if (homes.length === 0) throw new TaskDomainError('TASK_FORBIDDEN')
  if (homes.length > 1) throw new TaskDomainError('TASK_FORBIDDEN')

  const { records, nextCursor } = await repository.findCompletedTasksByHousehold(homes[0]._id, limit, input && input.cursor)
  const profiles = await loadProfilesForTasks(records, repository)
  const items = records.map((r) => completedTaskItemFromRecord(r, profiles[r.terminalBy])).filter(Boolean)
  return { status: 'LISTED', retryable: false, items, nextCursor }
}

module.exports = {
  createTask,
  listCurrentTasks,
  getTaskDetail,
  claimTask,
  completeTask,
  abandonTask,
  listCompletedTasks,
  taskSummaryFromRecord,
  taskEventFromRecord,
  completedTaskItemFromRecord,
  normaliseTask,
  computeIsOverdueOrToday,
  taskId,
  operationId,
  creationLockId,
  TaskDomainError,
}
