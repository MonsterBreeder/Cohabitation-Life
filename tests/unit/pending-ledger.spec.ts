import { clearPendingLedger, readPendingLedger, writePendingLedger, type PendingLedger } from '../../src/utils/pending-ledger'

// 模拟 uni storage 接口，让 pending-ledger 写盘在 Node 测试环境也能工作。
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

describe('pending-ledger', () => {
  it('returns undefined when storage is empty', () => {
    expect(readPendingLedger()).toBeUndefined()
  })

  it('writes and reads add-pending with draft', () => {
    const pending: PendingLedger = {
      kind: 'add',
      requestId: 'req_1',
      operationToken: 'op_1',
      startedAt: Date.now(),
      draft: {
        type: 'expense',
        amountCents: 5000,
        categoryId: 'cat_1',
        payerMemberKey: 'mem_1',
        note: '买菜',
        occurredAt: '2026-08-17T10:00:00.000Z',
        receiptMediaId: null,
      },
    }
    writePendingLedger(pending)
    const read = readPendingLedger()
    expect(read).toBeDefined()
    expect(read!.kind).toBe('add')
    expect((read!.draft as any).amountCents).toBe(5000)
  })

  it('writes and reads update-pending with entryId', () => {
    const pending: PendingLedger = {
      kind: 'update',
      entryId: 'entry_1',
      requestId: 'req_2',
      operationToken: 'op_2',
      startedAt: Date.now(),
      draft: {
        type: 'income',
        amountCents: 100000,
        categoryId: 'cat_2',
        payerMemberKey: 'mem_2',
        note: '',
        occurredAt: '2026-08-17T11:00:00.000Z',
        receiptMediaId: null,
      },
    }
    writePendingLedger(pending)
    const read = readPendingLedger()
    expect(read!.entryId).toBe('entry_1')
    expect(read!.kind).toBe('update')
  })

  it('expired pending returns undefined and clears storage', () => {
    const pending: PendingLedger = {
      kind: 'add',
      requestId: 'req_3',
      operationToken: 'op_3',
      startedAt: Date.now() - 6 * 60 * 1000, // 6 分钟前，超过 5 分钟 TTL
    }
    writePendingLedger(pending)
    expect(readPendingLedger()).toBeUndefined()
    expect(fakeStorage.has('ledger.pending.operation')).toBe(false)
  })

  it('clearPendingLedger removes storage', () => {
    const pending: PendingLedger = {
      kind: 'add',
      requestId: 'req_4',
      operationToken: 'op_4',
      startedAt: Date.now(),
    }
    writePendingLedger(pending)
    clearPendingLedger()
    expect(readPendingLedger()).toBeUndefined()
  })
})
