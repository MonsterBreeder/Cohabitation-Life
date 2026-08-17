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
export type TaskEventKind = 'create' | 'claim' | 'complete' | 'abandon' | 'edit' | 'delete'

/** 编辑事件可标记的字段名。assignee 在 PRD 005 范围外，本期不参与编辑。 */
export type TaskEditField = 'name' | 'type' | 'dueDate' | 'note'

/** 负责人展示昵称，pending 时为 undefined。 */
export interface AssigneeDisplay {
  nickname: string
  avatar: { kind: 'builtin'; id: string }
}

/** TaskEvent 的公共基础字段，被各 kind 复用。 */
interface TaskEventBase {
  actor: AssigneeDisplay
  at: string
}

/** 状态转移类事件（create / claim / complete / abandon）：仅 kind + base。 */
interface TaskStateEvent extends TaskEventBase {
  kind: 'create' | 'claim' | 'complete' | 'abandon'
}

/** 编辑事件：kind='edit' + changedFields。 */
export interface TaskEditEvent extends TaskEventBase {
  kind: 'edit'
  changedFields: TaskEditField[]
}

/** 详情页事件：状态转移事件 + 编辑事件的有限联合。 */
export type TaskEvent = TaskStateEvent | TaskEditEvent

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

/** 单条评论。不可改不可删（PRD 006）。 */
export interface TaskComment {
  /** 云端生成的字符串 id，用于 watch 合并时去重。 */
  id: string
  actor: AssigneeDisplay
  /** 1-200 字符，受控文案校验。 */
  text: string
  /** 服务端时间，ISO 字符串。 */
  at: string
}

/** 详情页：summary + 备注 + 操作记录 + 评论。events 按时间倒序（最新在前）。 */
export interface TaskDetail extends TaskSummary {
  note?: string
  /** 创建/认领/完成/放弃/编辑的事件流；终止态事件在末尾。 */
  events: TaskEvent[]
  /** 终止时间和动作人；未终止时为 undefined。 */
  terminalAt?: string
  terminalActor?: AssigneeDisplay
  /** 'completed' 或 'abandoned'；未终止时为 undefined。 */
  terminalKind?: TerminalTaskStatus
  /** 评论数组；按 at 倒序。空时是 []，不是 undefined。 */
  comments: TaskComment[]
  /** 乐观锁：每次 updateTask 成功 +1；云端做 CAS 校验。 */
  editVersion: number
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
export type TaskResultStatus =
  | 'TASK_INVALID_REQUEST'
  | 'TASK_NOT_FOUND'
  | 'TASK_FORBIDDEN'
  | 'TASK_TERMINAL'
  | 'TASK_DUPLICATE_OPERATION'
  | 'TASK_TEMPORARY_FAILURE'
  | 'CREATED'
  | 'CLAIMED'
  | 'COMPLETED'
  | 'ABANDONED'
  | 'LOADED'
  | 'LISTED'
  | 'UPDATED'
  | 'COMMENTED'
  | 'DELETED'

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

/** 编辑字段结果：返回最新 summary + editVersion + 事件流（可能含新的 edit 事件）。 */
export interface TaskUpdatedResult extends TaskResultBase {
  status: 'UPDATED'
  task: TaskSummary
  /** 编辑后的事件流；UPDATED 时通常是 events 数组的完整新版本。 */
  events: TaskEvent[]
  /** 编辑后新的 editVersion，前端缓存用于下次 update 的 CAS。 */
  editVersion: number
}

/** 评论结果：返回最新 detail（含 comments 数组与 editVersion）。 */
export interface TaskCommentedResult extends TaskResultBase {
  status: 'COMMENTED'
  detail: TaskDetail
}

/** 删除结果：仅返回被软删的任务 id + 删除时间。前端不需要返回 doc（已过滤）。 */
export interface TaskDeletedResult extends TaskResultBase {
  status: 'DELETED'
  taskId: string
  deletedAt: string
}

export interface TaskFailureResult extends TaskResultBase {
  status: Exclude<TaskResultStatus, 'CREATED' | 'CLAIMED' | 'COMPLETED' | 'ABANDONED' | 'LOADED' | 'LISTED' | 'UPDATED' | 'COMMENTED' | 'DELETED'>
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
  | TaskUpdatedResult
  | TaskCommentedResult
  | TaskDeletedResult
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

/** 编辑请求：name / type / dueDate / note 至少 1 项；editVersion 用于 CAS。 */
export interface UpdateTaskRequest {
  taskId: string
  name?: string
  type?: TaskType
  dueDate?: string | null
  /** 备注允许空字符串 / null 表示清除。 */
  note?: string | null
  /** 当前 editVersion（来自详情或上次更新响应）；云端校验不匹配时返回 TASK_DUPLICATE_OPERATION。 */
  editVersion: number
  requestId: string
  operationToken: string
}

/** 评论请求：text 1-200 字符。 */
export interface AddCommentRequest {
  taskId: string
  text: string
  requestId: string
  operationToken: string
}

/** 删除请求：只对未终止事项生效；终态返回 TASK_TERMINAL。 */
export interface DeleteTaskRequest {
  taskId: string
  requestId: string
  operationToken: string
}
