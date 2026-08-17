declare function require(path: string): any

const {
  createTask,
  listCurrentTasks,
  getTaskDetail,
  claimTask,
  completeTask,
  abandonTask,
  listCompletedTasks,
  updateTask,
  addComment,
  computeIsOverdueOrToday,
  TaskDomainError,
} = require('../../cloudfunctions/task/task-domain')

// In-memory repository stub. Mirrors household-domain.spec.ts pattern.
// Each test gets its own repository. Transaction snapshots data and rolls
// back on error.

type RecordMap = Map<string, any>

function createRepository(initial: { tasks?: any[]; operations?: any[]; households?: any[]; users?: any[]; locks?: any[] } = {}) {
  const tasks: RecordMap = new Map((initial.tasks || []).map((t) => [t._id, structuredClone(t)]))
  const operations: RecordMap = new Map((initial.operations || []).map((o) => [o._id, structuredClone(o)]))
  const households: RecordMap = new Map((initial.households || []).map((h) => [h._id, structuredClone(h)]))
  const users: RecordMap = new Map((initial.users || []).map((u) => [u._id, structuredClone(u)]))
  const locks: RecordMap = new Map((initial.locks || []).map((l) => [l._id, structuredClone(l)]))
  let queue = Promise.resolve()
  let forceFailNext = false

  const repository = {
    findHouseholdsByMemberKey: jest.fn(async (identityKey: string) =>
      [...households.values()].filter((h) => Array.isArray(h.memberKeys) && h.memberKeys.includes(identityKey)),
    ),
    isMemberOfHousehold: jest.fn(async (identityKey: string, householdId: string) => {
      const home = households.get(householdId)
      return Boolean(home && Array.isArray(home.memberKeys) && home.memberKeys.includes(identityKey))
    }),
    getUser: jest.fn(async (id: string) => users.get(id) || null),
    getTask: jest.fn(async (id: string) => tasks.get(id) || null),
    getOperation: jest.fn(async (id: string) => operations.get(id) || null),
    findOpenTasksByHousehold: jest.fn(async (householdId: string) =>
      [...tasks.values()].filter((t) => t.householdId === householdId && (t.status === 'pending' || t.status === 'claimed')),
    ),
    findOperationsByTaskId: jest.fn(async (taskId: string) =>
      [...operations.values()].filter((o) => o.taskId === taskId).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
    ),
    findCompletedTasksByHousehold: jest.fn(async (householdId: string, limit: number, cursor?: string) => {
      let list = [...tasks.values()].filter((t) => t.householdId === householdId && (t.status === 'completed' || t.status === 'abandoned'))
      if (cursor) {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
        list = list.filter((t) => new Date(t.terminalAt).getTime() < new Date(decoded.at).getTime())
      }
      list.sort((a, b) => new Date(b.terminalAt).getTime() - new Date(a.terminalAt).getTime())
      const hasMore = list.length > limit
      const records = list.slice(0, limit)
      const nextCursor = hasMore && records.length > 0
        ? Buffer.from(JSON.stringify({ at: records[records.length - 1].terminalAt })).toString('base64url')
        : undefined
      return { records, nextCursor }
    }),
    runTransaction: jest.fn(async (work: (transaction: any) => Promise<any>) => {
      const run = queue.then(async () => {
        if (forceFailNext) { forceFailNext = false; throw new Error('forced transaction failure') }
        const taskDraft = new Map(tasks)
        const opDraft = new Map(operations)
        const householdDraft = new Map(households)
        const lockDraft = new Map(locks)
        const transaction = {
          getTask: async (id: string) => taskDraft.get(id) || null,
          getOperation: async (id: string) => opDraft.get(id) || null,
          getCreationLock: async (id: string) => lockDraft.get(id) || null,
          createTask: async (record: any) => { taskDraft.set(record._id, structuredClone(record)) },
          updateTask: async (id: string, data: any) => {
            const current = taskDraft.get(id)
            if (!current) throw new Error('task not found')
            taskDraft.set(id, { ...current, ...structuredClone(data) })
          },
          createOperation: async (record: any) => { opDraft.set(record._id, structuredClone(record)) },
          createCreationLock: async (record: any) => { lockDraft.set(record._id, structuredClone(record)) },
          // PRD 006: 事务内读 events（供 updateTask 返回最新 events 流用）
          findOperationsByTaskId: async (taskId: string) =>
            [...opDraft.values()].filter((o) => o.taskId === taskId).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()),
        }
        const result = await work(transaction)
        tasks.clear(); taskDraft.forEach((v, k) => tasks.set(k, v))
        operations.clear(); opDraft.forEach((v, k) => operations.set(k, v))
        households.clear(); householdDraft.forEach((v, k) => households.set(k, v))
        locks.clear(); lockDraft.forEach((v, k) => locks.set(k, v))
        return result
      })
      queue = run.then(() => undefined, () => undefined)
      return run
    }),
    forceFailNextTransaction: () => { forceFailNext = true },
    _tasks: tasks,
    _operations: operations,
    _households: households,
    _users: users,
    _locks: locks,
  }
  return repository
}

function dependencies(repository: ReturnType<typeof createRepository>, overrides: Record<string, any> = {}) {
  return {
    identityKey: overrides.identityKey || 'user_creator',
    repository,
    now: () => new Date('2026-08-14T10:00:00.000Z'),
    checkText: async () => true,
  }
}

function request(overrides: Record<string, any> = {}) {
  return {
    title: 'Buy detergent',
    type: 'low_stock',
    requestId: 'request_abcdef0123456789',
    operationToken: 'operation_abcdef0123456789',
    ...overrides,
  }
}

function singleHome(identityKey = 'user_creator', otherKey?: string) {
  return {
    _id: 'home_x',
    memberKeys: otherKey ? [identityKey, otherKey] : [identityKey],
  }
}

function profileFor(identityKey: string, nickname: string, avatarId = 'person-01') {
  return { _id: identityKey, nickname, avatar: { kind: 'builtin', id: avatarId } }
}

// === createTask ===

describe('createTask', () => {
  it('writes a task and a create operation, returns summary with type and date', async () => {
    const repository = createRepository({ households: [singleHome()] })
    const result = await createTask(
      request({ title: 'Buy detergent', type: 'low_stock', dueDate: '2026-08-20' }),
      dependencies(repository),
    )

    expect(result.status).toBe('CREATED')
    expect(result.retryable).toBe(false)
    expect(result.task).toMatchObject({
      id: expect.stringMatching(/^task_[a-f0-9]{32}$/),
      type: 'low_stock',
      title: 'Buy detergent',
      status: 'pending',
      dueDate: '2026-08-20',
    })
    expect([...repository._operations.values()]).toHaveLength(1)
    expect([...repository._operations.values()][0]).toMatchObject({ kind: 'create' })
  })

  it('same requestId returns idempotent existing summary', async () => {
    const repository = createRepository({ households: [singleHome()] })
    const req = request({ title: 'Buy tissue' })
    const first = await createTask(req, dependencies(repository))
    const second = await createTask(req, dependencies(repository))
    expect(second.task.id).toBe(first.task.id)
    expect([...repository._operations.values()].filter((o) => o.kind === 'create')).toHaveLength(1)
  })

  it('non-member creation is denied', async () => {
    const repository = createRepository({ households: [] })
    await expect(createTask(request(), dependencies(repository))).rejects.toMatchObject({ code: 'TASK_FORBIDDEN' })
  })

  it('21-char title is rejected', async () => {
    const repository = createRepository({ households: [singleHome()] })
    await expect(createTask(request({ title: '123456789012345678901' }), dependencies(repository))).rejects.toMatchObject({ code: 'TASK_INVALID_REQUEST' })
  })

  it('unknown type is rejected', async () => {
    const repository = createRepository({ households: [singleHome()] })
    await expect(createTask(request({ type: 'todo' }), dependencies(repository))).rejects.toMatchObject({ code: 'TASK_INVALID_REQUEST' })
  })

  it('invalid dueDate format is rejected', async () => {
    const repository = createRepository({ households: [singleHome()] })
    await expect(createTask(request({ dueDate: 'today' }), dependencies(repository))).rejects.toMatchObject({ code: 'TASK_INVALID_REQUEST' })
  })

  it('101-char note is rejected', async () => {
    const repository = createRepository({ households: [singleHome()] })
    await expect(createTask(request({ note: 'a'.repeat(101) }), dependencies(repository))).rejects.toMatchObject({ code: 'TASK_INVALID_REQUEST' })
  })
})

// === listCurrentTasks ===

describe('listCurrentTasks', () => {
  it('returns priority bucket plus three type groups, sorted by dueDate ascending', async () => {
    const today = '2026-08-14'
    const future = '2026-08-20'
    const repository = createRepository({
      households: [singleHome('user_creator', 'user_other')],
      tasks: [
        { _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'A', dueDate: future, status: 'pending', createdBy: 'user_creator', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:00:00.000Z' },
        { _id: 't2', householdId: 'home_x', type: 'to_handle', title: 'B', dueDate: today, status: 'pending', createdBy: 'user_creator', createdAt: '2026-08-14T09:01:00.000Z', updatedAt: '2026-08-14T09:01:00.000Z' },
        { _id: 't3', householdId: 'home_x', type: 'expiring', title: 'C', dueDate: '2026-08-13', status: 'pending', createdBy: 'user_creator', createdAt: '2026-08-14T09:02:00.000Z', updatedAt: '2026-08-14T09:02:00.000Z' },
        { _id: 't4', householdId: 'home_x', type: 'low_stock', title: 'D', status: 'pending', createdBy: 'user_creator', createdAt: '2026-08-14T09:03:00.000Z', updatedAt: '2026-08-14T09:03:00.000Z' },
      ],
      users: [profileFor('user_creator', 'Xiaoshuai', 'person-01')],
    })

    const result = await listCurrentTasks(dependencies(repository))

    expect(result.status).toBe('LISTED')
    // priority should contain today + overdue: B and C. A (future) should not.
    expect(result.current.priority.map((t: any) => t.id).sort()).toEqual(['t2', 't3'])
    // groups.low_stock: A (future) + D (no date) ascending, no date last
    expect(result.current.groups.low_stock.map((t: any) => t.id)).toEqual(['t1', 't4'])
    expect(result.current.groups.to_handle).toHaveLength(0)
    expect(result.current.groups.expiring).toHaveLength(0)
  })

  it('terminal tasks do not appear in current', async () => {
    const repository = createRepository({
      households: [singleHome()],
      tasks: [
        { _id: 't_done', householdId: 'home_x', type: 'low_stock', title: 'Done', status: 'completed', createdBy: 'user_creator', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T10:00:00.000Z', terminalAt: '2026-08-14T10:00:00.000Z', terminalBy: 'user_creator', terminalKind: 'completed' },
      ],
    })
    const result = await listCurrentTasks(dependencies(repository))
    expect(result.current.priority).toHaveLength(0)
    expect(result.current.groups.low_stock).toHaveLength(0)
  })

  it('non-member call is denied', async () => {
    const repository = createRepository({ households: [] })
    await expect(listCurrentTasks(dependencies(repository))).rejects.toMatchObject({ code: 'TASK_FORBIDDEN' })
  })
})

// === getTaskDetail ===

describe('getTaskDetail', () => {
  it('returns summary + events (time-ascending) + terminal fields', async () => {
    const repository = createRepository({
      households: [singleHome('user_creator', 'user_other')],
      tasks: [
        { _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'Buy detergent', status: 'completed', createdBy: 'user_creator', assigneeKey: 'user_other', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T10:00:00.000Z', terminalAt: '2026-08-14T10:00:00.000Z', terminalBy: 'user_other', terminalKind: 'completed' },
      ],
      operations: [
        { _id: 'taskop_t1_a', taskId: 't1', householdId: 'home_x', kind: 'create', actorKey: 'user_creator', at: '2026-08-14T09:00:00.000Z' },
        { _id: 'taskop_t1_b', taskId: 't1', householdId: 'home_x', kind: 'claim', actorKey: 'user_other', at: '2026-08-14T09:30:00.000Z' },
        { _id: 'taskop_t1_c', taskId: 't1', householdId: 'home_x', kind: 'complete', actorKey: 'user_other', at: '2026-08-14T10:00:00.000Z' },
      ],
      users: [profileFor('user_creator', 'Xiaoshuai'), profileFor('user_other', 'Xiaomei', 'person-02')],
    })

    const result = await getTaskDetail({ taskId: 't1' }, dependencies(repository))
    expect(result.status).toBe('LOADED')
    expect(result.detail.events).toHaveLength(3)
    expect(result.detail.events[0]).toMatchObject({ kind: 'create', actor: expect.objectContaining({ nickname: 'Xiaoshuai' }) })
    expect(result.detail.events[2]).toMatchObject({ kind: 'complete', actor: expect.objectContaining({ nickname: 'Xiaomei' }) })
    expect(result.detail.terminalKind).toBe('completed')
    expect(result.detail.terminalActor).toMatchObject({ nickname: 'Xiaomei' })
    expect(result.detail).not.toHaveProperty('householdId')
    expect(result.detail).not.toHaveProperty('actorKey')
  })

  it('non-member detail view is denied', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_other'] }],
      tasks: [{ _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'x', status: 'pending', createdBy: 'user_other', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:00:00.000Z' }],
    })
    await expect(getTaskDetail({ taskId: 't1' }, dependencies(repository))).rejects.toMatchObject({ code: 'TASK_FORBIDDEN' })
  })

  it('missing task returns NOT_FOUND', async () => {
    const repository = createRepository({ households: [singleHome()] })
    await expect(getTaskDetail({ taskId: 'missing' }, dependencies(repository))).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' })
  })
})

// === claimTask ===

describe('claimTask', () => {
  const CRED = { requestId: 'request_aaaaaaaaaa', operationToken: 'operation_aaaaaaaaaa' }
  it('pending task claimed by any member becomes claimed', async () => {
    const repository = createRepository({
      households: [singleHome('user_a', 'user_b')],
      tasks: [{ _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'x', status: 'pending', createdBy: 'user_a', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:00:00.000Z' }],
      users: [profileFor('user_b', 'Xiaomei')],
    })
    const result = await claimTask({ taskId: 't1', ...CRED }, dependencies(repository, { identityKey: 'user_b' }))
    expect(result.status).toBe('CLAIMED')
    expect(result.task.status).toBe('claimed')
    expect(result.task.assignee).toMatchObject({ nickname: 'Xiaomei' })
  })

  it('claiming a claimed task is rejected with TASK_TERMINAL', async () => {
    const repository = createRepository({
      households: [singleHome('user_a', 'user_b')],
      tasks: [{ _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'x', status: 'claimed', assigneeKey: 'user_a', createdBy: 'user_a', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:00:00.000Z' }],
    })
    await expect(claimTask({ taskId: 't1', ...CRED }, dependencies(repository, { identityKey: 'user_b' }))).rejects.toMatchObject({ code: 'TASK_TERMINAL' })
  })

  it('same operationToken only changes state once (idempotent)', async () => {
    const repository = createRepository({
      households: [singleHome('user_a', 'user_b')],
      tasks: [{ _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'x', status: 'pending', createdBy: 'user_a', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:00:00.000Z' }],
      users: [profileFor('user_b', 'Xiaomei')],
    })
    const req = { taskId: 't1', ...CRED }
    await claimTask(req, dependencies(repository, { identityKey: 'user_b' }))
    await claimTask(req, dependencies(repository, { identityKey: 'user_b' }))
    const ops = [...repository._operations.values()].filter((o: any) => o.kind === 'claim')
    expect(ops).toHaveLength(1)
  })
})

// === completeTask ===

describe('completeTask', () => {
  const CRED = { requestId: 'request_bbbbbbbbbb', operationToken: 'operation_bbbbbbbbbb' }
  it('pending task can be completed by any member', async () => {
    const repository = createRepository({
      households: [singleHome('user_a', 'user_b')],
      tasks: [{ _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'x', status: 'pending', createdBy: 'user_a', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:00:00.000Z' }],
    })
    const result = await completeTask({ taskId: 't1', ...CRED }, dependencies(repository, { identityKey: 'user_b' }))
    expect(result.status).toBe('COMPLETED')
    expect(result.taskId).toBe('t1')
    expect(result.terminalAt).toBe('2026-08-14T10:00:00.000Z')
  })

  it('claimed task can be completed by any member (not only assignee)', async () => {
    const repository = createRepository({
      households: [singleHome('user_a', 'user_b')],
      tasks: [{ _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'x', status: 'claimed', assigneeKey: 'user_a', createdBy: 'user_a', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:30:00.000Z' }],
    })
    const result = await completeTask({ taskId: 't1', ...CRED }, dependencies(repository, { identityKey: 'user_b' }))
    expect(result.status).toBe('COMPLETED')
  })

  it('completing a completed task is rejected', async () => {
    const repository = createRepository({
      households: [singleHome()],
      tasks: [{ _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'x', status: 'completed', createdBy: 'user_creator', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T10:00:00.000Z', terminalAt: '2026-08-14T10:00:00.000Z', terminalBy: 'user_creator', terminalKind: 'completed' }],
    })
    await expect(completeTask({ taskId: 't1', ...CRED }, dependencies(repository))).rejects.toMatchObject({ code: 'TASK_TERMINAL' })
  })

  it('transaction failure leaves task and operations unchanged', async () => {
    const repository = createRepository({
      households: [singleHome()],
      tasks: [{ _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'x', status: 'pending', createdBy: 'user_creator', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:00:00.000Z' }],
    })
    repository.forceFailNextTransaction()
    await expect(completeTask({ taskId: 't1', ...CRED }, dependencies(repository))).rejects.toThrow(/forced/)
    expect((repository._tasks.get('t1') as any).status).toBe('pending')
    expect([...repository._operations.values()]).toHaveLength(0)
  })
})

// === abandonTask ===

describe('abandonTask', () => {
  const CRED = { requestId: 'request_cccccccccc', operationToken: 'operation_cccccccccc' }
  it('pending task can be abandoned by any member', async () => {
    const repository = createRepository({
      households: [singleHome()],
      tasks: [{ _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'x', status: 'pending', createdBy: 'user_creator', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:00:00.000Z' }],
    })
    const result = await abandonTask({ taskId: 't1', ...CRED }, dependencies(repository))
    expect(result.status).toBe('ABANDONED')
  })

  it('abandoning an abandoned task is rejected', async () => {
    const repository = createRepository({
      households: [singleHome()],
      tasks: [{ _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'x', status: 'abandoned', createdBy: 'user_creator', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T10:00:00.000Z', terminalAt: '2026-08-14T10:00:00.000Z', terminalBy: 'user_creator', terminalKind: 'abandoned' }],
    })
    await expect(abandonTask({ taskId: 't1', ...CRED }, dependencies(repository))).rejects.toMatchObject({ code: 'TASK_TERMINAL' })
  })
})

// === listCompletedTasks ===

describe('listCompletedTasks', () => {
  it('returns terminal tasks by terminalAt desc with nextCursor', async () => {
    const repository = createRepository({
      households: [singleHome()],
      tasks: [
        { _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'A', status: 'completed', createdBy: 'user_creator', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T10:00:00.000Z', terminalAt: '2026-08-14T10:00:00.000Z', terminalBy: 'user_creator', terminalKind: 'completed' },
        { _id: 't2', householdId: 'home_x', type: 'low_stock', title: 'B', status: 'completed', createdBy: 'user_creator', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T11:00:00.000Z', terminalAt: '2026-08-14T11:00:00.000Z', terminalBy: 'user_creator', terminalKind: 'completed' },
        { _id: 't3', householdId: 'home_x', type: 'low_stock', title: 'C', status: 'abandoned', createdBy: 'user_creator', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T12:00:00.000Z', terminalAt: '2026-08-14T12:00:00.000Z', terminalBy: 'user_creator', terminalKind: 'abandoned' },
      ],
      users: [profileFor('user_creator', 'Xiaoshuai')],
    })

    const result = await listCompletedTasks({ limit: 20 }, dependencies(repository))
    expect(result.status).toBe('LISTED')
    expect(result.items).toHaveLength(3)
    expect(result.items[0].id).toBe('t3')
    expect(result.items[2].id).toBe('t1')
  })

  it('completed list excludes open tasks', async () => {
    const repository = createRepository({
      households: [singleHome()],
      tasks: [{ _id: 't_open', householdId: 'home_x', type: 'low_stock', title: 'X', status: 'pending', createdBy: 'user_creator', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:00:00.000Z' }],
    })
    const result = await listCompletedTasks({ limit: 20 }, dependencies(repository))
    expect(result.items).toHaveLength(0)
  })

  it('non-member call is denied', async () => {
    const repository = createRepository({ households: [] })
    await expect(listCompletedTasks({ limit: 20 }, dependencies(repository))).rejects.toMatchObject({ code: 'TASK_FORBIDDEN' })
  })
})

// === Removed member access (PRD 004 R32) ===

describe('removed member access', () => {
  it('listCurrentTasks is denied for removed member', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_creator'] }],
      tasks: [{ _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'x', status: 'pending', createdBy: 'user_creator', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:00:00.000Z' }],
    })
    await expect(listCurrentTasks(dependencies(repository, { identityKey: 'user_removed' }))).rejects.toMatchObject({ code: 'TASK_FORBIDDEN' })
  })

  it('getTaskDetail is denied for removed member', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_creator'] }],
      tasks: [{ _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'x', status: 'pending', createdBy: 'user_creator', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:00:00.000Z' }],
    })
    await expect(getTaskDetail({ taskId: 't1' }, dependencies(repository, { identityKey: 'user_removed' }))).rejects.toMatchObject({ code: 'TASK_FORBIDDEN' })
  })

  it('orphan task remains visible to creator after member removal', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_creator'] }],
      tasks: [
        { _id: 't1', householdId: 'home_x', type: 'low_stock', title: 'orphan', status: 'pending', createdBy: 'user_other', createdAt: '2026-08-14T09:00:00.000Z', updatedAt: '2026-08-14T09:00:00.000Z' },
      ],
    })
    const result = await listCurrentTasks(dependencies(repository))
    expect(result.current.priority.length + result.current.groups.low_stock.length).toBe(1)
  })
})

// === computeIsOverdueOrToday ===

describe('computeIsOverdueOrToday', () => {
  it('today returns true', () => {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    expect(computeIsOverdueOrToday(`${yyyy}-${mm}-${dd}`)).toBe(true)
  })

  it('yesterday returns true', () => {
    const y = new Date(); y.setDate(y.getDate() - 1)
    const yyyy = y.getFullYear()
    const mm = String(y.getMonth() + 1).padStart(2, '0')
    const dd = String(y.getDate()).padStart(2, '0')
    expect(computeIsOverdueOrToday(`${yyyy}-${mm}-${dd}`)).toBe(true)
  })

  it('tomorrow returns false', () => {
    const t = new Date(); t.setDate(t.getDate() + 1)
    const yyyy = t.getFullYear()
    const mm = String(t.getMonth() + 1).padStart(2, '0')
    const dd = String(t.getDate()).padStart(2, '0')
    expect(computeIsOverdueOrToday(`${yyyy}-${mm}-${dd}`)).toBe(false)
  })

  it('undefined or empty returns false', () => {
    expect(computeIsOverdueOrToday(undefined)).toBe(false)
    expect(computeIsOverdueOrToday('')).toBe(false)
  })
})

// === TaskDomainError ===

describe('TaskDomainError', () => {
  it('carries code and retryable', () => {
    const error = new TaskDomainError('TASK_FORBIDDEN', false)
    expect(error.code).toBe('TASK_FORBIDDEN')
    expect(error.retryable).toBe(false)
    expect(error instanceof Error).toBe(true)
  })
})

// === 入口烟雾测试 ===
// 微信云函数加载时做 `handler = require('./index')` 然后找 `handler.main`。
// 如果 index.js 写了 `module.exports = exports.main`，require 返回 main 函数本身，
// `handler.main` 变成 undefined，云端会报 "handler not found"。
// 这个测试确保入口对象上有可调用的 main 导出，且不会因为任何赋值被覆盖。

describe('task cloud function entry shape', () => {
  it('index.js exports a callable main that survives module-level assignments', () => {
    const path = require('path')
    const entryPath = path.join(__dirname, '..', '..', 'cloudfunctions', 'task', 'index.js')
    // 直接读取源文件并检查关键模式，避免拉起 wx-server-sdk 真实环境。
    const fs = require('fs')
    const source = fs.readFileSync(entryPath, 'utf8')
    // 必须有 `exports.main = ` 赋值语句。
    expect(source).toMatch(/exports\.main\s*=\s*/)
    // 禁止出现 `module.exports = exports.main` —— 那种写法会覆盖整个导出对象，
    // 让云函数加载时找不到 `handler.main`，状态码 443，错误 "handler not found"。
    expect(source).not.toMatch(/module\.exports\s*=\s*exports\.main/)
  })
})

// === PRD 006：updateTask 域函数 ===

describe('updateTask', () => {
  const baseTask = {
    _id: 't1',
    householdId: 'home_x',
    type: 'to_handle',
    title: '原名',
    dueDate: '2026-08-20',
    note: '原备注',
    status: 'pending',
    createdBy: 'user_a',
    createdAt: '2026-08-14T09:00:00.000Z',
    updatedAt: '2026-08-14T09:00:00.000Z',
    comments: [],
    editVersion: 0,
  }

  it('happy path: 改 name / type / dueDate / note 全部生效，editVersion +1', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a', 'user_b'] }],
      tasks: [structuredClone(baseTask)],
      users: [
        { _id: 'user_a', nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
      ],
    })
    const result = await updateTask({
      taskId: 't1',
      name: '买 5L 装洗衣液',
      type: 'low_stock',
      dueDate: '2026-08-16',
      note: '替换装优先',
      editVersion: 0,
      requestId: 'request_aaaaaaaa01',
      operationToken: 'operation_aaaaaa01',
    }, dependencies(repository, { identityKey: 'user_a' }))

    expect(result.status).toBe('UPDATED')
    expect(result.editVersion).toBe(1)
    expect(result.task).toMatchObject({
      id: 't1',
      title: '买 5L 装洗衣液',
      type: 'low_stock',
      dueDate: '2026-08-16',
    })
    expect(result.events.map((e: any) => e.kind)).toEqual(['edit'])
    const editEvent = result.events.find((e: any) => e.kind === 'edit')
    expect(editEvent.changedFields).toEqual(expect.arrayContaining(['name', 'type', 'dueDate', 'note']))
  })

  it('editVersion 不匹配 → TASK_DUPLICATE_OPERATION', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a'] }],
      tasks: [structuredClone({ ...baseTask, editVersion: 3 })],
    })
    await expect(updateTask({
      taskId: 't1',
      name: 'x',
      editVersion: 0,
      requestId: 'request_aaaaaaaa02',
      operationToken: 'operation_aaaaaa02',
    }, dependencies(repository, { identityKey: 'user_a' }))).rejects.toMatchObject({ code: 'TASK_DUPLICATE_OPERATION' })
  })

  it('终态下编辑 → TASK_TERMINAL', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a'] }],
      tasks: [structuredClone({ ...baseTask, status: 'completed', terminalAt: '2026-08-15T10:00:00.000Z' })],
    })
    await expect(updateTask({
      taskId: 't1',
      name: 'x',
      editVersion: 0,
      requestId: 'request_aaaaaaaa03',
      operationToken: 'operation_aaaaaa03',
    }, dependencies(repository, { identityKey: 'user_a' }))).rejects.toMatchObject({ code: 'TASK_TERMINAL' })
  })

  it('非家庭成员 → TASK_FORBIDDEN', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a'] }],
      tasks: [structuredClone(baseTask)],
    })
    await expect(updateTask({
      taskId: 't1',
      name: 'x',
      editVersion: 0,
      requestId: 'request_aaaaaaaa04',
      operationToken: 'operation_aaaaaa04',
    }, dependencies(repository, { identityKey: 'user_outsider' }))).rejects.toMatchObject({ code: 'TASK_FORBIDDEN' })
  })

  it('空 changedFields 不写 edit 事件（R5 兜底）', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a'] }],
      tasks: [structuredClone(baseTask)],
    })
    const result = await updateTask({
      taskId: 't1',
      name: '原名',
      editVersion: 0,
      requestId: 'request_aaaaaaaa05',
      operationToken: 'operation_aaaaaa05',
    }, dependencies(repository, { identityKey: 'user_a' }))
    expect(result.editVersion).toBe(0)
    expect(result.events.filter((e: any) => e.kind === 'edit')).toHaveLength(0)
  })

  it('同 operationToken 重复提交幂等（不再产生新事件）', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a'] }],
      tasks: [structuredClone(baseTask)],
    })
    const input = {
      taskId: 't1',
      name: '新名',
      editVersion: 0,
      requestId: 'request_aaaaaaaa06',
      operationToken: 'operation_aaaaaa06',
    }
    const r1: any = await updateTask(input, dependencies(repository, { identityKey: 'user_a' }))
    expect(r1.editVersion).toBe(1)
    const r2: any = await updateTask(input, dependencies(repository, { identityKey: 'user_a' }))
    expect(r2.editVersion).toBe(1)
    expect(r2.events.filter((e: any) => e.kind === 'edit')).toHaveLength(1)
  })

  it('编辑 type 不会清空 assignee 等其他字段', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a', 'user_b'] }],
      tasks: [structuredClone({ ...baseTask, status: 'claimed', assigneeKey: 'user_b' })],
      users: [
        { _id: 'user_b', nickname: '小美', avatar: { kind: 'builtin', id: 'person-02' } },
      ],
    })
    const result = await updateTask({
      taskId: 't1',
      type: 'low_stock',
      editVersion: 0,
      requestId: 'request_aaaaaaaa07',
      operationToken: 'operation_aaaaaa07',
    }, dependencies(repository, { identityKey: 'user_a' }))
    expect(result.task.type).toBe('low_stock')
    expect(result.task.status).toBe('claimed')
    expect(result.task.assignee).toMatchObject({ nickname: '小美' })
  })

  it('dueDate 设为 null 清除截止日期', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a'] }],
      tasks: [structuredClone(baseTask)],
    })
    const result = await updateTask({
      taskId: 't1',
      dueDate: null,
      editVersion: 0,
      requestId: 'request_aaaaaaaa08',
      operationToken: 'operation_aaaaaa08',
    }, dependencies(repository, { identityKey: 'user_a' }))
    expect(result.task.dueDate).toBeUndefined()
  })
})

// === PRD 006：addComment 域函数 ===

describe('addComment', () => {
  const baseTask = {
    _id: 't1',
    householdId: 'home_x',
    type: 'to_handle',
    title: 'X',
    status: 'pending',
    createdBy: 'user_a',
    createdAt: '2026-08-14T09:00:00.000Z',
    updatedAt: '2026-08-14T09:00:00.000Z',
    comments: [],
    editVersion: 0,
  }

  it('happy path: 评论落到 comments 数组，detail 返回最新', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a', 'user_b'] }],
      tasks: [structuredClone(baseTask)],
      users: [
        { _id: 'user_a', nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
      ],
    })
    const result: any = await addComment({
      taskId: 't1',
      text: '好的，我下班顺路买',
      requestId: 'request_bbbbbbbb01',
      operationToken: 'operation_bbbbbb01',
    }, dependencies(repository, { identityKey: 'user_a' }))
    expect(result.status).toBe('COMMENTED')
    expect(result.detail.comments).toHaveLength(1)
    expect(result.detail.comments[0]).toMatchObject({
      text: '好的，我下班顺路买',
      actor: { nickname: '小帅' },
    })
    expect(typeof result.detail.comments[0].id).toBe('string')
  })

  it('终态下加评论 → TASK_TERMINAL', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a'] }],
      tasks: [structuredClone({ ...baseTask, status: 'completed', terminalAt: '2026-08-15T10:00:00.000Z' })],
    })
    await expect(addComment({
      taskId: 't1',
      text: '好的',
      requestId: 'request_bbbbbbbb02',
      operationToken: 'operation_bbbbbb02',
    }, dependencies(repository, { identityKey: 'user_a' }))).rejects.toMatchObject({ code: 'TASK_TERMINAL' })
  })

  it('非家庭成员 → TASK_FORBIDDEN', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a'] }],
      tasks: [structuredClone(baseTask)],
    })
    await expect(addComment({
      taskId: 't1',
      text: '好的',
      requestId: 'request_bbbbbbbb03',
      operationToken: 'operation_bbbbbb03',
    }, dependencies(repository, { identityKey: 'user_outsider' }))).rejects.toMatchObject({ code: 'TASK_FORBIDDEN' })
  })

  it('text 超过 200 字拒绝', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a'] }],
      tasks: [structuredClone(baseTask)],
    })
    const long = '一'.repeat(201)
    await expect(addComment({
      taskId: 't1',
      text: long,
      requestId: 'request_bbbbbbbb04',
      operationToken: 'operation_bbbbbb04',
    }, dependencies(repository, { identityKey: 'user_a' }))).rejects.toMatchObject({ code: 'TASK_INVALID_REQUEST' })
  })

  it('text 为空 / 纯空白拒绝', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a'] }],
      tasks: [structuredClone(baseTask)],
    })
    await expect(addComment({ taskId: 't1', text: '', requestId: 'request_bbbbbbbb05', operationToken: 'operation_bbbbbb05' }, dependencies(repository, { identityKey: 'user_a' }))).rejects.toMatchObject({ code: 'TASK_INVALID_REQUEST' })
    await expect(addComment({ taskId: 't1', text: '   ', requestId: 'request_bbbbbbbb06', operationToken: 'operation_bbbbbb06' }, dependencies(repository, { identityKey: 'user_a' }))).rejects.toMatchObject({ code: 'TASK_INVALID_REQUEST' })
  })

  it('同 operationToken 重复提交幂等（评论数不增长）', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a'] }],
      tasks: [structuredClone(baseTask)],
      users: [
        { _id: 'user_a', nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
      ],
    })
    const input = { taskId: 't1', text: '好的', requestId: 'request_bbbbbbbb07', operationToken: 'operation_bbbbbb07' }
    const r1: any = await addComment(input, dependencies(repository, { identityKey: 'user_a' }))
    const r2: any = await addComment(input, dependencies(repository, { identityKey: 'user_a' }))
    expect(r1.detail.comments).toHaveLength(1)
    expect(r2.detail.comments).toHaveLength(1)
  })

  it('多条评论按 at 倒序', async () => {
    const repository = createRepository({
      households: [{ _id: 'home_x', memberKeys: ['user_a', 'user_b'] }],
      tasks: [structuredClone(baseTask)],
      users: [
        { _id: 'user_a', nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
        { _id: 'user_b', nickname: '小美', avatar: { kind: 'builtin', id: 'person-02' } },
      ],
    })
    await addComment({ taskId: 't1', text: '第一条', requestId: 'request_bbbbbbbb08', operationToken: 'operation_bbbbbb08' }, dependencies(repository, { identityKey: 'user_a' }))
    await addComment({ taskId: 't1', text: '第二条', requestId: 'request_bbbbbbbb09', operationToken: 'operation_bbbbbb09' }, dependencies(repository, { identityKey: 'user_b' }))
    const detail: any = await getTaskDetail({ taskId: 't1' }, dependencies(repository, { identityKey: 'user_a' }))
    expect(detail.detail.comments.map((c: any) => c.text)).toEqual(['第二条', '第一条'])
  })
})
