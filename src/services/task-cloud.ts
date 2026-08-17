import { cloudEnvironmentId, hasCloudEnvironment } from '../config/cloud'
import type {
  AbandonTaskRequest,
  AddCommentRequest,
  ClaimTaskRequest,
  CompleteTaskRequest,
  CompletedTaskItem,
  CreateTaskRequest,
  CurrentTasks,
  ListCompletedRequest,
  TaskComment,
  TaskDetail,
  TaskEditField,
  TaskResult,
  TaskSummary,
  TaskType,
  UpdateTaskRequest,
} from '../types/task'

// 任务模块的云端客户端：
// 1) 严格校验响应，防止云端任意文字或伪造字段进入页面；
// 2) 沿用 household-cloud 的初始化/超时/测试注入模式；
// 3) 每次调用携带 requestId + operationToken，由云端做幂等去重。

interface TaskCloudRuntime {
  cloud?: {
    init(options: { env: string }): void
    callFunction(options: { name: string; data: Record<string, unknown> }): Promise<{ result: unknown }>
    database?: {
      collection(name: string): {
        doc(id: string): {
          /** 微信云 db.watch：SSE 通道，返回 watcher；onChange 收到完整文档快照。 */
          watch(options: { onChange: (snapshot: WatchSnapshot) => void; onError?: (err: unknown) => void }): Watcher
        }
      }
    }
  }
}

/** 微信云 watch 回调的 snapshot 形态：type 是 init/update，docs 是完整文档数组。 */
interface WatchSnapshot {
  type: 'init' | 'update'
  docs: unknown[]
}

/** watcher.close() 关闭订阅。 */
interface Watcher {
  close(): void
}

let initialized = false
let timeoutMs = 10_000
let runtimeForTesting: TaskCloudRuntime | undefined
let environmentForTesting: string | undefined

export class TaskCloudError extends Error {
  constructor(
    public readonly code: 'CONFIGURATION' | 'PLATFORM_UNSUPPORTED' | 'TIMEOUT' | 'TEMPORARY_FAILURE' | 'INVALID_RESPONSE',
    message: string,
  ) {
    super(message)
    this.name = 'TaskCloudError'
  }
}

function cloudRuntime() {
  const runtime = runtimeForTesting ?? (globalThis as typeof globalThis & { wx?: TaskCloudRuntime }).wx
  if (!runtime?.cloud) throw new TaskCloudError('PLATFORM_UNSUPPORTED', '当前环境暂不支持微信云开发')
  return runtime.cloud
}

function initialize(): void {
  if (initialized) return
  const environmentId = environmentForTesting ?? cloudEnvironmentId
  if (!(environmentForTesting === undefined ? hasCloudEnvironment() : environmentId.trim().length > 0)) {
    throw new TaskCloudError('CONFIGURATION', '尚未配置微信云开发测试环境')
  }
  cloudRuntime().init({ env: environmentId })
  initialized = true
}

// === 严格响应校验器 ===
// 与 household-cloud 模式一致：每条响应字段都明确枚举，
// 任何超出白名单的字段（householdId / actorKey / _id 等内部键）都会被拒绝。

const TASK_TYPES_SET: ReadonlySet<string> = new Set(['low_stock', 'to_handle', 'expiring'])
const TASK_STATUSES_OPEN_SET: ReadonlySet<string> = new Set(['pending', 'claimed'])
const TASK_STATUSES_TERMINAL_SET: ReadonlySet<string> = new Set(['completed', 'abandoned'])
const TASK_EVENT_KINDS_SET: ReadonlySet<string> = new Set(['create', 'claim', 'complete', 'abandon', 'edit'])
const TASK_EDIT_FIELDS_SET: ReadonlySet<string> = new Set(['name', 'type', 'dueDate', 'note'])

/** 评论文本最长 200 字（PRD 006 R10），与 PRD 005 note 的 100 字区分。 */
export const TASK_COMMENT_MAX_LENGTH = 200

function isBuiltinPersonAvatarId(value: unknown): value is string {
  // 接受默认中性头像 'person-neutral' 和数字编号 'person-01'..'person-99'。
  // 数字编号来自 src/static/brand 的具体素材；中性头像用于 profile 还没设置
  // avatar 的情况（新建任务的事件 actor 经常是这种）。
  if (typeof value !== 'string') return false
  if (value === 'person-neutral') return true
  return /^person-\d{2}$/.test(value)
}

function isAssigneeDisplay(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const a = value as { nickname?: unknown; avatar?: { kind?: unknown; id?: unknown } }
  return typeof a.nickname === 'string'
    && a.avatar?.kind === 'builtin'
    && isBuiltinPersonAvatarId(a.avatar?.id)
}

function isTaskEvent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const e = value as { kind?: unknown; actor?: unknown; at?: unknown; changedFields?: unknown }
  if (typeof e.kind !== 'string' || !TASK_EVENT_KINDS_SET.has(e.kind)) return false
  if (!isAssigneeDisplay(e.actor)) return false
  if (typeof e.at !== 'string') return false
  // edit 事件必须有 changedFields 数组（可以为空数组表示"空操作不展示"，R5 兜底）
  if (e.kind === 'edit') {
    if (!Array.isArray(e.changedFields)) return false
    if (!e.changedFields.every((f) => typeof f === 'string' && TASK_EDIT_FIELDS_SET.has(f))) return false
  } else {
    // 非 edit 事件不应携带 changedFields
    if (e.changedFields !== undefined) return false
  }
  return true
}

function isTaskComment(value: unknown): value is TaskComment {
  if (!value || typeof value !== 'object') return false
  if (!hasNoInternalKeys(value)) return false
  const c = value as { id?: unknown; actor?: unknown; text?: unknown; at?: unknown }
  return typeof c.id === 'string'
    && isAssigneeDisplay(c.actor)
    && typeof c.text === 'string'
    && c.text.length >= 1
    && c.text.length <= TASK_COMMENT_MAX_LENGTH
    && c.text.trim().length >= 1
    && typeof c.at === 'string'
}

// 已知内部键：禁止出现在任何前端可识别的响应里。
// 严格响应校验不仅看"白名单字段",也主动拒绝携带内部键的伪造响应。
const FORBIDDEN_INTERNAL_KEYS = ['householdId', 'actorKey', '_id', 'memberKeys', 'assigneeKey', 'ownerKey'] as const

function hasNoInternalKeys(value: object): boolean {
  for (const key of FORBIDDEN_INTERNAL_KEYS) {
    if (key in value) return false
  }
  return true
}

function isTaskSummary(value: unknown): value is TaskSummary {
  if (!value || typeof value !== 'object') return false
  if (!hasNoInternalKeys(value)) return false
  const t = value as {
    id?: unknown; type?: unknown; title?: unknown;
    dueDate?: unknown; isOverdueOrToday?: unknown;
    assignee?: unknown; status?: unknown;
  }
  return typeof t.id === 'string'
    && typeof t.type === 'string' && TASK_TYPES_SET.has(t.type)
    && typeof t.title === 'string'
    && (t.dueDate === undefined || (typeof t.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate)))
    && typeof t.isOverdueOrToday === 'boolean'
    && (t.assignee === undefined || isAssigneeDisplay(t.assignee))
    && typeof t.status === 'string' && TASK_STATUSES_OPEN_SET.has(t.status)
}

function isTaskDetail(value: unknown): value is TaskDetail {
  if (!value || typeof value !== 'object') return false
  if (!hasNoInternalKeys(value)) return false
  const d = value as {
    id?: unknown; type?: unknown; title?: unknown;
    dueDate?: unknown; isOverdueOrToday?: unknown;
    assignee?: unknown; status?: unknown;
    note?: unknown; events?: unknown;
    terminalAt?: unknown; terminalActor?: unknown; terminalKind?: unknown;
    comments?: unknown; editVersion?: unknown;
  }
  if (typeof d.id !== 'string') return false
  if (typeof d.type !== 'string' || !TASK_TYPES_SET.has(d.type)) return false
  if (typeof d.title !== 'string') return false
  if (d.dueDate !== undefined && (typeof d.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.dueDate))) return false
  if (typeof d.isOverdueOrToday !== 'boolean') return false
  if (d.assignee !== undefined && !isAssigneeDisplay(d.assignee)) return false
  if (d.note !== undefined && typeof d.note !== 'string') return false
  if (!Array.isArray(d.events) || !d.events.every(isTaskEvent)) return false
  // PRD 006：详情必含 comments 数组（空时为 []）和 editVersion 数字
  if (!Array.isArray(d.comments) || !d.comments.every(isTaskComment)) return false
  if (typeof d.editVersion !== 'number' || !Number.isInteger(d.editVersion) || d.editVersion < 0) return false
  if (typeof d.status !== 'string') return false
  // 待处理 / 已认领：必须有负责人字段(可选)但不能带终止字段
  if (d.status === 'pending' || d.status === 'claimed') return true
  // 终止态：必须带 terminalAt / terminalActor / terminalKind
  if (!TASK_STATUSES_TERMINAL_SET.has(d.status)) return false
  if (typeof d.terminalAt !== 'string') return false
  if (!isAssigneeDisplay(d.terminalActor)) return false
  return typeof d.terminalKind === 'string' && TASK_STATUSES_TERMINAL_SET.has(d.terminalKind)
}

function isCompletedTaskItem(value: unknown): value is CompletedTaskItem {
  if (!value || typeof value !== 'object') return false
  if (!hasNoInternalKeys(value)) return false
  const t = value as { id?: unknown; type?: unknown; title?: unknown; terminalAt?: unknown; terminalActor?: unknown; terminalKind?: unknown }
  return typeof t.id === 'string'
    && typeof t.type === 'string' && TASK_TYPES_SET.has(t.type)
    && typeof t.title === 'string'
    && typeof t.terminalAt === 'string'
    && isAssigneeDisplay(t.terminalActor)
    && typeof t.terminalKind === 'string' && TASK_STATUSES_TERMINAL_SET.has(t.terminalKind)
}

function isCurrentTasks(value: unknown): value is CurrentTasks {
  if (!value || typeof value !== 'object') return false
  if (!hasNoInternalKeys(value)) return false
  const g = value as {
    priority?: unknown;
    groups?: { low_stock?: unknown; to_handle?: unknown; expiring?: unknown };
  }
  if (g.groups === undefined || typeof g.groups !== 'object') return false
  if (!hasNoInternalKeys(g.groups)) return false
  return Array.isArray(g.priority) && g.priority.every(isTaskSummary)
    && Array.isArray(g.groups.low_stock) && g.groups.low_stock.every(isTaskSummary)
    && Array.isArray(g.groups.to_handle) && g.groups.to_handle.every(isTaskSummary)
    && Array.isArray(g.groups.expiring) && g.groups.expiring.every(isTaskSummary)
}

// === 结果联合校验 ===
// 终态 action 完成后云端只回 taskId + terminalAt；非终态 action 回完整 task。

function isFailureStatus(status: unknown): boolean {
  return typeof status === 'string'
    && ['TASK_INVALID_REQUEST', 'TASK_NOT_FOUND', 'TASK_FORBIDDEN', 'TASK_TERMINAL', 'TASK_DUPLICATE_OPERATION', 'TASK_TEMPORARY_FAILURE'].includes(status)
}

function isTaskResult(value: unknown): value is TaskResult {
  if (!value || typeof value !== 'object') return false
  const r = value as { status?: unknown; retryable?: unknown; errorMessage?: unknown }
  if (typeof r.status !== 'string' || typeof r.retryable !== 'boolean') return false
  if (r.status === 'CREATED' || r.status === 'CLAIMED') return isTaskSummary((value as { task?: unknown }).task)
  if (r.status === 'COMPLETED' || r.status === 'ABANDONED') {
    return typeof (value as { taskId?: unknown }).taskId === 'string'
      && typeof (value as { terminalAt?: unknown }).terminalAt === 'string'
  }
  if (r.status === 'LOADED') return isTaskDetail((value as { detail?: unknown }).detail)
  if (r.status === 'LISTED') {
    // LISTED 状态有两条形态：listCurrent 返回 { current }；listCompleted 返回 { items, nextCursor }。
    const v = value as { current?: unknown; items?: unknown; nextCursor?: unknown }
    if (v.current !== undefined) {
      return typeof v.current === 'object' && v.current !== null && isCurrentTasks(v.current)
    }
    if (v.items !== undefined) {
      if (!Array.isArray(v.items) || !v.items.every(isCompletedTaskItem)) return false
      return v.nextCursor === undefined || typeof v.nextCursor === 'string'
    }
    return false
  }
  // PRD 006：编辑返回 { task, events, editVersion }
  if (r.status === 'UPDATED') {
    const v = value as { task?: unknown; events?: unknown; editVersion?: unknown }
    return isTaskSummary(v.task)
      && Array.isArray(v.events) && v.events.every(isTaskEvent)
      && typeof v.editVersion === 'number' && Number.isInteger(v.editVersion) && v.editVersion >= 0
  }
  // PRD 006：评论返回 { detail }（含最新 comments 数组与 editVersion）
  if (r.status === 'COMMENTED') {
    return isTaskDetail((value as { detail?: unknown }).detail)
  }
  if (isFailureStatus(r.status)) return typeof r.errorMessage === 'string'
  return false
}

// === action 客户端 ===

type TaskAction =
  | 'create'
  | 'claim'
  | 'complete'
  | 'abandon'
  | 'update'
  | 'addComment'
  | 'getDetail'
  | 'listCurrent'
  | 'listCompleted'

async function call(action: TaskAction, input: object): Promise<TaskResult> {
  initialize()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const response = await Promise.race([
      cloudRuntime().callFunction({ name: 'task', data: { action, ...input } }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TaskCloudError('TIMEOUT', '事项结果仍在确认中')), timeoutMs)
      }),
    ])
    if (!isTaskResult(response.result)) throw new TaskCloudError('INVALID_RESPONSE', '云端返回的事项资料无效')
    return response.result
  } catch (error) {
    if (error instanceof TaskCloudError) throw error
    throw new TaskCloudError('TEMPORARY_FAILURE', '暂时无法连接事项服务，请稍后重试')
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const createTaskInCloud = (input: CreateTaskRequest) => call('create', input)
export const claimTaskInCloud = (input: ClaimTaskRequest) => call('claim', input)
export const completeTaskInCloud = (input: CompleteTaskRequest) => call('complete', input)
export const abandonTaskInCloud = (input: AbandonTaskRequest) => call('abandon', input)
export const updateTaskInCloud = (input: UpdateTaskRequest) => call('update', input)
export const addCommentInCloud = (input: AddCommentRequest) => call('addComment', input)
export const getTaskDetailInCloud = (taskId: string) => call('getDetail', { taskId })
export const listCurrentTasksInCloud = () => call('listCurrent', {})
export const listCompletedTasksInCloud = (input: ListCompletedRequest) => call('listCompleted', input)

// === 实时推送（PRD 006 U5：仅评论接 db.watch） ===
// 微信云的 db.watch 走 SSE 通道，回调里拿到完整文档快照；
// 我们只关心 comments 字段变化，其他字段（title/type/dueDate/note/status）
// 不在这里合并，避免覆盖正在进行的编辑草稿。

export interface TaskCommentsCallbacks {
  /** 当 watch 推送新评论时触发（已是合法 TaskComment 数组；空数组是初次 init）。 */
  onComments: (comments: TaskComment[]) => void
  /** watch 出错时触发（连接断开、权限问题等）。UI 不应弹 toast——静默回退到 onShow 重拉。 */
  onError?: (err: unknown) => void
}

/** 订阅指定事项的 comments 字段变化。返回 watcher；调用方负责在 unmount 时 close。 */
export function subscribeTaskComments(taskId: string, callbacks: TaskCommentsCallbacks): Watcher {
  initialize()
  const db = cloudRuntime().database
  if (!db) {
    callbacks.onError?.(new TaskCloudError('PLATFORM_UNSUPPORTED', '当前环境暂不支持云端实时数据'))
    return { close: () => undefined }
  }
  return db.collection('tasks').doc(taskId).watch({
    onChange(snapshot) {
      // R33：只读 docs[0].comments；其他字段变化忽略
      if (!Array.isArray(snapshot?.docs) || snapshot.docs.length === 0) {
        callbacks.onComments([])
        return
      }
      const doc = snapshot.docs[0]
      if (!doc || typeof doc !== 'object') {
        callbacks.onComments([])
        return
      }
      const commentsRaw = (doc as { comments?: unknown }).comments
      if (!Array.isArray(commentsRaw)) {
        callbacks.onComments([])
        return
      }
      // R29：每条都过 isTaskComment 严格校验；不合法丢弃
      const safe: TaskComment[] = []
      for (const c of commentsRaw) {
        if (isTaskComment(c)) safe.push(c)
      }
      callbacks.onComments(safe)
    },
    onError(err) {
      // R30：连接断开静默回退，不弹错误
      callbacks.onError?.(err)
    },
  })
}

// === 测试钩子 ===

export function resetTaskCloudForTesting(): void {
  initialized = false
  timeoutMs = 10_000
  runtimeForTesting = undefined
  environmentForTesting = undefined
}
export function setTaskCloudRuntimeForTesting(runtime?: TaskCloudRuntime): void { runtimeForTesting = runtime }
export function setTaskCloudEnvironmentForTesting(environment?: string): void { environmentForTesting = environment }
export function setTaskCloudTimeoutForTesting(value: number): void { timeoutMs = value }

// 仅供测试导出，不在生产代码中使用
export const __testing = {
  isTaskSummary,
  isTaskDetail,
  isCompletedTaskItem,
  isCurrentTasks,
  isTaskResult,
  isAssigneeDisplay,
  isTaskEvent,
  isTaskComment,
  TASK_COMMENT_MAX_LENGTH,
}
