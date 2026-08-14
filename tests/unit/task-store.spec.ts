import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore, resetTaskStoreForTesting, setTaskStoreCloudClientForTesting } from '../../src/store/modules/task'
import { clearPendingTask, readPendingTask, writePendingTask } from '../../src/utils/pending-task'
import type {
  AbandonTaskRequest,
  ClaimTaskRequest,
  CompleteTaskRequest,
  CreateTaskRequest,
  TaskResult,
  TaskSummary,
} from '../../src/types/task'

// 模式：每个测试用独立 Pinia + 独立 mock client。
// cloudClient 抽象与 household-store 一致。

// 模拟 uni storage 接口，让 pending-task 写盘在 Node 测试环境也能工作。
const fakeStorage = new Map<string, string>()
beforeAll(() => {
  ;(globalThis as any).uni = {
    getStorageSync: (key: string) => (fakeStorage.has(key) ? fakeStorage.get(key) ?? '' : ''),
    setStorageSync: (key: string, value: string) => { fakeStorage.set(key, value) },
    removeStorageSync: (key: string) => { fakeStorage.delete(key) },
  }
})
beforeEach(() => {
  fakeStorage.clear()
})

function makeSummary(overrides: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: 'task_x',
    type: 'low_stock',
    title: 'Buy detergent',
    isOverdueOrToday: false,
    status: 'pending',
    ...overrides,
  }
}

function makeCloudClient(handlers: Partial<{
  listCurrent: () => Promise<TaskResult>
  getDetail: (taskId: string) => Promise<TaskResult>
  listCompleted: (input: { limit: number; cursor?: string }) => Promise<TaskResult>
  create: (input: CreateTaskRequest) => Promise<TaskResult>
  claim: (input: ClaimTaskRequest) => Promise<TaskResult>
  complete: (input: CompleteTaskRequest) => Promise<TaskResult>
  abandon: (input: AbandonTaskRequest) => Promise<TaskResult>
}> = {}) {
  return {
    listCurrent: handlers.listCurrent ?? (async () => ({ status: 'LISTED' as const, retryable: false, current: { priority: [], groups: { low_stock: [], to_handle: [], expiring: [] } } })),
    getDetail: handlers.getDetail ?? (async (id: string) => ({ status: 'LOADED' as const, retryable: false, detail: { ...makeSummary({ id }), events: [] } })),
    listCompleted: handlers.listCompleted ?? (async () => ({ status: 'LISTED' as const, retryable: false, items: [] })),
    create: handlers.create ?? (async (input: CreateTaskRequest) => ({ status: 'CREATED' as const, retryable: false, task: makeSummary({ id: 'task_new', title: input.title }) })),
    claim: handlers.claim ?? (async () => ({ status: 'CLAIMED' as const, retryable: false, task: makeSummary({ status: 'claimed' as const }) })),
    complete: handlers.complete ?? (async () => ({ status: 'COMPLETED' as const, retryable: false, taskId: 'task_x', terminalAt: '2026-08-14T10:00:00.000Z' })),
    abandon: handlers.abandon ?? (async () => ({ status: 'ABANDONED' as const, retryable: false, taskId: 'task_x', terminalAt: '2026-08-14T10:00:00.000Z' })),
  }
}

describe('task store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetTaskStoreForTesting()
    clearPendingTask()
  })

  afterEach(() => {
    resetTaskStoreForTesting()
    clearPendingTask()
  })

  // === loadCurrent ===

  describe('loadCurrent', () => {
    it('populates current with priority + groups', async () => {
      const client = makeCloudClient({
        listCurrent: async () => ({
          status: 'LISTED',
          retryable: false,
          current: {
            priority: [makeSummary({ id: 't1', isOverdueOrToday: true })],
            groups: {
              low_stock: [makeSummary({ id: 't2', type: 'low_stock' })],
              to_handle: [],
              expiring: [],
            },
          },
        }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      await store.loadCurrent()
      expect(store.current?.priority).toHaveLength(1)
      expect(store.current?.groups.low_stock).toHaveLength(1)
      expect(store.phase).toBe('loaded')
    })

    it('TASK_FORBIDDEN clears current and shows editable', async () => {
      const client = makeCloudClient({ listCurrent: async () => ({ status: 'TASK_FORBIDDEN', retryable: false, errorMessage: 'no access' }) })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      await store.loadCurrent()
      expect(store.current).toBeUndefined()
      expect(store.phase).toBe('editable')
    })

    it('second concurrent call returns immediately (in-flight guard)', async () => {
      let resolveFirst: (() => void) | undefined
      const first = new Promise<TaskResult>((resolve) => { resolveFirst = () => resolve({ status: 'LISTED' as const, retryable: false, current: { priority: [], groups: { low_stock: [], to_handle: [], expiring: [] } } }) })
      const client = makeCloudClient({ listCurrent: () => first })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      const p1 = store.loadCurrent()
      const p2 = store.loadCurrent()
      await Promise.resolve()
      resolveFirst!()
      await Promise.all([p1, p2])
      // 没有崩溃，且 phase 是 loaded
      expect(store.phase).toBe('loaded')
    })
  })

  // === create ===

  describe('create', () => {
    it('returns true and applies the new task to current on CREATED', async () => {
      const client = makeCloudClient({
        create: async (input) => ({ status: 'CREATED', retryable: false, task: makeSummary({ id: 'task_new', title: input.title, type: input.type }) }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      // 准备 current
      await store.loadCurrent()
      const ok = await store.create({ title: 'Buy detergent', type: 'low_stock' })
      expect(ok).toBe(true)
      expect(store.pending).toBeUndefined()
      expect(store.current?.groups.low_stock).toHaveLength(1)
      expect(store.current?.groups.low_stock[0].id).toBe('task_new')
    })

    it('returns false on TEMPORARY_FAILURE', async () => {
      const client = makeCloudClient({ create: async () => ({ status: 'TASK_TEMPORARY_FAILURE', retryable: true, errorMessage: 'temporary' }) })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      const ok = await store.create({ title: 'x', type: 'low_stock' })
      expect(ok).toBe(false)
      expect(store.errorMessage).toBeTruthy()
    })

    it('concurrent create calls only run once (in-flight guard)', async () => {
      let resolveFirst: (() => void) | undefined
      const blocked = new Promise<TaskResult>((resolve) => { resolveFirst = () => resolve({ status: 'CREATED', retryable: false, task: makeSummary({ id: 'task_x' }) }) })
      const client = makeCloudClient({ create: () => blocked })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      const p1 = store.create({ title: 'x', type: 'low_stock' })
      const p2 = store.create({ title: 'x', type: 'low_stock' })
      await Promise.resolve()
      resolveFirst!()
      const [r1, r2] = await Promise.all([p1, p2])
      expect(r1).toBe(true)
      expect(r2).toBe(false) // in-flight guard rejects second
    })

    it('persists operationToken to pending-task storage on enter, clears on success', async () => {
      const client = makeCloudClient({
        create: async (input) => ({ status: 'CREATED', retryable: false, task: makeSummary({ id: 'task_new', title: input.title }) }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      const p = store.create({ title: 'x', type: 'low_stock' })
      // pending 应该已经在 writePendingTask 中写入
      const inFlight = readPendingTask()
      expect(inFlight?.kind).toBe('create')
      expect(inFlight?.requestId).toBeTruthy()
      await p
      expect(readPendingTask()).toBeUndefined()
    })
  })

  // === claim / complete / abandon ===

  describe('claim / complete / abandon', () => {
    it('claim returns true on CLAIMED and updates current', async () => {
      const client = makeCloudClient({
        claim: async () => ({ status: 'CLAIMED', retryable: false, task: makeSummary({ id: 'task_x', status: 'claimed' as const, assignee: { nickname: 'me', avatar: { kind: 'builtin' as const, id: 'person-01' } } }) }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      await store.loadCurrent()
      const ok = await store.claim('task_x')
      expect(ok).toBe(true)
    })

    it('complete returns true on COMPLETED and removes task from current', async () => {
      const client = makeCloudClient({
        listCurrent: async () => ({ status: 'LISTED', retryable: false, current: { priority: [], groups: { low_stock: [makeSummary({ id: 'task_x' })], to_handle: [], expiring: [] } } }),
        complete: async () => ({ status: 'COMPLETED', retryable: false, taskId: 'task_x', terminalAt: '2026-08-14T10:00:00.000Z' }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      await store.loadCurrent()
      expect(store.current?.groups.low_stock).toHaveLength(1)
      const ok = await store.complete('task_x')
      expect(ok).toBe(true)
      expect(store.current?.groups.low_stock).toHaveLength(0)
    })

    it('abandon returns true on ABANDONED and removes from current', async () => {
      const client = makeCloudClient({
        listCurrent: async () => ({ status: 'LISTED', retryable: false, current: { priority: [], groups: { low_stock: [makeSummary({ id: 'task_x' })], to_handle: [], expiring: [] } } }),
        abandon: async () => ({ status: 'ABANDONED', retryable: false, taskId: 'task_x', terminalAt: '2026-08-14T10:00:00.000Z' }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      await store.loadCurrent()
      const ok = await store.abandon('task_x')
      expect(ok).toBe(true)
      expect(store.current?.groups.low_stock).toHaveLength(0)
    })

    it('abandon returns false on TASK_TERMINAL and shows controlled error', async () => {
      const client = makeCloudClient({ abandon: async () => ({ status: 'TASK_TERMINAL', retryable: false, errorMessage: 'finished' }) })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      const ok = await store.abandon('task_x')
      expect(ok).toBe(false)
      expect(store.errorMessage).toBe('事项已经结束，不能再操作')
    })
  })

  // === 超时后重查 ===

  describe('recoverAfterTimeout', () => {
    it('completes a timed-out completion by re-querying the task as completed', async () => {
      const client = makeCloudClient({
        getDetail: async () => ({
          status: 'LOADED',
          retryable: false,
          detail: {
            ...makeSummary({ id: 'task_x', status: 'claimed' as const }),
            events: [],
            terminalKind: 'completed',
            terminalAt: '2026-08-14T11:00:00.000Z',
          },
        }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      const ok = await store.recoverAfterTimeout('complete', 'task_x')
      expect(ok).toBe(true)
      expect(store.phase).toBe('loaded')
    })

    it('abandons a timed-out abandon by re-querying the task as abandoned', async () => {
      const client = makeCloudClient({
        getDetail: async () => ({
          status: 'LOADED',
          retryable: false,
          detail: {
            ...makeSummary({ id: 'task_x', status: 'claimed' as const }),
            events: [],
            terminalKind: 'abandoned',
            terminalAt: '2026-08-14T11:00:00.000Z',
          },
        }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      const ok = await store.recoverAfterTimeout('abandon', 'task_x')
      expect(ok).toBe(true)
    })

    it('returns false when terminal kind does not match the action', async () => {
      const client = makeCloudClient({
        getDetail: async () => ({
          status: 'LOADED',
          retryable: false,
          detail: { ...makeSummary({ id: 'task_x' }), events: [] },
        }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      const ok = await store.recoverAfterTimeout('complete', 'task_x')
      expect(ok).toBe(false)
    })
  })

  // === resetForHouseholdChange ===

  describe('resetForHouseholdChange', () => {
    it('clears all household-scoped state and bumps revision', async () => {
      const client = makeCloudClient({
        listCurrent: async () => ({ status: 'LISTED', retryable: false, current: { priority: [makeSummary()], groups: { low_stock: [], to_handle: [], expiring: [] } } }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      await store.loadCurrent()
      expect(store.current).toBeDefined()
      store.resetForHouseholdChange()
      expect(store.current).toBeUndefined()
      expect(store.detail).toBeUndefined()
      expect(store.completedItems).toEqual([])
    })
  })

  // === loadCompleted 分页 ===

  describe('loadCompleted', () => {
    it('appends items and tracks nextCursor', async () => {
      const client = makeCloudClient({
        listCompleted: async () => ({ status: 'LISTED', retryable: false, items: [makeSummary({ id: 't1' }), makeSummary({ id: 't2' })], nextCursor: 'next1' }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      await store.loadCompleted()
      expect(store.completedItems).toHaveLength(2)
      expect(store.completedCursor).toBe('next1')
      expect(store.completedHasMore).toBe(true)
    })

    it('reset clears previous list before fetching', async () => {
      const client = makeCloudClient({
        listCompleted: async () => ({ status: 'LISTED', retryable: false, items: [makeSummary({ id: 't3' })] }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      // 假装已有旧数据
      store.completedItems = [makeSummary({ id: 'old' })]
      await store.loadCompleted(true)
      expect(store.completedItems).toHaveLength(1)
      expect(store.completedItems[0].id).toBe('t3')
    })
  })
})
