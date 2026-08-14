// 事项模块的统一类型契约。
// 类型只暴露前端需要的展示字段；云端内部身份键（householdId / actorKey）不出现在这里，
// 任何携带内部键的响应都会被 service 层的 isTask* 校验拒绝。

/** 事项类型，PRD 005 固定三种；UI 颜色和分组顺序与 src/utils/task-text 配合。 */
export type TaskType = 'low_stock' | 'to_handle' | 'expiring'

export const TASK_TYPES: readonly TaskType[] = ['low_stock', 'to_handle', 'expiring'] as const

/** 事项状态机，PRD 005 状态机一对应：pending → claimed → (completed | abandoned)。 */
export type TaskStatus = 'pending' | 'claimed' | 'completed' | 'abandoned'

/** 仅出现在首页"待处理"区域的状态：未终止的事项。 */
export type OpenTaskStatus = Extract<TaskStatus, 'pending' | 'claimed'>

/** 终止态：进入"已完成"列表；永久保留。 */
export type TerminalTaskStatus = Extract<TaskStatus, 'completed' | 'abandoned'>

/** 事件类型，按时间倒序在详情页底部展示。 */
export type TaskEventKind = 'create' | 'claim' | 'complete' | 'abandon'

/** 负责人展示昵称，pending 时为 undefined。 */
export interface AssigneeDisplay {
  nickname: string
  avatar: { kind: 'builtin'; id: string }
}

/** 首页列表条目：名称、类型、截止日期、负责人昵称、状态。不含家庭或事项内部编号。 */
export interface TaskSummary {
  id: string
  type: TaskType
  title: string
  /** yyyy-MM-dd 字符串；无日期时为 undefined。 */
  dueDate?: string
  /** 截止日期是否属于"今天"或"已逾期"，由云端在 listCurrentTasks 中预计算；前端只渲染。 */
  isOverdueOrToday: boolean
  /** 无负责人时为 undefined。 */
  assignee?: AssigneeDisplay
  status: OpenTaskStatus
}

/** 详情页：summary + 备注 + 操作记录。events 按时间倒序（最新在前）。 */
export interface TaskDetail extends TaskSummary {
  note?: string
  /** 创建/认领/完成/放弃的事件流；终止态事件在末尾。 */
  events: TaskEvent[]
  /** 终止时间和动作人；未终止时为 undefined。 */
  terminalAt?: string
  terminalActor?: AssigneeDisplay
  /** 'completed' 或 'abandoned'；未终止时为 undefined。 */
  terminalKind?: TerminalTaskStatus
}

/** 已完成/已放弃列表条目；用于"我们的家→已完成"分页。 */
export interface CompletedTaskItem {
  id: string
  type: TaskType
  title: string
  /** 完成或放弃时间，ISO 字符串。 */
  terminalAt: string
  /** 实际完成或放弃人。 */
  terminalActor: AssigneeDisplay
  /** 'completed' 或 'abandoned'。 */
  terminalKind: TerminalTaskStatus
}

/** 首页分组结构：priority + 三个类型分组。priority 中可能含今天/逾期的所有类型。 */
export interface CurrentTasks {
  priority: TaskSummary[]
  groups: {
    low_stock: TaskSummary[]
    to_handle: TaskSummary[]
    expiring: TaskSummary[]
  }
}

/** 通用操作结果：有限状态联合，UI 根据 status 收敛。 */
export type TaskResultStatus = 'TASK_INVALID_REQUEST' | 'TASK_NOT_FOUND' | 'TASK_FORBIDDEN' | 'TASK_TERMINAL' | 'TASK_DUPLICATE_OPERATION' | 'TASK_TEMPORARY_FAILURE' | 'CREATED' | 'CLAIMED' | 'COMPLETED' | 'ABANDONED' | 'LOADED' | 'LISTED'

export interface TaskResultBase {
  status: TaskResultStatus
  retryable: boolean
}

export interface TaskCreatedResult extends TaskResultBase {
  status: 'CREATED'
  task: TaskSummary
}

export interface TaskClaimedResult extends TaskResultBase {
  status: 'CLAIMED'
  task: TaskSummary
}

export interface TaskCompletedResult extends TaskResultBase {
  status: 'COMPLETED'
  taskId: string
  terminalAt: string
}

export interface TaskAbandonedResult extends TaskResultBase {
  status: 'ABANDONED'
  taskId: string
  terminalAt: string
}

export interface TaskLoadedResult extends TaskResultBase {
  status: 'LOADED'
  detail: TaskDetail
}

export interface TaskListedResult extends TaskResultBase {
  status: 'LISTED'
  current: CurrentTasks
}

export interface TaskCompletedListResult extends TaskResultBase {
  status: 'LISTED'
  items: CompletedTaskItem[]
  nextCursor?: string
}

export interface TaskFailureResult extends TaskResultBase {
  status: Exclude<TaskResultStatus, 'CREATED' | 'CLAIMED' | 'COMPLETED' | 'ABANDONED' | 'LOADED' | 'LISTED'>
  errorMessage: string
}

export type TaskResult =
  | TaskCreatedResult
  | TaskClaimedResult
  | TaskCompletedResult
  | TaskAbandonedResult
  | TaskLoadedResult
  | TaskListedResult
  | TaskCompletedListResult
  | TaskFailureResult

/** 新建请求：名称、类型、可选截止日期、可选备注。负责人和事件由服务端推导。 */
export interface CreateTaskRequest {
  title: string
  type: TaskType
  dueDate?: string
  note?: string
  requestId: string
  operationToken: string
}

export interface ClaimTaskRequest {
  taskId: string
  requestId: string
  operationToken: string
}

export interface CompleteTaskRequest {
  taskId: string
  requestId: string
  operationToken: string
}

export interface AbandonTaskRequest {
  taskId: string
  requestId: string
  operationToken: string
}

export interface ListCompletedRequest {
  limit: number
  cursor?: string
}

/** 详情页事件：动作人昵称 + 动作 + 时间；不含 actorKey 内部键。 */
export interface TaskEvent {
  kind: TaskEventKind
  actor: AssigneeDisplay
  at: string
}
