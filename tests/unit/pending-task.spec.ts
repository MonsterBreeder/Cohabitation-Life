import {
  clearPendingTask,
  readPendingTask,
  writePendingTask,
} from '../../src/utils/pending-task'

// 模拟 uni storage 接口的最小子集
const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  // 让 uni.* 全局可用 storage 替身
  ;(globalThis as any).uni = {
    getStorageSync: (key: string) => (storage.has(key) ? storage.get(key) : ''),
    setStorageSync: (key: string, value: string) => { storage.set(key, value) },
    removeStorageSync: (key: string) => { storage.delete(key) },
  }
})

describe('pending-task storage', () => {
  it('returns undefined when storage is empty', () => {
    expect(readPendingTask()).toBeUndefined()
  })

  it('round-trips a valid pending task', () => {
    const now = Date.now()
    writePendingTask({
      kind: 'create',
      requestId: 'request_abcdef0123456789',
      operationToken: 'operation_abcdef0123456789',
      startedAt: now,
    })
    const result = readPendingTask()
    expect(result?.kind).toBe('create')
    expect(result?.requestId).toBe('request_abcdef0123456789')
    expect(result?.operationToken).toBe('operation_abcdef0123456789')
    expect(result?.startedAt).toBe(now)
  })

  it('preserves create draft (title, type, dueDate, note)', () => {
    writePendingTask({
      kind: 'create',
      requestId: 'request_draft',
      operationToken: 'operation_draft',
      startedAt: Date.now(),
      draft: { title: 'Buy tissue', type: 'low_stock', dueDate: '2026-08-20', note: 'urgent' },
    })
    const result = readPendingTask()
    expect(result?.draft).toEqual({ title: 'Buy tissue', type: 'low_stock', dueDate: '2026-08-20', note: 'urgent' })
  })

  it('returns undefined and clears storage for expired task', () => {
    const oldStart = Date.now() - 6 * 60 * 1000 // 6 minutes ago, beyond TTL
    writePendingTask({
      kind: 'create',
      requestId: 'request_expired',
      operationToken: 'operation_expired',
      startedAt: oldStart,
    })
    expect(readPendingTask()).toBeUndefined()
    // storage should be cleaned
    expect(storage.size).toBe(0)
  })

  it('returns undefined for corrupted JSON', () => {
    storage.set('task.pending.operation', '{not valid')
    expect(readPendingTask()).toBeUndefined()
    expect(storage.size).toBe(0)
  })

  it('returns undefined for missing required fields', () => {
    storage.set('task.pending.operation', JSON.stringify({ kind: 'create' }))
    expect(readPendingTask()).toBeUndefined()
  })

  it('clearPendingTask removes the entry', () => {
    writePendingTask({
      kind: 'claim',
      taskId: 'task_x',
      requestId: 'request_claim',
      operationToken: 'operation_claim',
      startedAt: Date.now(),
    })
    expect(readPendingTask()).toBeDefined()
    clearPendingTask()
    expect(readPendingTask()).toBeUndefined()
  })

  it('overwrites previous pending task', () => {
    writePendingTask({
      kind: 'create',
      requestId: 'request_first',
      operationToken: 'operation_first',
      startedAt: Date.now(),
    })
    writePendingTask({
      kind: 'claim',
      taskId: 'task_x',
      requestId: 'request_second',
      operationToken: 'operation_second',
      startedAt: Date.now(),
    })
    const result = readPendingTask()
    expect(result?.kind).toBe('claim')
    expect(result?.requestId).toBe('request_second')
  })
})
