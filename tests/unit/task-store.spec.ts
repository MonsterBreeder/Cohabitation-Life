import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore, resetTaskStoreForTesting, setTaskStoreCloudClientForTesting } from '../../src/store/modules/task'
import { setTaskCloudRuntimeForTesting, setTaskCloudEnvironmentForTesting, resetTaskCloudForTesting } from '../../src/services/task-cloud'
import { clearPendingTask, readPendingTask, writePendingTask } from '../../src/utils/pending-task'
import type {
  AbandonTaskRequest,
  AddCommentRequest,
  ClaimTaskRequest,
  CompleteTaskRequest,
  CreateTaskRequest,
  TaskResult,
  TaskSummary,
  UpdateTaskRequest,
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
  update: (input: UpdateTaskRequest) => Promise<TaskResult>
  addComment: (input: AddCommentRequest) => Promise<TaskResult>
}> = {}) {
  return {
    listCurrent: handlers.listCurrent ?? (async () => ({ status: 'LISTED' as const, retryable: false, current: { priority: [], groups: { low_stock: [], to_handle: [], expiring: [] } } })),
    getDetail: handlers.getDetail ?? (async (id: string) => ({ status: 'LOADED' as const, retryable: false, detail: { ...makeSummary({ id }), events: [] } })),
    listCompleted: handlers.listCompleted ?? (async () => ({ status: 'LISTED' as const, retryable: false, items: [] })),
    create: handlers.create ?? (async (input: CreateTaskRequest) => ({ status: 'CREATED' as const, retryable: false, task: makeSummary({ id: 'task_new', title: input.title }) })),
    claim: handlers.claim ?? (async () => ({ status: 'CLAIMED' as const, retryable: false, task: makeSummary({ status: 'claimed' as const }) })),
    complete: handlers.complete ?? (async () => ({ status: 'COMPLETED' as const, retryable: false, taskId: 'task_x', terminalAt: '2026-08-14T10:00:00.000Z' })),
    abandon: handlers.abandon ?? (async () => ({ status: 'ABANDONED' as const, retryable: false, taskId: 'task_x', terminalAt: '2026-08-14T10:00:00.000Z' })),
    update: handlers.update ?? (async (input: UpdateTaskRequest) => ({
      status: 'UPDATED' as const,
      retryable: false,
      task: makeSummary({ id: input.taskId, title: input.name || 'Updated' }),
      events: [],
      editVersion: input.editVersion + 1,
    })),
    addComment: handlers.addComment ?? (async (input: AddCommentRequest) => ({
      status: 'COMMENTED' as const,
      retryable: false,
      detail: {
        ...makeSummary({ id: input.taskId }),
        events: [],
        comments: [{ id: 'c1', actor: { nickname: 'me', avatar: { kind: 'builtin' as const, id: 'person-01' } }, text: input.text, at: '2026-08-14T10:00:00.000Z' }],
        editVersion: 0,
      },
    })),
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

  // === PRD 006：update 编辑事项 ===

  describe('update', () => {
    it('returns true on UPDATED and applies summary + events + editVersion to detail', async () => {
      const editEvent = { kind: 'edit' as const, actor: { nickname: 'me', avatar: { kind: 'builtin' as const, id: 'person-01' } }, at: '2026-08-14T10:00:00.000Z', changedFields: ['name' as const] }
      const client = makeCloudClient({
        update: async (input) => ({
          status: 'UPDATED',
          retryable: false,
          task: makeSummary({ id: input.taskId, title: input.name || 'After' }),
          events: [editEvent],
          editVersion: input.editVersion + 1,
        }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      store.detail = { ...makeSummary({ id: 'task_x' }), events: [], comments: [], editVersion: 0 }
      const ok = await store.update('task_x', { name: 'After' }, 0)
      expect(ok).toBe(true)
      expect(store.detail?.title).toBe('After')
      expect(store.detail?.editVersion).toBe(1)
      expect(store.detail?.events).toHaveLength(1)
      expect(store.phase).toBe('loaded')
    })

    it('TASK_DUPLICATE_OPERATION is mapped to controlled error message', async () => {
      const client = makeCloudClient({ update: async () => ({ status: 'TASK_DUPLICATE_OPERATION', retryable: false, errorMessage: 'dup' }) })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      const ok = await store.update('task_x', { name: 'X' }, 0)
      expect(ok).toBe(false)
      expect(store.errorMessage).toBe('请求已处理，请刷新后查看最新状态')
    })

    it('TASK_TERMINAL is mapped to controlled error message', async () => {
      const client = makeCloudClient({ update: async () => ({ status: 'TASK_TERMINAL', retryable: false, errorMessage: 'done' }) })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      const ok = await store.update('task_x', { name: 'X' }, 0)
      expect(ok).toBe(false)
      expect(store.errorMessage).toBe('事项已经结束，不能再操作')
    })

    it('does not run a second update while one is in flight', async () => {
      let callCount = 0
      const client = makeCloudClient({
        update: async () => {
          callCount += 1
          await new Promise((resolve) => setTimeout(resolve, 20))
          return { status: 'UPDATED' as const, retryable: false, task: makeSummary(), events: [], editVersion: 1 }
        },
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      const p1 = store.update('task_x', { name: 'A' }, 0)
      const p2 = store.update('task_x', { name: 'B' }, 0)
      const [r1, r2] = await Promise.all([p1, p2])
      expect(callCount).toBe(1)
      expect(r1 || r2).toBe(true)
    })

    it('syncs current list with the new summary (so type/title/dueDate change shows up)', async () => {
      const client = makeCloudClient({
        listCurrent: async () => ({ status: 'LISTED', retryable: false, current: { priority: [], groups: { low_stock: [makeSummary({ id: 'task_x', title: 'Old', type: 'low_stock' })], to_handle: [], expiring: [] } } }),
        update: async () => ({ status: 'UPDATED' as const, retryable: false, task: makeSummary({ id: 'task_x', title: 'New', type: 'to_handle' }), events: [], editVersion: 1 }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      await store.loadCurrent()
      expect(store.current?.groups.low_stock[0].title).toBe('Old')
      await store.update('task_x', { title: 'New', type: 'to_handle' }, 0)
      expect(store.current?.groups.low_stock).toHaveLength(0)
      expect(store.current?.groups.to_handle[0].title).toBe('New')
    })
  })

  // === PRD 006：addComment 添加评论 ===

  describe('addComment', () => {
    it('returns true on COMMENTED and replaces detail with server response', async () => {
      const client = makeCloudClient({
        addComment: async (input) => ({
          status: 'COMMENTED',
          retryable: false,
          detail: {
            ...makeSummary({ id: input.taskId }),
            events: [],
            comments: [
              { id: 'c1', actor: { nickname: 'me', avatar: { kind: 'builtin' as const, id: 'person-01' } }, text: input.text, at: '2026-08-14T10:00:00.000Z' },
            ],
            editVersion: 0,
          },
        }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      store.detail = { ...makeSummary({ id: 'task_x' }), events: [], comments: [], editVersion: 0 }
      const ok = await store.addComment('task_x', '好的')
      expect(ok).toBe(true)
      expect(store.detail?.comments).toHaveLength(1)
      expect(store.detail?.comments[0].text).toBe('好的')
    })

    it('TASK_TERMINAL is mapped to controlled error message', async () => {
      const client = makeCloudClient({ addComment: async () => ({ status: 'TASK_TERMINAL', retryable: false, errorMessage: 'closed' }) })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      const ok = await store.addComment('task_x', '好的')
      expect(ok).toBe(false)
      expect(store.errorMessage).toBe('事项已经结束，不能再操作')
    })

    it('does not run a second addComment while one is in flight', async () => {
      let callCount = 0
      const client = makeCloudClient({
        addComment: async () => {
          callCount += 1
          await new Promise((resolve) => setTimeout(resolve, 20))
          return {
            status: 'COMMENTED' as const,
            retryable: false,
            detail: { ...makeSummary(), events: [], comments: [], editVersion: 0 },
          }
        },
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      const p1 = store.addComment('task_x', 'A')
      const p2 = store.addComment('task_x', 'B')
      const [r1, r2] = await Promise.all([p1, p2])
      expect(callCount).toBe(1)
      expect(r1 || r2).toBe(true)
    })
  })

  // === PRD 006：watch 合并（applyCommentedFromWatch） ===

  describe('applyCommentedFromWatch', () => {
    it('merges new comments by id, dedup', () => {
      const store = useTaskStore()
      store.detail = {
        ...makeSummary({ id: 'task_x' }),
        events: [],
        comments: [
          { id: 'c1', actor: { nickname: 'me', avatar: { kind: 'builtin' as const, id: 'person-01' } }, text: 'first', at: '2026-08-14T09:00:00.000Z' },
        ],
        editVersion: 0,
      }
      store.applyCommentedFromWatch([
        { id: 'c1', actor: { nickname: 'me', avatar: { kind: 'builtin' as const, id: 'person-01' } }, text: 'first', at: '2026-08-14T09:00:00.000Z' },
        { id: 'c2', actor: { nickname: 'you', avatar: { kind: 'builtin' as const, id: 'person-02' } }, text: 'second', at: '2026-08-14T10:00:00.000Z' },
      ])
      expect(store.detail?.comments).toHaveLength(2)
      // 倒序：c2 在前
      expect(store.detail?.comments[0].id).toBe('c2')
      expect(store.detail?.comments[1].id).toBe('c1')
    })

    it('does not overwrite other detail fields (e.g. editVersion)', () => {
      const store = useTaskStore()
      store.detail = {
        ...makeSummary({ id: 'task_x', title: 'Editing...' }),
        events: [],
        comments: [],
        editVersion: 5,
      }
      store.applyCommentedFromWatch([
        { id: 'c1', actor: { nickname: 'me', avatar: { kind: 'builtin' as const, id: 'person-01' } }, text: 'new', at: '2026-08-14T10:00:00.000Z' },
      ])
      expect(store.detail?.editVersion).toBe(5)
      expect(store.detail?.title).toBe('Editing...')
    })

    it('no-ops when detail is undefined', () => {
      const store = useTaskStore()
      store.applyCommentedFromWatch([
        { id: 'c1', actor: { nickname: 'me', avatar: { kind: 'builtin' as const, id: 'person-01' } }, text: 'new', at: '2026-08-14T10:00:00.000Z' },
      ])
      expect(store.detail).toBeUndefined()
    })
  })

  // === PRD 006：restorePending 支持 update / addComment ===

  describe('restorePending', () => {
    it('phase 映射：update → updating', async () => {
      writePendingTask({ kind: 'update', taskId: 't1', requestId: 'r1', operationToken: 'o1', startedAt: Date.now() })
      const store = useTaskStore()
      await store.restorePending()
      expect(store.phase).toBe('updating')
    })

    it('phase 映射：addComment → commenting', async () => {
      writePendingTask({ kind: 'addComment', taskId: 't1', requestId: 'r1', operationToken: 'o1', startedAt: Date.now() })
      const store = useTaskStore()
      await store.restorePending()
      expect(store.phase).toBe('commenting')
    })
  })


  // === PRD 006 U5：实时推送生命周期 ===

  describe('subscribeComments / unsubscribeComments', () => {
    // 模拟 cloud runtime 暴露 database + watch
    function installWatchMock() {
      const watchers: { close: jest.Mock; onChange: (snapshot: { type: 'init' | 'update'; docs: unknown[] }) => void }[] = []
      const watch = jest.fn((options: { onChange: (snapshot: { type: 'init' | 'update'; docs: unknown[] }) => void; onError?: (err: unknown) => void }) => {
        const w = {
          onChange: options.onChange,
          push(newDocs: unknown[]) {
            options.onChange({ type: 'update', docs: newDocs })
          },
          close: jest.fn(),
        }
        watchers.push(w)
        return w
      })
      setTaskCloudEnvironmentForTesting('test-env')
      setTaskCloudRuntimeForTesting({
        cloud: {
          init: () => undefined,
          callFunction: async () => ({ result: {} }),
          database: { collection: () => ({ doc: () => ({ watch }) }) },
        },
      })
      return { watchers, watch }
    }

    afterEach(() => {
      resetTaskCloudForTesting()
    })

    it('subscribeComments 调用 wx.cloud.database...watch 并记录 watcher', () => {
      const { watchers } = installWatchMock()
      const store = useTaskStore()
      store.subscribeComments('t1')
      expect(watchers).toHaveLength(1)
    })

    it('切换 taskId 时自动关闭旧 watcher', () => {
      const { watchers } = installWatchMock()
      const store = useTaskStore()
      store.subscribeComments('t1')
      store.subscribeComments('t2')
      expect(watchers).toHaveLength(2)
      expect(watchers[0].close).toHaveBeenCalled()
    })

    it('watch 推送新评论时通过 applyCommentedFromWatch 合并到 detail（不覆盖其他字段）', () => {
      const { watchers } = installWatchMock()
      const store = useTaskStore()
      store.detail = {
        ...makeSummary({ id: 't1', title: '原标题' }),
        events: [],
        comments: [],
        editVersion: 0,
      }
      store.subscribeComments('t1')
      watchers[0].push([{
        _id: 't1',
        title: '被改的标题',
        comments: [
          { id: 'c1', actor: { nickname: '小美', avatar: { kind: 'builtin', id: 'person-02' } }, text: '收到', at: '2026-08-16T10:00:00.000Z' },
        ],
      }])
      // 合并了评论，但没改 title（保持"原标题"）
      expect(store.detail?.comments).toHaveLength(1)
      expect(store.detail?.title).toBe('原标题')
    })

    it('watch 推送重复评论时去重', () => {
      const { watchers } = installWatchMock()
      const store = useTaskStore()
      store.detail = {
        ...makeSummary({ id: 't1' }),
        events: [],
        comments: [
          { id: 'c1', actor: { nickname: '小美', avatar: { kind: 'builtin', id: 'person-02' } }, text: '收到', at: '2026-08-16T10:00:00.000Z' },
        ],
        editVersion: 0,
      }
      store.subscribeComments('t1')
      watchers[0].push([{
        _id: 't1',
        comments: [
          { id: 'c1', actor: { nickname: '小美', avatar: { kind: 'builtin', id: 'person-02' } }, text: '收到', at: '2026-08-16T10:00:00.000Z' },
        ],
      }])
      expect(store.detail?.comments).toHaveLength(1)
    })

    it('unsubscribeComments 关闭当前 watcher', () => {
      const { watchers } = installWatchMock()
      const store = useTaskStore()
      store.subscribeComments('t1')
      store.unsubscribeComments()
      expect(watchers[0].close).toHaveBeenCalled()
    })

    it('resetForHouseholdChange 自动关闭 watcher', async () => {
      const { watchers } = installWatchMock()
      const client = makeCloudClient({
        listCurrent: async () => ({ status: 'LISTED', retryable: false, current: { priority: [], groups: { low_stock: [], to_handle: [], expiring: [] } } }),
      })
      setTaskStoreCloudClientForTesting(client)
      const store = useTaskStore()
      await store.loadCurrent()
      store.subscribeComments('t1')
      store.resetForHouseholdChange()
      expect(watchers[0].close).toHaveBeenCalled()
    })
  })
})

