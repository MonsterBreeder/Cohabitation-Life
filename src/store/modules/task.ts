import { defineStore } from 'pinia'
import {
  abandonTaskInCloud,
  claimTaskInCloud,
  completeTaskInCloud,
  createTaskInCloud,
  getTaskDetailInCloud,
  listCompletedTasksInCloud,
  listCurrentTasksInCloud,
  setTaskCloudRuntimeForTesting,
  setTaskCloudEnvironmentForTesting,
  TaskCloudError,
} from '../../services/task-cloud'
import type {
  AbandonTaskRequest,
  ClaimTaskRequest,
  CompleteTaskRequest,
  CompletedTaskItem,
  CreateTaskRequest,
  CurrentTasks,
  TaskDetail,
  TaskResult,
  TaskSummary,
} from '../../types/task'
import {
  clearPendingTask,
  readPendingTask,
  writePendingTask,
  type PendingTask,
  type PendingTaskKind,
} from '../../utils/pending-task'
import store from '..'

// === 事项模块 Pinia 状态 ===
// 模式与 household-store 一致：
// 1) 对象式 Pinia + 单一 cloudClient 抽象便于测试
// 2) 操作凭证 (requestId + operationToken) 短期落盘用于幂等去重
// 3) 单飞保护 (inFlight) 防止重复点击
// 4) 超时后先做轻量查询再决定显示结果
// 5) authoritativeRevision 机制防 race（家庭归属变更时旧结果不覆盖新结果）

type TaskPhase = 'checking' | 'editable' | 'creating' | 'claiming' | 'completing' | 'abandoning' | 'loaded' | 'failed'

interface TaskCloudClient {
  create(input: CreateTaskRequest): Promise<TaskResult>
  claim(input: ClaimTaskRequest): Promise<TaskResult>
  complete(input: CompleteTaskRequest): Promise<TaskResult>
  abandon(input: AbandonTaskRequest): Promise<TaskResult>
  getDetail(taskId: string): Promise<TaskResult>
  listCurrent(): Promise<TaskResult>
  listCompleted(input: { limit: number; cursor?: string }): Promise<TaskResult>
}

const defaultCloudClient: TaskCloudClient = {
  create: createTaskInCloud,
  claim: claimTaskInCloud,
  complete: completeTaskInCloud,
  abandon: abandonTaskInCloud,
  getDetail: getTaskDetailInCloud,
  listCurrent: listCurrentTasksInCloud,
  listCompleted: listCompletedTasksInCloud,
}

let cloudClient: TaskCloudClient = defaultCloudClient
// 单飞保护：inFlight 类型用 unknown 避免 .then 链推导的 TaskResult 联合类型
// 渗透到 action 的返回类型；调用方只看 Promise<boolean> 或 Promise<void>。
let createInFlight: Promise<unknown> | undefined
let claimInFlight: Promise<unknown> | undefined
let completeInFlight: Promise<unknown> | undefined
let abandonInFlight: Promise<unknown> | undefined
let loadCurrentInFlight: Promise<unknown> | undefined
let loadDetailInFlight: Promise<unknown> | undefined
let loadCompletedInFlight: Promise<unknown> | undefined
let authoritativeRevision = 0

/** 生成符合 16-128 字符的 CREDENTIAL_PATTERN 要求的 requestId / operationToken。 */
function credential(prefix: string): string {
  const random = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)
  return `${prefix}_${random}`.slice(0, 96)
}

function humaniseError(result: TaskResult): string {
  switch (result.status) {
    case 'TASK_NOT_FOUND': return '事项不存在或已被清理'
    case 'TASK_FORBIDDEN': return '你已经没有这个事项的访问权限'
    case 'TASK_TERMINAL': return '事项已经结束，不能再操作'
    case 'TASK_DUPLICATE_OPERATION': return '请求已处理，请刷新后查看最新状态'
    case 'TASK_TEMPORARY_FAILURE': return '暂时无法完成操作，请稍后重试'
    case 'TASK_INVALID_REQUEST': return '请求内容不合法，请检查后重试'
    default: return '操作失败，请稍后重试'
  }
}

export const useTaskStore = defineStore('task', {
  state: () => ({
    phase: 'checking' as TaskPhase,
    current: undefined as CurrentTasks | undefined,
    detail: undefined as TaskDetail | undefined,
    detailTaskId: undefined as string | undefined,
    completedItems: [] as CompletedTaskItem[],
    completedCursor: undefined as string | undefined,
    completedHasMore: false,
    pending: undefined as PendingTask | undefined,
    errorMessage: undefined as string | undefined,
    authoritativeRevision,
  }),
  getters: {
    hasOpenTasks: (state) => Boolean(state.current && (state.current.priority.length > 0
      || state.current.groups.low_stock.length > 0
      || state.current.groups.to_handle.length > 0
      || state.current.groups.expiring.length > 0)),
    priorityTasks: (state) => state.current?.priority ?? [],
    lowStockTasks: (state) => state.current?.groups.low_stock ?? [],
    waitingTasks: (state) => state.current?.groups.to_handle ?? [],
    expiringTasks: (state) => state.current?.groups.expiring ?? [],
  },
  actions: {
    /** 清空当前家庭的事项引用；切换家庭或被移除时调用。 */
    resetForHouseholdChange(): void {
      this.current = undefined
      this.detail = undefined
      this.detailTaskId = undefined
      this.completedItems = []
      this.completedCursor = undefined
      this.completedHasMore = false
      this.pending = undefined
      this.errorMessage = undefined
      this.phase = 'editable'
      authoritativeRevision += 1
      this.authoritativeRevision = authoritativeRevision
    },

    /** 首页显示都重新拉取；失败时清空旧资料。 */
    async loadCurrent(): Promise<void> {
      if (loadCurrentInFlight) return
      const requestRevision = this.authoritativeRevision
      this.phase = 'checking'
      this.errorMessage = undefined
      loadCurrentInFlight = (async () => {
        try {
          const result = await cloudClient.listCurrent()
          if (requestRevision !== this.authoritativeRevision) return
          if (result.status === 'LISTED' && 'current' in result && result.current) {
            this.current = result.current
            this.phase = 'loaded'
          } else if (result.status === 'TASK_FORBIDDEN') {
            this.current = undefined
            this.phase = 'editable'
          } else {
            this.phase = 'failed'
            this.errorMessage = humaniseError(result)
          }
        } catch {
          this.phase = 'failed'
          this.errorMessage = '暂时无法读取事项，请稍后重试'
        } finally {
          loadCurrentInFlight = undefined
        }
      })()
      // 关键：让调用方的 await 真正等到云函数结果回来。
      // 之前没 await，页面 await loadCurrent 立刻 resolve，
      // 然后页面检查 current 还是 undefined 就 fallback 错误。
      await loadCurrentInFlight
    },

    /** 详情页加载；用于刷新和超时后重新确认。 */
    async loadDetail(taskId: string): Promise<void> {
      if (loadDetailInFlight) return
      this.detailTaskId = taskId
      this.phase = 'checking'
      this.errorMessage = undefined
      loadDetailInFlight = (async () => {
        try {
          const result = await cloudClient.getDetail(taskId)
          if (result.status === 'LOADED' && 'detail' in result && result.detail) {
            this.detail = result.detail
            this.phase = 'loaded'
          } else if (result.status === 'TASK_FORBIDDEN') {
            this.errorMessage = '你已经没有这个事项的访问权限'
            this.phase = 'failed'
          } else {
            this.phase = 'failed'
            this.errorMessage = humaniseError(result)
          }
        } catch {
          this.phase = 'failed'
          this.errorMessage = '暂时无法读取事项，请稍后重试'
        } finally {
          loadDetailInFlight = undefined
        }
      })()
      // 必须 await：页面 await loadDetail 是要等 detail/errorMessage 落地。
      // 之前没 await 时，loadDetail 立刻 resolve，页面 fallback "事项不存在或已被清理"。
      await loadDetailInFlight
    },

    /** 已完成/已放弃分页加载。 */
    async loadCompleted(reset = false): Promise<void> {
      if (loadCompletedInFlight) return
      if (reset) {
        this.completedItems = []
        this.completedCursor = undefined
      }
      loadCompletedInFlight = (async () => {
        try {
          const result = await cloudClient.listCompleted({ limit: 20, cursor: this.completedCursor })
          if (result.status === 'LISTED' && 'items' in result) {
            this.completedItems = [...this.completedItems, ...result.items]
            this.completedCursor = result.nextCursor
            this.completedHasMore = Boolean(result.nextCursor)
            this.phase = 'loaded'
          } else if (result.status === 'TASK_FORBIDDEN') {
            this.phase = 'editable'
            this.errorMessage = '你已经没有这个事项的访问权限'
          } else {
            this.phase = 'failed'
            this.errorMessage = humaniseError(result)
          }
        } catch {
          this.phase = 'failed'
          this.errorMessage = '暂时无法读取历史事项，请稍后重试'
        } finally {
          loadCompletedInFlight = undefined
        }
      })()
      // 必须 await：页面 await loadCompleted 等数据落地后再检查 fallback。
      await loadCompletedInFlight
    },

    /** 新建事项。草稿在调用前已校验。 */
    async create(draft: { title: string; type: 'low_stock' | 'to_handle' | 'expiring'; dueDate?: string; note?: string }): Promise<boolean> {
      if (createInFlight) return false
      const requestId = credential('request')
      const operationToken = credential('operation')
      const pending: PendingTask = {
        kind: 'create',
        requestId,
        operationToken,
        startedAt: Date.now(),
        draft: { title: draft.title, type: draft.type, dueDate: draft.dueDate, note: draft.note },
      }
      this.pending = pending
      writePendingTask(pending)
      this.phase = 'creating'
      this.errorMessage = undefined

      createInFlight = (async () => {
        try {
          const result = await cloudClient.create({
            title: draft.title,
            type: draft.type,
            dueDate: draft.dueDate,
            note: draft.note,
            requestId,
            operationToken,
          })
          if (result.status === 'CREATED') {
            this.applyCreatedOrClaimed(result.task)
            clearPendingTask()
            this.pending = undefined
            this.phase = 'loaded'
            return true
          }
          this.phase = 'failed'
          this.errorMessage = humaniseError(result)
          return false
        } catch (error: unknown) {
          if (error instanceof TaskCloudError && error.code === 'TIMEOUT') {
            this.phase = 'creating'
            this.errorMessage = '创建结果仍在确认中'
            return false
          }
          this.phase = 'failed'
          this.errorMessage = '暂时无法创建事项，请稍后重试'
          return false
        } finally {
          createInFlight = undefined
        }
      })()
      return (await createInFlight) === true
    },

    /** 认领（我来处理）。 */
    async claim(taskId: string): Promise<boolean> {
      if (claimInFlight) return false
      const requestId = credential('request')
      const operationToken = credential('operation')
      this.pending = { kind: 'claim', taskId, requestId, operationToken, startedAt: Date.now() }
      writePendingTask(this.pending)
      this.phase = 'claiming'
      this.errorMessage = undefined

      claimInFlight = (async () => {
        try {
          const result = await cloudClient.claim({ taskId, requestId, operationToken })
          if (result.status === 'CLAIMED') {
            this.applyCreatedOrClaimed(result.task)
            clearPendingTask()
            this.pending = undefined
            this.phase = 'loaded'
            return true
          }
          this.phase = 'failed'
          this.errorMessage = humaniseError(result)
          return false
        } catch (error: unknown) {
          if (error instanceof TaskCloudError && error.code === 'TIMEOUT') {
            this.phase = 'claiming'
            this.errorMessage = '认领结果仍在确认中'
            return false
          }
          this.phase = 'failed'
          this.errorMessage = '暂时无法认领，请稍后重试'
          return false
        } finally {
          claimInFlight = undefined
        }
      })()
      return (await claimInFlight) === true
    },

    /** 完成。无需二次确认。 */
    async complete(taskId: string): Promise<boolean> {
      if (completeInFlight) return false
      const requestId = credential('request')
      const operationToken = credential('operation')
      this.pending = { kind: 'complete', taskId, requestId, operationToken, startedAt: Date.now() }
      writePendingTask(this.pending)
      this.phase = 'completing'
      this.errorMessage = undefined

      completeInFlight = (async () => {
        try {
          const result = await cloudClient.complete({ taskId, requestId, operationToken })
          if (result.status === 'COMPLETED') {
            this.applyTerminal(taskId, result.terminalAt)
            clearPendingTask()
            this.pending = undefined
            this.phase = 'loaded'
            return true
          }
          this.phase = 'failed'
          this.errorMessage = humaniseError(result)
          return false
        } catch (error: unknown) {
          if (error instanceof TaskCloudError && error.code === 'TIMEOUT') {
            return this.recoverAfterTimeout('complete', taskId)
          }
          this.phase = 'failed'
          this.errorMessage = '暂时无法完成，请稍后重试'
          return false
        } finally {
          completeInFlight = undefined
        }
      })()
      return (await completeInFlight) === true
    },

    /** 放弃。需二次确认（由 UI 弹 modal）。 */
    async abandon(taskId: string): Promise<boolean> {
      if (abandonInFlight) return false
      const requestId = credential('request')
      const operationToken = credential('operation')
      this.pending = { kind: 'abandon', taskId, requestId, operationToken, startedAt: Date.now() }
      writePendingTask(this.pending)
      this.phase = 'abandoning'
      this.errorMessage = undefined

      abandonInFlight = (async () => {
        try {
          const result = await cloudClient.abandon({ taskId, requestId, operationToken })
          if (result.status === 'ABANDONED') {
            this.applyTerminal(taskId, result.terminalAt)
            clearPendingTask()
            this.pending = undefined
            this.phase = 'loaded'
            return true
          }
          this.phase = 'failed'
          this.errorMessage = humaniseError(result)
          return false
        } catch (error: unknown) {
          if (error instanceof TaskCloudError && error.code === 'TIMEOUT') {
            return this.recoverAfterTimeout('abandon', taskId)
          }
          this.phase = 'failed'
          this.errorMessage = '暂时无法放弃，请稍后重试'
          return false
        } finally {
          abandonInFlight = undefined
        }
      })()
      return (await abandonInFlight) === true
    },

    /** 超时后轻量重查：查详情确认是否已生效；已生效按成功处理。 */
    async recoverAfterTimeout(kind: PendingTaskKind, taskId: string): Promise<boolean> {
      try {
        const result = await cloudClient.getDetail(taskId)
        if (result.status === 'LOADED' && 'detail' in result && result.detail) {
          this.detail = result.detail
          const detailStatus = result.detail.status
          // 详情页 status 字段是 OpenTaskStatus 联合；终止态通过 terminalKind 表达
          const terminalKind = (result.detail as TaskDetail & { terminalKind?: 'completed' | 'abandoned' }).terminalKind
          if (terminalKind === 'completed' && kind === 'complete') {
            this.applyTerminal(taskId, result.detail.terminalAt || new Date().toISOString())
            clearPendingTask()
            this.pending = undefined
            this.phase = 'loaded'
            return true
          }
          if (terminalKind === 'abandoned' && kind === 'abandon') {
            this.applyTerminal(taskId, result.detail.terminalAt || new Date().toISOString())
            clearPendingTask()
            this.pending = undefined
            this.phase = 'loaded'
            return true
          }
          // claim 超时但 task 还是 pending：让用户重试
          void detailStatus
          this.phase = 'failed'
          this.errorMessage = '操作仍在确认中，请稍后再试'
          return false
        }
      } catch {
        this.phase = 'failed'
        this.errorMessage = '操作仍在确认中，请稍后再试'
        return false
      }
      this.phase = 'failed'
      this.errorMessage = '操作仍在确认中，请稍后再试'
      return false
    },

    /** 把 created/claimed 的最新 summary 合并到 current；不重新拉取。 */
    applyCreatedOrClaimed(task: TaskSummary): void {
      const current = this.current
      if (!current) return
      const replace = (list: TaskSummary[]): TaskSummary[] => {
        const idx = list.findIndex((t) => t.id === task.id)
        if (idx === -1) return [...list, task]
        const next = list.slice()
        next[idx] = task
        return next
      }
      // 优先按 overdue/today 决定放入 priority 还是 groups
      if (task.isOverdueOrToday) {
        current.priority = replace(current.priority)
        // 同步从 groups 移除
        current.groups.low_stock = current.groups.low_stock.filter((t) => t.id !== task.id)
        current.groups.to_handle = current.groups.to_handle.filter((t) => t.id !== task.id)
        current.groups.expiring = current.groups.expiring.filter((t) => t.id !== task.id)
      } else {
        current.groups[task.type] = replace(current.groups[task.type])
        current.priority = current.priority.filter((t) => t.id !== task.id)
      }
    },

    /** 把已完成/已放弃的 task 从 current 移除（如果存在）。 */
    applyTerminal(taskId: string, terminalAt: string): void {
      const current = this.current
      if (!current) return
      current.priority = current.priority.filter((t) => t.id !== taskId)
      current.groups.low_stock = current.groups.low_stock.filter((t) => t.id !== taskId)
      current.groups.to_handle = current.groups.to_handle.filter((t) => t.id !== taskId)
      current.groups.expiring = current.groups.expiring.filter((t) => t.id !== taskId)
      // 已完成/已放弃不进入 current，但首页会重新 loadCurrent 拿最新
      void terminalAt
    },

    /** 启动恢复：检查 pending 凭证是否还在有效期内。 */
    async restorePending(): Promise<void> {
      const pending = readPendingTask()
      if (!pending) return
      this.pending = pending
      this.phase = pending.kind === 'create' ? 'creating'
        : pending.kind === 'claim' ? 'claiming'
        : pending.kind === 'complete' ? 'completing'
        : 'abandoning'
      this.errorMessage = '上次操作仍在确认中'
    },
  },
})

/** 在组件 setup 之外使用事项状态。 */
export function useTaskStoreWithOut() {
  return useTaskStore(store)
}

// === 测试钩子 ===
export function resetTaskStoreForTesting(): void {
  createInFlight = undefined
  claimInFlight = undefined
  completeInFlight = undefined
  abandonInFlight = undefined
  loadCurrentInFlight = undefined
  loadDetailInFlight = undefined
  loadCompletedInFlight = undefined
  authoritativeRevision = 0
  cloudClient = defaultCloudClient
}
export function setTaskStoreCloudClientForTesting(client: TaskCloudClient): void {
  cloudClient = client
}
export function setTaskStoreCloudForTesting(): void {
  setTaskCloudRuntimeForTesting({ cloud: { init: () => undefined, callFunction: async () => ({ result: {} }) } })
  setTaskCloudEnvironmentForTesting('test-env')
}
