declare function require(path: string): any

const {
  createTask,
  listCurrentTasks,
  getTaskDetail,
  claimTask,
  completeTask,
  abandonTask,
  listCompletedTasks,
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
