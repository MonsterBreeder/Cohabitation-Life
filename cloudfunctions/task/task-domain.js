const crypto = require('crypto')
const { validateDisplayText } = require('./display-text')
const { commentId } = require('./repository-data')

// === 任务模块领域规则（PRD 005 + 实施计划 U2） ===
// 状态机：pending → claimed → (completed | abandoned)，终止态不可重新打开。
// 任一成员都能创建、认领、完成、放弃；不开放编辑、转交、删除。
// 操作幂等：同 (taskId, operationToken) 多次提交只生效一次。

const TASK_TYPES = new Set(['low_stock', 'to_handle', 'expiring'])
const OPEN_STATUSES = new Set(['pending', 'claimed'])
const TERMINAL_STATUSES = new Set(['completed', 'abandoned'])
const EVENT_KINDS = new Set(['create', 'claim', 'complete', 'abandon', 'edit', 'delete'])
const EDIT_FIELDS = new Set(['name', 'type', 'dueDate', 'note'])

const CREDENTIAL_PATTERN = /^[A-Za-z0-9_-]{16,128}$/
const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PERSON_AVATAR_PATTERN = /^person-\d{2}$/

const TITLE_MAX = 20
const NOTE_MAX = 100
// PRD 006：评论 200 字，比 note 100 字宽松；与 PRD 005 note 区分
const COMMENT_MAX = 200
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
  const base = {
    kind: record.kind,
    actor: safeAssigneeDisplay({ assigneeProfile: profilesByKey[record.actorKey] }),
    at: toIsoString(record.at) || '',
  }
  // edit 事件额外带 changedFields；非 edit 事件不会带此字段
  if (record.kind === 'edit') {
    if (!Array.isArray(record.changedFields)) return null
    const validFields = record.changedFields.filter((f) => typeof f === 'string' && EDIT_FIELDS.has(f))
    return { ...base, changedFields: validFields }
  }
  return base
}

function safeCommentFromRecord(record, profile) {
  if (!record || typeof record.id !== 'string') return null
  if (typeof record.text !== 'string') return null
  if (record.text.length < 1 || record.text.length > COMMENT_MAX) return null
  const at = toIsoString(record.at)
  if (!at) return null
  return {
    id: record.id,
    actor: safeAssigneeDisplay({ assigneeProfile: profile }),
    text: record.text,
    at,
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
  // duck-type 判 Date：Jest 等多 realm 环境里 structuredClone 返回的 Date 可能不是当前 realm 的 Date 实例
  // 用 hasOwnProperty('getTime') 判定更稳，避免 Date 跨 realm 失效
  if (typeof value === 'object' && typeof value.toISOString === 'function' && typeof value.getTime === 'function') {
    return value.toISOString()
  }
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

/** PRD 006：编辑请求校验。至少要带 1 个可编辑字段；editVersion 必须是非负整数。 */
function validateUpdateInput(input) {
  if (!input || typeof input !== 'object') throw new TaskDomainError('TASK_INVALID_REQUEST')
  if (typeof input.taskId !== 'string' || !input.taskId) throw new TaskDomainError('TASK_INVALID_REQUEST')
  if (typeof input.editVersion !== 'number' || !Number.isInteger(input.editVersion) || input.editVersion < 0) {
    throw new TaskDomainError('TASK_INVALID_REQUEST')
  }
  // 至少带 1 个可编辑字段；空提交会被 R5 兜底（不产生 edit 事件）但这里仍要求带字段
  const hasAnyField = input.name !== undefined
    || input.type !== undefined
    || input.dueDate !== undefined
    || input.note !== undefined
  if (!hasAnyField) throw new TaskDomainError('TASK_INVALID_REQUEST')
  if (input.name !== undefined) {
    const title = validateDisplayText(input.name, TITLE_MAX)
    if (!title) throw new TaskDomainError('TASK_INVALID_REQUEST')
  }
  if (input.type !== undefined && !TASK_TYPES.has(input.type)) {
    throw new TaskDomainError('TASK_INVALID_REQUEST')
  }
  if (input.dueDate !== undefined && input.dueDate !== null && input.dueDate !== '') {
    if (typeof input.dueDate !== 'string' || !DUE_DATE_PATTERN.test(input.dueDate)) {
      throw new TaskDomainError('TASK_INVALID_REQUEST')
    }
  }
  if (input.note !== undefined && input.note !== null && input.note !== '') {
    const note = validateDisplayText(input.note, NOTE_MAX)
    if (!note) throw new TaskDomainError('TASK_INVALID_REQUEST')
  }
}

/** PRD 006：评论请求校验。1-200 字，首尾去空白。 */
function validateCommentInput(input) {
  if (!input || typeof input !== 'object') throw new TaskDomainError('TASK_INVALID_REQUEST')
  if (typeof input.taskId !== 'string' || !input.taskId) throw new TaskDomainError('TASK_INVALID_REQUEST')
  const text = validateDisplayText(input.text, COMMENT_MAX)
  if (!text) throw new TaskDomainError('TASK_INVALID_REQUEST')
  return text
}

/** 对比旧 task 与新 input，返回实际变化的字段名数组。空数组 = 空提交。 */
function computeChangedFields(oldTask, input) {
  const changed = []
  if (input.name !== undefined && input.name !== oldTask.title) changed.push('name')
  if (input.type !== undefined && input.type !== oldTask.type) changed.push('type')
  if (input.dueDate !== undefined) {
    const oldDue = oldTask.dueDate || ''
    const newDue = input.dueDate || ''
    if (oldDue !== newDue) changed.push('dueDate')
  }
  if (input.note !== undefined) {
    const oldNote = oldTask.note || ''
    const newNote = input.note || ''
    if (oldNote !== newNote) changed.push('note')
  }
  return changed
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
      // PRD 006：详情必含字段
      comments: [],
      editVersion: 0,
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
  // PRD 007：软删的任务对前端不可见
  if (isTaskDeleted(task)) throw new TaskDomainError('TASK_NOT_FOUND')
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
  // PRD 006：评论数组按 at 倒序展示；at 相同则按插入顺序倒序（后插入的在前）
  const commentProfileKeys = new Set()
  const commentsRaw = Array.isArray(task.comments) ? task.comments : []
  for (const c of commentsRaw) {
    if (c && c.actorKey && !profiles[c.actorKey]) commentProfileKeys.add(c.actorKey)
  }
  for (const key of commentProfileKeys) {
    profiles[key] = await repository.getUser(key)
  }
  // 用原始索引做 tiebreaker：at 相同则后插入的在前（保证同 at 时新评论在上）
  const safeComments = []
  commentsRaw.forEach((c, idx) => {
    const safe = safeCommentFromRecord(c, c.actorKey ? profiles[c.actorKey] : null)
    if (safe) safeComments.push({ __idx: idx, ...safe })
  })
  safeComments.sort((a, b) => {
    if (a.at < b.at) return 1
    if (a.at > b.at) return -1
    return b.__idx - a.__idx
  })
  const comments = safeComments.map(({ __idx, ...rest }) => rest)
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
      comments,
      editVersion: typeof task.editVersion === 'number' ? task.editVersion : 0,
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

// === PRD 006：编辑字段（updateTask） ===

async function updateTask(input, dependencies) {
  const { identityKey, repository, now } = dependencies
  if (!identityKey || !repository) throw new TaskDomainError('TASK_INVALID_REQUEST')
  validateCommonAuth(input)
  validateUpdateInput(input)

  // 幂等检查在 CAS 之前：同 operationToken 重复提交 → 直接返回上次结果，不做 editVersion 校验
  const opId = operationId(input.taskId, input.operationToken)
  const existingOp = await repository.getOperation(opId)
  if (existingOp && existingOp.kind === 'edit') {
    const refreshed = await repository.getTask(input.taskId)
    const events = await repository.findOperationsByTaskId(input.taskId)
    const profiles = await loadProfilesForTask(refreshed, repository)
    for (const ev of events) {
      if (!profiles[ev.actorKey]) profiles[ev.actorKey] = await repository.getUser(ev.actorKey)
    }
    return {
      status: 'UPDATED',
      retryable: false,
      task: taskSummaryFromRecord(refreshed, profiles),
      events: events.map((e) => taskEventFromRecord(e, profiles)).filter(Boolean),
      editVersion: typeof refreshed.editVersion === 'number' ? refreshed.editVersion : 0,
    }
  }

  const task = await repository.getTask(input.taskId)
  if (!task) throw new TaskDomainError('TASK_NOT_FOUND')
  if (!await repository.isMemberOfHousehold(identityKey, task.householdId)) {
    throw new TaskDomainError('TASK_FORBIDDEN')
  }
  if (TERMINAL_STATUSES.has(task.status)) throw new TaskDomainError('TASK_TERMINAL')
  const currentEditVersion = typeof task.editVersion === 'number' ? task.editVersion : 0
  if (currentEditVersion !== input.editVersion) throw new TaskDomainError('TASK_DUPLICATE_OPERATION')

  // 内容安全检查（与 createTask 一致）
  if (input.name !== undefined && dependencies.checkText && !await dependencies.checkText(input.name)) {
    throw new TaskDomainError('TASK_INVALID_REQUEST')
  }
  if (input.note !== undefined && input.note && dependencies.checkText && !await dependencies.checkText(input.note)) {
    throw new TaskDomainError('TASK_INVALID_REQUEST')
  }

  return repository.runTransaction(async (transaction) => {
    const refreshed = await transaction.getTask(input.taskId)
    if (!refreshed) throw new TaskDomainError('TASK_NOT_FOUND')
    if (TERMINAL_STATUSES.has(refreshed.status)) throw new TaskDomainError('TASK_TERMINAL')
    const refreshedEditVersion = typeof refreshed.editVersion === 'number' ? refreshed.editVersion : 0
    if (refreshedEditVersion !== input.editVersion) throw new TaskDomainError('TASK_DUPLICATE_OPERATION')

    const changedFields = computeChangedFields(refreshed, input)
    const at = now()
    // editVersion 仅在有真实变化时 +1；空 changedFields 不动锁（兜底：客户端提交了但字段没变）
    const isRealChange = changedFields.length > 0
    const newEditVersion = isRealChange ? refreshedEditVersion + 1 : refreshedEditVersion
    const update = { updatedAt: at, editVersion: newEditVersion }
    if (input.name !== undefined) update.title = input.name
    if (input.type !== undefined) update.type = input.type
    if (input.dueDate !== undefined) update.dueDate = input.dueDate || null
    if (input.note !== undefined) update.note = input.note || null

    await transaction.updateTask(input.taskId, update)
    if (changedFields.length > 0) {
      // R5 兜底：空 changedFields 不写事件
      await transaction.createOperation({
        _id: opId,
        taskId: input.taskId,
        householdId: task.householdId,
        kind: 'edit',
        actorKey: identityKey,
        at,
        changedFields,
      })
    }

    const updatedTask = { ...refreshed, ...update }
    const events = await transaction.findOperationsByTaskId(input.taskId)
    const profiles = await loadProfilesForTask(updatedTask, repository)
    for (const ev of events) {
      if (!profiles[ev.actorKey]) profiles[ev.actorKey] = await repository.getUser(ev.actorKey)
    }
    return {
      status: 'UPDATED',
      retryable: false,
      task: taskSummaryFromRecord(updatedTask, profiles),
      events: events.map((e) => taskEventFromRecord(e, profiles)).filter(Boolean),
      editVersion: newEditVersion,
    }
  })
}

// === PRD 006：多人评论（addComment） ===

async function addComment(input, dependencies) {
  const { identityKey, repository, now } = dependencies
  if (!identityKey || !repository) throw new TaskDomainError('TASK_INVALID_REQUEST')
  validateCommonAuth(input)
  const text = validateCommentInput(input)

  const task = await repository.getTask(input.taskId)
  if (!task) throw new TaskDomainError('TASK_NOT_FOUND')
  if (!await repository.isMemberOfHousehold(identityKey, task.householdId)) {
    throw new TaskDomainError('TASK_FORBIDDEN')
  }
  if (TERMINAL_STATUSES.has(task.status)) throw new TaskDomainError('TASK_TERMINAL')

  // 内容安全检查
  if (dependencies.checkText && !await dependencies.checkText(text)) {
    throw new TaskDomainError('TASK_INVALID_REQUEST')
  }

  // 幂等
  const opId = operationId(input.taskId, input.operationToken)
  const existingOp = await repository.getOperation(opId)
  if (existingOp && existingOp.kind === 'comment') {
    return await getTaskDetail({ taskId: input.taskId }, dependencies)
  }

  return repository.runTransaction(async (transaction) => {
    const refreshed = await transaction.getTask(input.taskId)
    if (!refreshed) throw new TaskDomainError('TASK_NOT_FOUND')
    if (TERMINAL_STATUSES.has(refreshed.status)) throw new TaskDomainError('TASK_TERMINAL')

    const at = now()
    const newComment = {
      id: commentId(),
      actorKey: identityKey,
      text,
      at,
    }
    const existingComments = Array.isArray(refreshed.comments) ? refreshed.comments : []
    const updatedComments = [...existingComments, newComment]
    await transaction.updateTask(input.taskId, {
      comments: updatedComments,
      updatedAt: at,
    })
    await transaction.createOperation({
      _id: opId,
      taskId: input.taskId,
      householdId: task.householdId,
      kind: 'comment',
      actorKey: identityKey,
      at,
    })
    // 重新读一次拿最新视图（含本条新 comment）
    const after = await transaction.getTask(input.taskId)
    return getTaskDetailResponse(after, identityKey, repository)
  })
}

// 把 getTaskDetail 的响应构造抽出来供 addComment 复用
async function getTaskDetailResponse(task, identityKey, repository) {
  const events = await repository.findOperationsByTaskId(task._id)
  const profiles = await loadProfilesForTask(task, repository)
  for (const ev of events) {
    if (!profiles[ev.actorKey]) profiles[ev.actorKey] = await repository.getUser(ev.actorKey)
  }
  const summary = taskSummaryFromRecord(task, profiles)
  const terminalActor = task.terminalBy ? safeAssigneeDisplay({ assigneeProfile: profiles[task.terminalBy] }) : undefined
  const commentsRaw = Array.isArray(task.comments) ? task.comments : []
  const commentProfileKeys = new Set()
  for (const c of commentsRaw) {
    if (c && c.actorKey && !profiles[c.actorKey]) commentProfileKeys.add(c.actorKey)
  }
  for (const key of commentProfileKeys) {
    profiles[key] = await repository.getUser(key)
  }
  // 与 getTaskDetail 保持一致：at 倒序，at 相同则按插入顺序倒序
  const safeComments = []
  commentsRaw.forEach((c, idx) => {
    const safe = safeCommentFromRecord(c, c.actorKey ? profiles[c.actorKey] : null)
    if (safe) safeComments.push({ __idx: idx, ...safe })
  })
  safeComments.sort((a, b) => {
    if (a.at < b.at) return 1
    if (a.at > b.at) return -1
    return b.__idx - a.__idx
  })
  const comments = safeComments.map(({ __idx, ...rest }) => rest)
  return {
    status: 'COMMENTED',
    retryable: false,
    detail: {
      ...summary,
      note: task.note,
      events: events.map((e) => taskEventFromRecord(e, profiles)).filter(Boolean),
      terminalAt: toIsoString(task.terminalAt) || undefined,
      terminalActor: TERMINAL_STATUSES.has(task.status) ? terminalActor : undefined,
      terminalKind: TERMINAL_STATUSES.has(task.status) ? task.terminalKind : undefined,
      comments,
      editVersion: typeof task.editVersion === 'number' ? task.editVersion : 0,
    },
  }
}

// === PRD 007：删除事项（软删除） ===

/** 软删除标记。R8/R15/R16：所有读路径过滤掉 deletedAt != null 的 task。 */
function isTaskDeleted(record) {
  return Boolean(record && record.deletedAt)
}

async function deleteTask(input, dependencies) {
  const { identityKey, repository, now } = dependencies
  if (!identityKey || !repository) throw new TaskDomainError('TASK_INVALID_REQUEST')
  validateCommonAuth(input)
  if (!input || typeof input.taskId !== 'string' || !input.taskId) {
    throw new TaskDomainError('TASK_INVALID_REQUEST')
  }

  // 幂等：同 operationToken 重复提交 → 直接返回上次结果（前置，跟 updateTask 一样）
  const opId = operationId(input.taskId, input.operationToken)
  const existingOp = await repository.getOperation(opId)
  if (existingOp && existingOp.kind === 'delete') {
    // 读一次 task 拿 deletedAt；如果已被物理清理就按 found 兜底
    const prev = await repository.getTask(input.taskId)
    if (prev && prev.deletedAt) {
      return { status: 'DELETED', retryable: false, taskId: input.taskId, deletedAt: toIsoString(prev.deletedAt) || new Date().toISOString() }
    }
    // 任务已被物理清理（30 天后）：返回 TASK_NOT_FOUND
    throw new TaskDomainError('TASK_NOT_FOUND')
  }

  const task = await repository.getTask(input.taskId)
  if (!task || isTaskDeleted(task)) throw new TaskDomainError('TASK_NOT_FOUND')
  if (!await repository.isMemberOfHousehold(identityKey, task.householdId)) {
    throw new TaskDomainError('TASK_FORBIDDEN')
  }
  // R7：终态任务不允许删（completed / abandoned 是永久记录）
  if (TERMINAL_STATUSES.has(task.status)) throw new TaskDomainError('TASK_TERMINAL')

  return repository.runTransaction(async (transaction) => {
    const refreshed = await transaction.getTask(input.taskId)
    if (!refreshed || isTaskDeleted(refreshed)) throw new TaskDomainError('TASK_NOT_FOUND')
    if (TERMINAL_STATUSES.has(refreshed.status)) throw new TaskDomainError('TASK_TERMINAL')
    const at = now()
    await transaction.updateTask(input.taskId, {
      deletedAt: at,
      deletedBy: identityKey,
      updatedAt: at,
    })
    await transaction.createOperation({
      _id: opId,
      taskId: input.taskId,
      householdId: task.householdId,
      kind: 'delete',
      actorKey: identityKey,
      at,
    })
    return { status: 'DELETED', retryable: false, taskId: input.taskId, deletedAt: toIsoString(at) }
  })
}

module.exports = {
  createTask,
  listCurrentTasks,
  getTaskDetail,
  claimTask,
  completeTask,
  abandonTask,
  listCompletedTasks,
  // PRD 006
  updateTask,
  addComment,
  // PRD 007
  deleteTask,
  isTaskDeleted,
  taskSummaryFromRecord,
  taskEventFromRecord,
  completedTaskItemFromRecord,
  safeCommentFromRecord,
  normaliseTask,
  computeIsOverdueOrToday,
  taskId,
  operationId,
  creationLockId,
  commentId,
  TaskDomainError,
}
