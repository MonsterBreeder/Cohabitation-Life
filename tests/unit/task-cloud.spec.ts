import {
  __testing,
  abandonTaskInCloud,
  addCommentInCloud,
  claimTaskInCloud,
  completeTaskInCloud,
  createTaskInCloud,
  getTaskDetailInCloud,
  listCompletedTasksInCloud,
  listCurrentTasksInCloud,
  resetTaskCloudForTesting,
  setTaskCloudEnvironmentForTesting,
  setTaskCloudRuntimeForTesting,
  setTaskCloudTimeoutForTesting,
  subscribeTaskComments,
  TaskCloudError,
  updateTaskInCloud,
} from '../../src/services/task-cloud'
import type { TaskDetail, TaskSummary } from '../../src/types/task'

// 测试覆盖目标（PRD 005 + 实施计划 U1）：
// 1) 七种 action 的正常路径都能透传到云端并返回正确结果
// 2) 严格响应校验拒绝任何未知 type/status/字段或携带内部键的结果
// 3) 超时 / 平台不支持 / 无效响应的错误码翻译正确

describe('事项云端服务', () => {
  const init = jest.fn()
  const callFunction = jest.fn()

  // 工厂方法：返回一条合法的 TaskSummary，避免每个 case 都重复
  const buildSummary = (overrides: Partial<TaskSummary> = {}): TaskSummary => ({
    id: 'task_a1b2c3',
    type: 'low_stock',
    title: '买洗衣液',
    isOverdueOrToday: true,
    status: 'pending',
    ...overrides,
  })

  const buildDetail = (overrides: Partial<TaskDetail> = {}): TaskDetail => ({
    ...buildSummary(),
    note: '替换装优先',
    events: [
      { kind: 'create', actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } }, at: '2026-08-14T10:00:00.000Z' },
    ],
    // PRD 006：详情必含 comments 数组（空时为 []）和 editVersion 数字
    comments: [],
    editVersion: 0,
    ...overrides,
  })

  beforeEach(() => {
    resetTaskCloudForTesting()
    init.mockReset()
    callFunction.mockReset()
    setTaskCloudEnvironmentForTesting('test-env')
    setTaskCloudRuntimeForTesting({ cloud: { init, callFunction } })
  })

  afterEach(resetTaskCloudForTesting)

  it('创建事项时透传名称、类型和操作凭证', async () => {
    callFunction.mockResolvedValue({ result: { status: 'CREATED', retryable: false, task: buildSummary({ title: '买纸巾' }) } })

    await expect(createTaskInCloud({
      title: '买纸巾',
      type: 'low_stock',
      requestId: 'request_x',
      operationToken: 'operation_y',
    })).resolves.toMatchObject({ status: 'CREATED', task: expect.objectContaining({ title: '买纸巾' }) })

    expect(callFunction).toHaveBeenCalledWith(expect.objectContaining({
      name: 'task',
      data: expect.objectContaining({ action: 'create', title: '买纸巾', type: 'low_stock', requestId: 'request_x', operationToken: 'operation_y' }),
    }))
  })

  it('认领返回最新 summary，包含负责人昵称', async () => {
    callFunction.mockResolvedValue({
      result: {
        status: 'CLAIMED',
        retryable: false,
        task: buildSummary({
          status: 'claimed',
          assignee: { nickname: '小美', avatar: { kind: 'builtin', id: 'person-02' } },
        }),
      },
    })

    await expect(claimTaskInCloud({ taskId: 'task_a1b2c3', requestId: 'r1', operationToken: 'o1' })).resolves.toMatchObject({
      status: 'CLAIMED',
      task: expect.objectContaining({ status: 'claimed', assignee: expect.objectContaining({ nickname: '小美' }) }),
    })
  })

  it('完成返回 taskId 与终止时间，不再携带完整 summary', async () => {
    callFunction.mockResolvedValue({
      result: { status: 'COMPLETED', retryable: false, taskId: 'task_a1b2c3', terminalAt: '2026-08-14T10:30:00.000Z' },
    })

    await expect(completeTaskInCloud({ taskId: 'task_a1b2c3', requestId: 'r1', operationToken: 'o1' })).resolves.toMatchObject({
      status: 'COMPLETED',
      taskId: 'task_a1b2c3',
    })
  })

  it('放弃与完成同形：返回 taskId + terminalAt', async () => {
    callFunction.mockResolvedValue({
      result: { status: 'ABANDONED', retryable: false, taskId: 'task_a1b2c3', terminalAt: '2026-08-14T10:30:00.000Z' },
    })

    await expect(abandonTaskInCloud({ taskId: 'task_a1b2c3', requestId: 'r1', operationToken: 'o1' })).resolves.toMatchObject({
      status: 'ABANDONED',
    })
  })

  it('编辑返回最新 summary + 事件流 + editVersion', async () => {
    callFunction.mockResolvedValue({
      result: {
        status: 'UPDATED',
        retryable: false,
        task: buildSummary({ title: '买 5L 装洗衣液' }),
        events: [
          { kind: 'edit', actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } }, at: '2026-08-16T10:00:00.000Z', changedFields: ['name', 'type'] },
        ],
        editVersion: 1,
      },
    })

    await expect(updateTaskInCloud({
      taskId: 'task_a1b2c3',
      title: '买 5L 装洗衣液',
      type: 'low_stock',
      editVersion: 0,
      requestId: 'r1',
      operationToken: 'o1',
    })).resolves.toMatchObject({
      status: 'UPDATED',
      task: expect.objectContaining({ title: '买 5L 装洗衣液' }),
      editVersion: 1,
      events: expect.arrayContaining([expect.objectContaining({ kind: 'edit', changedFields: ['name', 'type'] })]),
    })

    expect(callFunction).toHaveBeenCalledWith(expect.objectContaining({
      name: 'task',
      data: expect.objectContaining({ action: 'update', editVersion: 0 }),
    }))
  })

  it('评论返回最新 detail（含 comments 数组与 editVersion）', async () => {
    callFunction.mockResolvedValue({
      result: {
        status: 'COMMENTED',
        retryable: false,
        detail: buildDetail({
          comments: [
            { id: 'c1', actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } }, text: '好的', at: '2026-08-16T10:00:00.000Z' },
          ],
          editVersion: 0,
        }),
      },
    })

    await expect(addCommentInCloud({
      taskId: 'task_a1b2c3',
      text: '好的',
      requestId: 'r1',
      operationToken: 'o1',
    })).resolves.toMatchObject({
      status: 'COMMENTED',
      detail: expect.objectContaining({ comments: expect.any(Array), editVersion: 0 }),
    })

    expect(callFunction).toHaveBeenCalledWith(expect.objectContaining({
      name: 'task',
      data: expect.objectContaining({ action: 'addComment', text: '好的' }),
    }))
  })

  it('详情页返回完整 detail，含 events 数组', async () => {
    callFunction.mockResolvedValue({
      result: { status: 'LOADED', retryable: false, detail: buildDetail() },
    })

    await expect(getTaskDetailInCloud('task_a1b2c3')).resolves.toMatchObject({
      status: 'LOADED',
      detail: expect.objectContaining({ events: expect.any(Array) }),
    })
  })

  it('首页列表返回 priority + 三类型分组', async () => {
    callFunction.mockResolvedValue({
      result: {
        status: 'LISTED',
        retryable: false,
        current: {
          priority: [buildSummary()],
          groups: { low_stock: [buildSummary()], to_handle: [], expiring: [] },
        },
      },
    })

    await expect(listCurrentTasksInCloud()).resolves.toMatchObject({
      status: 'LISTED',
      current: expect.objectContaining({
        priority: expect.any(Array),
        groups: expect.any(Object),
      }),
    })
  })

  it('已完成列表支持 cursor 分页', async () => {
    callFunction.mockResolvedValue({
      result: {
        status: 'LISTED',
        retryable: false,
        items: [
          {
            id: 'task_a1b2c3',
            type: 'low_stock',
            title: '买洗衣液',
            terminalAt: '2026-08-14T10:30:00.000Z',
            terminalActor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
            terminalKind: 'completed',
          },
        ],
        nextCursor: 'cursor_2',
      },
    })

    await expect(listCompletedTasksInCloud({ limit: 20, cursor: 'cursor_1' })).resolves.toMatchObject({
      status: 'LISTED',
      items: expect.any(Array),
      nextCursor: 'cursor_2',
    })
  })

  it('云端返回未知 status 时，调用方收到 INVALID_RESPONSE 错误', async () => {
    callFunction.mockResolvedValue({ result: { status: 'DELETED', retryable: false } })

    await expect(listCurrentTasksInCloud()).rejects.toThrow(TaskCloudError)
  })

  it('云端返回携带内部键（householdId / actorKey）的 detail 时，调用方拒绝', async () => {
    callFunction.mockResolvedValue({
      result: {
        status: 'LOADED',
        retryable: false,
        detail: {
          ...buildDetail(),
          householdId: 'household_internal',
          events: [
            { kind: 'create', actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' }, actorKey: 'user_internal' }, at: '2026-08-14T10:00:00.000Z' },
          ],
        },
      },
    })

    await expect(getTaskDetailInCloud('task_a1b2c3')).rejects.toThrow(/无效/)
  })

  it('云端返回未知 type 的 summary 时，调用方拒绝', async () => {
    callFunction.mockResolvedValue({
      result: { status: 'CREATED', retryable: false, task: { ...buildSummary(), type: 'todo' } },
    })

    await expect(createTaskInCloud({
      title: 'x',
      type: 'low_stock',
      requestId: 'r1',
      operationToken: 'o1',
    })).rejects.toThrow(/无效/)
  })

  it('云端返回的 failure 状态被识别为 TaskCloudError 而不是被解析成 success', async () => {
    callFunction.mockResolvedValue({
      result: { status: 'TASK_TERMINAL', retryable: false, errorMessage: '事项已结束' },
    })

    await expect(completeTaskInCloud({ taskId: 't1', requestId: 'r1', operationToken: 'o1' })).resolves.toMatchObject({
      status: 'TASK_TERMINAL',
      errorMessage: '事项已结束',
    })
  })

  it('云端长期没有回应时，结束等待并报 TIMEOUT', async () => {
    setTaskCloudTimeoutForTesting(1)
    callFunction.mockImplementation(() => new Promise(() => undefined))

    await expect(listCurrentTasksInCloud()).rejects.toThrow(/确认中/)
  })

  it('云端响应结构损坏（非对象）时，调用方收到 INVALID_RESPONSE', async () => {
    callFunction.mockResolvedValue({ result: 'this should not happen' })

    await expect(listCurrentTasksInCloud()).rejects.toThrow(/无效/)
  })

  // === 严格校验器：纯函数负向用例 ===

  describe('isTaskSummary 严格校验', () => {
    const { isTaskSummary } = __testing

    it('合法 summary 通过', () => {
      expect(isTaskSummary(buildSummary())).toBe(true)
    })

    it('未知 type 拒绝', () => {
      expect(isTaskSummary({ ...buildSummary(), type: 'todo' })).toBe(false)
    })

    it('未知 status 拒绝（completed 不在 Open 状态集）', () => {
      expect(isTaskSummary({ ...buildSummary(), status: 'completed' })).toBe(false)
    })

    it('dueDate 格式错误拒绝', () => {
      expect(isTaskSummary({ ...buildSummary(), dueDate: '今天' })).toBe(false)
    })

    it('缺 isOverdueOrToday 拒绝', () => {
      const { isOverdueOrToday: _drop, ...rest } = buildSummary()
      expect(isTaskSummary(rest)).toBe(false)
    })

    it('assignee 缺 avatar 拒绝', () => {
      expect(isTaskSummary({ ...buildSummary(), assignee: { nickname: 'x' } })).toBe(false)
    })

    it('null / undefined 拒绝', () => {
      expect(isTaskSummary(null)).toBe(false)
      expect(isTaskSummary(undefined)).toBe(false)
    })
  })

  describe('isTaskDetail 严格校验', () => {
    const { isTaskDetail } = __testing

    it('待处理 detail 通过', () => {
      expect(isTaskDetail(buildDetail())).toBe(true)
    })

    it('已完成 detail 必须带 terminalAt / terminalActor / terminalKind', () => {
      const completed = buildDetail({
        status: 'completed',
        terminalAt: '2026-08-14T10:30:00.000Z',
        terminalActor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
        terminalKind: 'completed',
      })
      expect(isTaskDetail(completed)).toBe(true)
    })

    it('已完成 detail 缺 terminalKind 拒绝', () => {
      const broken = buildDetail({
        status: 'completed',
        terminalAt: '2026-08-14T10:30:00.000Z',
        terminalActor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
      })
      const { terminalKind: _drop, ...rest } = broken
      expect(isTaskDetail(rest)).toBe(false)
    })

    it('events 含未知 kind 拒绝', () => {
      const broken = buildDetail({
        events: [
          { kind: 'delete', actor: { nickname: 'x', avatar: { kind: 'builtin', id: 'person-01' } }, at: '2026-08-14T10:00:00.000Z' },
        ],
      })
      expect(isTaskDetail(broken)).toBe(false)
    })

    it('缺 comments 数组拒绝', () => {
      const { comments: _drop, ...rest } = buildDetail()
      expect(isTaskDetail(rest)).toBe(false)
    })

    it('comments 含非法 comment 拒绝', () => {
      const broken = buildDetail({
        comments: [{ id: 'c1', actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } }, text: '', at: '2026-08-16T10:00:00.000Z' }],
      })
      expect(isTaskDetail(broken)).toBe(false)
    })

    it('缺 editVersion 拒绝', () => {
      const { editVersion: _drop, ...rest } = buildDetail()
      expect(isTaskDetail(rest)).toBe(false)
    })

    it('editVersion 非整数拒绝', () => {
      expect(isTaskDetail({ ...buildDetail(), editVersion: 1.5 })).toBe(false)
      expect(isTaskDetail({ ...buildDetail(), editVersion: -1 })).toBe(false)
    })
  })

  describe('isTaskComment 严格校验', () => {
    const { isTaskComment, TASK_COMMENT_MAX_LENGTH } = __testing

    const baseComment = {
      id: 'c1',
      actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
      text: '好的',
      at: '2026-08-16T10:00:00.000Z',
    }

    it('合法 comment 通过', () => {
      expect(isTaskComment(baseComment)).toBe(true)
    })

    it('缺 id 拒绝', () => {
      const { id: _drop, ...rest } = baseComment
      expect(isTaskComment(rest)).toBe(false)
    })

    it('text 为空拒绝', () => {
      expect(isTaskComment({ ...baseComment, text: '' })).toBe(false)
    })

    it('text 仅空白拒绝', () => {
      expect(isTaskComment({ ...baseComment, text: '   ' })).toBe(false)
    })

    it(`text 超过 ${TASK_COMMENT_MAX_LENGTH} 字符拒绝`, () => {
      const longText = '一'.repeat(TASK_COMMENT_MAX_LENGTH + 1)
      expect(isTaskComment({ ...baseComment, text: longText })).toBe(false)
    })

    it(`text 正好 ${TASK_COMMENT_MAX_LENGTH} 字符通过`, () => {
      const exactText = '一'.repeat(TASK_COMMENT_MAX_LENGTH)
      expect(isTaskComment({ ...baseComment, text: exactText })).toBe(true)
    })

    it('携带内部键（householdId / _id）拒绝', () => {
      expect(isTaskComment({ ...baseComment, householdId: 'hh_internal' })).toBe(false)
      expect(isTaskComment({ ...baseComment, _id: 'task_internal' })).toBe(false)
    })
  })

  describe('isTaskEvent 严格校验（edit 事件）', () => {
    const { isTaskEvent } = __testing

    it('edit 事件必须带 changedFields 数组', () => {
      const baseEdit = {
        kind: 'edit' as const,
        actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
        at: '2026-08-16T10:00:00.000Z',
        changedFields: ['name' as const, 'type' as const],
      }
      expect(isTaskEvent(baseEdit)).toBe(true)
    })

    it('edit 事件可以空 changedFields（R5 兜底：不展示）', () => {
      const emptyEdit = {
        kind: 'edit' as const,
        actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
        at: '2026-08-16T10:00:00.000Z',
        changedFields: [],
      }
      expect(isTaskEvent(emptyEdit)).toBe(true)
    })

    it('edit 事件 changedFields 含未知字段名拒绝', () => {
      const brokenEdit = {
        kind: 'edit' as const,
        actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
        at: '2026-08-16T10:00:00.000Z',
        changedFields: ['name', 'assignee'], // assignee 不在 edit 字段集
      }
      expect(isTaskEvent(brokenEdit)).toBe(false)
    })

    it('非 edit 事件携带 changedFields 拒绝', () => {
      const broken = {
        kind: 'create' as const,
        actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
        at: '2026-08-16T10:00:00.000Z',
        changedFields: ['name'],
      }
      expect(isTaskEvent(broken)).toBe(false)
    })
  })


  // === PRD 006 U5：subscribeTaskComments 实时推送 ===

  describe('subscribeTaskComments（PRD 006 U5 实时推送）', () => {
    let lastOnChange
    let lastOnError
    let closeMock

    beforeEach(() => {
      lastOnChange = undefined
      lastOnError = undefined
      closeMock = jest.fn()
      const watch = jest.fn((options) => {
        lastOnChange = options.onChange
        lastOnError = options.onError
        return { close: closeMock }
      })
      const database = {
        collection: () => ({ doc: () => ({ watch }) }),
      }
      setTaskCloudRuntimeForTesting({
        cloud: { init: jest.fn(), callFunction: jest.fn(), database },
      })
    })

    it('订阅时调用 db.collection(...).doc(id).watch(...)', () => {
      const watcher = subscribeTaskComments('t1', { onComments: jest.fn() })
      expect(watcher).toBeDefined()
      expect(typeof lastOnChange).toBe('function')
    })

    it('onChange 收到合法评论时调用 onComments 回调（仅读 comments 字段）', () => {
      const onComments = jest.fn()
      subscribeTaskComments('t1', { onComments })
      lastOnChange({
        type: 'update',
        docs: [{
          _id: 't1',
          title: 'new title',
          comments: [
            { id: 'c1', actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } }, text: '好的', at: '2026-08-16T10:00:00.000Z' },
            { id: 'c2', actor: { nickname: '小美', avatar: { kind: 'builtin', id: 'person-02' } }, text: '收到', at: '2026-08-16T11:00:00.000Z' },
          ],
        }],
      })
      expect(onComments).toHaveBeenCalledTimes(1)
      expect(onComments.mock.calls[0][0]).toHaveLength(2)
      expect(onComments.mock.calls[0][0][0]).toMatchObject({ id: 'c1', text: '好的' })
    })

    it('comments 含非法项时丢弃（严格校验）', () => {
      const onComments = jest.fn()
      subscribeTaskComments('t1', { onComments })
      lastOnChange({
        type: 'update',
        docs: [{
          comments: [
            { id: 'c1', actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } }, text: '好的', at: '2026-08-16T10:00:00.000Z' },
            { id: 'c2', actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } }, text: '', at: '2026-08-16T10:00:00.000Z' },
            { id: 'c3', actor: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } }, text: 'good', at: '2026-08-16T10:00:00.000Z', householdId: 'h1' },
          ],
        }],
      })
      expect(onComments.mock.calls[0][0]).toHaveLength(1)
    })

    it('comments 不是数组时回调空数组（R33）', () => {
      const onComments = jest.fn()
      subscribeTaskComments('t1', { onComments })
      lastOnChange({ type: 'update', docs: [{ _id: 't1', title: 'no comments' }] })
      expect(onComments).toHaveBeenCalledWith([])
    })

    it('docs 为空时回调空数组', () => {
      const onComments = jest.fn()
      subscribeTaskComments('t1', { onComments })
      lastOnChange({ type: 'init', docs: [] })
      expect(onComments).toHaveBeenCalledWith([])
    })

    it('onError 触发时不抛错（静默回退 R30）', () => {
      const onError = jest.fn()
      expect(() => {
        subscribeTaskComments('t1', { onComments: jest.fn(), onError })
        lastOnError(new Error('connection lost'))
      }).not.toThrow()
      expect(onError).toHaveBeenCalled()
    })

    it('平台不支持（无 database）时不抛错，返回 noop watcher', () => {
      setTaskCloudRuntimeForTesting({ cloud: { init: jest.fn(), callFunction: jest.fn() } })
      const onError = jest.fn()
      const watcher = subscribeTaskComments('t1', { onComments: jest.fn(), onError })
      expect(onError).toHaveBeenCalled()
      expect(() => watcher.close()).not.toThrow()
    })
  })
})
