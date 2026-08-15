import { cloudEnvironmentId, hasCloudEnvironment } from '../config/cloud'
import type {
  AbandonTaskRequest,
  ClaimTaskRequest,
  CompleteTaskRequest,
  CompletedTaskItem,
  CreateTaskRequest,
  CurrentTasks,
  ListCompletedRequest,
  TaskDetail,
  TaskResult,
  TaskSummary,
  TaskType,
} from '../types/task'

// 任务模块的云端客户端：
// 1) 严格校验响应，防止云端任意文字或伪造字段进入页面；
// 2) 沿用 household-cloud 的初始化/超时/测试注入模式；
// 3) 每次调用携带 requestId + operationToken，由云端做幂等去重。

interface TaskCloudRuntime {
  cloud?: {
    init(options: { env: string }): void
    callFunction(options: { name: string; data: Record<string, unknown> }): Promise<{ result: unknown }>
  }
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
const TASK_EVENT_KINDS_SET: ReadonlySet<string> = new Set(['create', 'claim', 'complete', 'abandon'])

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
  const e = value as { kind?: unknown; actor?: unknown; at?: unknown }
  return typeof e.kind === 'string'
    && TASK_EVENT_KINDS_SET.has(e.kind)
    && isAssigneeDisplay(e.actor)
    && typeof e.at === 'string'
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
  }
  if (typeof d.id !== 'string') return false
  if (typeof d.type !== 'string' || !TASK_TYPES_SET.has(d.type)) return false
  if (typeof d.title !== 'string') return false
  if (d.dueDate !== undefined && (typeof d.dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.dueDate))) return false
  if (typeof d.isOverdueOrToday !== 'boolean') return false
  if (d.assignee !== undefined && !isAssigneeDisplay(d.assignee)) return false
  if (d.note !== undefined && typeof d.note !== 'string') return false
  if (!Array.isArray(d.events) || !d.events.every(isTaskEvent)) return false
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
  if (isFailureStatus(r.status)) return typeof r.errorMessage === 'string'
  return false
}

// === action 客户端 ===

type TaskAction =
  | 'create'
  | 'claim'
  | 'complete'
  | 'abandon'
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
export const getTaskDetailInCloud = (taskId: string) => call('getDetail', { taskId })
export const listCurrentTasksInCloud = () => call('listCurrent', {})
export const listCompletedTasksInCloud = (input: ListCompletedRequest) => call('listCompleted', input)

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
}
