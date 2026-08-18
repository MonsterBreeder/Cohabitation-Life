import {
  addLedgerCategoryInCloud,
  addLedgerEntryInCloud,
  deleteLedgerEntryInCloud,
  getLedgerEntryInCloud,
  getLedgerStatsInCloud,
  humaniseLedgerError,
  initLedgerCategoriesInCloud,
  isLedgerCategory,
  isLedgerEntry,
  LedgerCloudError,
  listLedgerEntriesInCloud,
  resetLedgerCloudForTesting,
  restoreLedgerEntryInCloud,
  setLedgerCloudEnvironmentForTesting,
  setLedgerCloudRuntimeForTesting,
  setLedgerCloudTimeoutForTesting,
  updateLedgerCategoryInCloud,
  updateLedgerEntryInCloud,
  removeLedgerCategoryInCloud,
} from '../../src/services/ledger-cloud'

function makeEntry(overrides: any = {}): any {
  return {
    id: 'ledger_xxxxxxxxxxxxx_1',
    type: 'expense',
    amountCents: 5000,
    categoryId: 'cat_xxxxxxxxxxxxx_1',
    note: '买菜',
    occurredAt: '2026-08-17T10:00:00.000Z',
    receiptMediaId: null,
    payer: { memberKey: 'user_self', nickname: '我', avatar: { kind: 'builtin', id: 'person-neutral' } },
    createdAt: '2026-08-17T10:00:00.000Z',
    ...overrides,
  }
}

function makeCategory(overrides: any = {}): any {
  return {
    id: 'cat_xxxxxxxxxxxxx_1',
    key: 'dining',
    name: '餐饮',
    iconKey: 'fork-spoon',
    colorKey: 'amber',
    isCustom: false,
    sortOrder: 0,
    ...overrides,
  }
}

function makeRuntime(result: unknown, delay = 0): any {
  let resolveCall: ((v: unknown) => void) | undefined
  const callPromise = new Promise<unknown>((resolve) => { resolveCall = resolve })
  return {
    call: callPromise,
    runtime: {
      cloud: {
        init: jest.fn(),
        callFunction: jest.fn(async () => {
          if (delay > 0) await new Promise((r) => setTimeout(r, delay))
          return { result }
        }),
      },
    },
    resolveCall,
  }
}

beforeEach(() => {
  resetLedgerCloudForTesting()
  setLedgerCloudEnvironmentForTesting('test-env')
})

describe('ledger-cloud validators', () => {
  it('isLedgerEntry accepts well-formed entry', () => {
    expect(isLedgerEntry(makeEntry())).toBe(true)
  })

  it('isLedgerEntry rejects negative amountCents', () => {
    expect(isLedgerEntry(makeEntry({ amountCents: -1 }))).toBe(false)
  })

  it('isLedgerEntry rejects missing payer', () => {
    expect(isLedgerEntry(makeEntry({ payer: undefined }))).toBe(false)
  })

  it('isLedgerCategory accepts well-formed category', () => {
    expect(isLedgerCategory(makeCategory())).toBe(true)
  })

  it('isLedgerCategory rejects unknown iconKey', () => {
    expect(isLedgerCategory(makeCategory({ iconKey: 'invalid' }))).toBe(false)
  })
})

describe('humaniseLedgerError', () => {
  it('translates known codes', () => {
    expect(humaniseLedgerError('LEDGER_NOT_FOUND')).toBe('账目不存在')
    expect(humaniseLedgerError('LEDGER_AMOUNT_INVALID')).toBe('金额格式不正确')
  })

  it('returns generic for unknown', () => {
    expect(humaniseLedgerError('UNKNOWN_CODE')).toBe('请求暂时无法处理，请稍后重试')
    expect(humaniseLedgerError(undefined)).toBe('请求暂时无法处理，请稍后重试')
  })
})

describe('addLedgerEntryInCloud', () => {
  it('returns ADDED result on success', async () => {
    const entry = makeEntry()
    const { runtime } = makeRuntime({ status: 'ADDED', entry })
    setLedgerCloudRuntimeForTesting(runtime)
    const result = await addLedgerEntryInCloud({
      requestId: 'req_xxxxxxxxxxxxx_1',
      operationToken: 'op_xxxxxxxxxxxxx_1',
      type: 'expense',
      amountCents: 5000,
      categoryId: 'cat_xxxxxxxxxxxxx_1',
      payerMemberKey: 'user_self',
      note: '买菜',
      occurredAt: '2026-08-17T10:00:00.000Z',
      receiptMediaId: null,
    })
    expect(result.status).toBe('ADDED')
    expect(result.entry.id).toBe(entry.id)
  })

  it('passes through failure result', async () => {
    const { runtime } = makeRuntime({ status: 'LEDGER_AMOUNT_INVALID', retryable: false, errorMessage: '金额格式不正确' })
    setLedgerCloudRuntimeForTesting(runtime)
    const result = await addLedgerEntryInCloud({
      requestId: 'req_xxxxxxxxxxxxx_1',
      operationToken: 'op_xxxxxxxxxxxxx_1',
      type: 'expense',
      amountCents: 5000,
      categoryId: 'cat_xxxxxxxxxxxxx_1',
      payerMemberKey: 'user_self',
      note: '',
      occurredAt: '2026-08-17T10:00:00.000Z',
      receiptMediaId: null,
    })
    expect(result.status).toBe('LEDGER_AMOUNT_INVALID')
  })

  it('throws LedgerCloudError on invalid response', async () => {
    const { runtime } = makeRuntime({ status: 'ADDED', entry: { invalid: 'entry' } })
    setLedgerCloudRuntimeForTesting(runtime)
    await expect(addLedgerEntryInCloud({
      requestId: 'req_xxxxxxxxxxxxx_1',
      operationToken: 'op_xxxxxxxxxxxxx_1',
      type: 'expense',
      amountCents: 5000,
      categoryId: 'cat_xxxxxxxxxxxxx_1',
      payerMemberKey: 'user_self',
      note: '',
      occurredAt: '2026-08-17T10:00:00.000Z',
      receiptMediaId: null,
    })).rejects.toThrow(LedgerCloudError)
  })
})

describe('listLedgerEntriesInCloud', () => {
  it('returns LISTED with filtered entries', async () => {
    const entry = makeEntry()
    const { runtime } = makeRuntime({ status: 'LISTED', entries: [entry], deletedEntries: [] })
    setLedgerCloudRuntimeForTesting(runtime)
    const result = await listLedgerEntriesInCloud({ month: 'all', payerMode: 'all', categoryIds: [] })
    expect(result.status).toBe('LISTED')
    expect(result.entries).toHaveLength(1)
    expect(result.deletedEntries).toHaveLength(0)
  })
})

describe('deleteLedgerEntryInCloud', () => {
  it('returns DELETED on success', async () => {
    const { runtime } = makeRuntime({ status: 'DELETED', entryId: 'ledger_xxxxxxxxxxxxx_1', deletedAt: '2026-08-17T10:00:00.000Z' })
    setLedgerCloudRuntimeForTesting(runtime)
    const result = await deleteLedgerEntryInCloud({ entryId: 'ledger_xxxxxxxxxxxxx_1', operationToken: 'op_xxxxxxxxxxxxx_1' })
    expect(result.status).toBe('DELETED')
  })
})

describe('initLedgerCategoriesInCloud', () => {
  it('returns INITED with 8 categories', async () => {
    const cats = ['dining', 'transport', 'home', 'entertain', 'medical', 'clothing', 'education', 'other'].map((key) =>
      makeCategory({ id: `cat_xxxxxxxx_${key}`, key, name: key, iconKey: key === 'dining' ? 'fork-spoon' : (key === 'transport' ? 'car' : (key === 'home' ? 'house' : (key === 'entertain' ? 'gamepad' : (key === 'medical' ? 'first-aid' : (key === 'clothing' ? 'shopping-bag' : (key === 'education' ? 'book' : 'tag')))))), colorKey: 'amber' }),
    )
    const { runtime } = makeRuntime({ status: 'INITED', categories: cats })
    setLedgerCloudRuntimeForTesting(runtime)
    const result = await initLedgerCategoriesInCloud({ requestId: 'req_xxxxxxxxxxxxx_1' })
    expect(result.status).toBe('INITED')
    expect(result.categories).toHaveLength(8)
  })
})

describe('addLedgerCategoryInCloud', () => {
  it('returns ADDED with new category', async () => {
    const cat = makeCategory({ name: '宠物', iconKey: 'tag', colorKey: 'gray', isCustom: true })
    const { runtime } = makeRuntime({ status: 'ADDED', category: cat })
    setLedgerCloudRuntimeForTesting(runtime)
    const result = await addLedgerCategoryInCloud({ requestId: 'req_xxxxxxxxxxxxx_1', name: '宠物', iconKey: 'tag', colorKey: 'gray' })
    expect(result.status).toBe('ADDED')
    expect(result.category.name).toBe('宠物')
  })
})

describe('getLedgerStatsInCloud', () => {
  it('returns LOADED with stats', async () => {
    const stats = {
      month: '2026-08',
      monthExpenseCents: 8000,
      monthIncomeCents: 0,
      netCents: -8000,
      byCategory: [{ categoryId: 'cat_xxxxxxxxxxxxx_1', expenseCents: 8000, incomeCents: 0 }],
      byPayer: [{ payerMemberKey: 'user_self', expenseCents: 8000, incomeCents: 0 }],
    }
    const { runtime } = makeRuntime({ status: 'LOADED', stats })
    setLedgerCloudRuntimeForTesting(runtime)
    const result = await getLedgerStatsInCloud({ month: '2026-08' })
    expect(result.status).toBe('LOADED')
    expect(result.stats.monthExpenseCents).toBe(8000)
  })
})

describe('getLedgerEntryInCloud', () => {
  it('returns LOADED with detail', async () => {
    const detail = { ...makeEntry(), updatedAt: '2026-08-17T10:00:00.000Z', deletedAt: null }
    const { runtime } = makeRuntime({ status: 'LOADED', detail })
    setLedgerCloudRuntimeForTesting(runtime)
    const result = await getLedgerEntryInCloud({ entryId: 'ledger_xxxxxxxxxxxxx_1' })
    expect(result.status).toBe('LOADED')
    expect(result.detail.id).toBe('ledger_xxxxxxxxxxxxx_1')
  })

  // 回归测试：云端必须在 getEntry 响应里带 canEdit / canDelete（boolean）；
  // 字段类型错误时 service 层要拒绝（INVALID_RESPONSE），防止前端拿到脏数据。
  it('rejects when canEdit / canDelete are wrong type', async () => {
    const detail = { ...makeEntry(), updatedAt: '2026-08-17T10:00:00.000Z', deletedAt: null, canEdit: 'yes', canDelete: 'yes' }
    const { runtime } = makeRuntime({ status: 'LOADED', detail })
    setLedgerCloudRuntimeForTesting(runtime)
    await expect(getLedgerEntryInCloud({ entryId: 'ledger_xxxxxxxxxxxxx_1' })).rejects.toThrow(/getEntry 响应格式错误/)
  })
})

describe('restoreLedgerEntryInCloud / updateLedgerEntryInCloud / updateLedgerCategoryInCloud / removeLedgerCategoryInCloud', () => {
  it('restoreLedgerEntryInCloud returns RESTORED', async () => {
    const entry = makeEntry()
    const { runtime } = makeRuntime({ status: 'RESTORED', entry })
    setLedgerCloudRuntimeForTesting(runtime)
    const result = await restoreLedgerEntryInCloud({ entryId: 'ledger_xxxxxxxxxxxxx_1', operationToken: 'op_xxxxxxxxxxxxx_1' })
    expect(result.status).toBe('RESTORED')
  })

  it('updateLedgerEntryInCloud returns UPDATED', async () => {
    const entry = makeEntry({ amountCents: 8000 })
    const { runtime } = makeRuntime({ status: 'UPDATED', entry })
    setLedgerCloudRuntimeForTesting(runtime)
    const result = await updateLedgerEntryInCloud({
      entryId: 'ledger_xxxxxxxxxxxxx_1',
      operationToken: 'op_xxxxxxxxxxxxx_1',
      amountCents: 8000,
      categoryId: 'cat_xxxxxxxxxxxxx_1',
      note: '',
      occurredAt: '2026-08-17T10:00:00.000Z',
      receiptMediaId: null,
    })
    expect(result.status).toBe('UPDATED')
  })

  it('updateLedgerCategoryInCloud returns UPDATED with hiddenByMe', async () => {
    const cat = makeCategory()
    const { runtime } = makeRuntime({ status: 'UPDATED', category: cat, hiddenByMe: true })
    setLedgerCloudRuntimeForTesting(runtime)
    const result = await updateLedgerCategoryInCloud({ categoryId: 'cat_xxxxxxxxxxxxx_1', operationToken: 'op_xxxxxxxxxxxxx_1', setHiddenByMe: true })
    expect(result.status).toBe('UPDATED')
    expect(result.hiddenByMe).toBe(true)
  })

  it('removeLedgerCategoryInCloud returns REMOVED', async () => {
    const { runtime } = makeRuntime({ status: 'REMOVED', categoryId: 'cat_xxxxxxxxxxxxx_1' })
    setLedgerCloudRuntimeForTesting(runtime)
    const result = await removeLedgerCategoryInCloud({ categoryId: 'cat_xxxxxxxxxxxxx_1', operationToken: 'op_xxxxxxxxxxxxx_1' })
    expect(result.status).toBe('REMOVED')
  })
})

describe('timeout and platform errors', () => {
  it('throws LedgerCloudError on timeout', async () => {
    const { runtime } = makeRuntime({ status: 'ADDED', entry: makeEntry() }, 100)
    setLedgerCloudRuntimeForTesting(runtime)
    setLedgerCloudTimeoutForTesting(10)
    await expect(addLedgerEntryInCloud({
      requestId: 'req_xxxxxxxxxxxxx_1',
      operationToken: 'op_xxxxxxxxxxxxx_1',
      type: 'expense',
      amountCents: 5000,
      categoryId: 'cat_xxxxxxxxxxxxx_1',
      payerMemberKey: 'user_self',
      note: '',
      occurredAt: '2026-08-17T10:00:00.000Z',
      receiptMediaId: null,
    })).rejects.toThrow(LedgerCloudError)
  })
})
