import { createPinia, setActivePinia } from 'pinia'
import {
  setLedgerStoreCloudClientForTesting,
  useLedgerStore,
} from '../../src/store/modules/ledger'
import type { LedgerCategory, LedgerEntrySummary } from '../../src/types/ledger'

function makeEntry(overrides: any = {}): LedgerEntrySummary {
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
  } as LedgerEntrySummary
}

function makeCategory(overrides: any = {}): LedgerCategory {
  return {
    id: 'cat_xxxxxxxxxxxxx_1',
    key: 'dining',
    name: '餐饮',
    iconKey: 'fork-spoon',
    colorKey: 'amber',
    isCustom: false,
    sortOrder: 0,
    ...overrides,
  } as LedgerCategory
}

beforeEach(() => {
  setActivePinia(createPinia())
  setLedgerStoreCloudClientForTesting(undefined)
})

describe('useLedgerStore basic', () => {
  it('initialises with empty entries / categories', () => {
    const store = useLedgerStore()
    expect(store.entries).toEqual([])
    expect(store.deletedEntries).toEqual([])
    expect(store.categories).toEqual([])
  })

  it('setHouseholdContext sets householdId and selfMemberKey', () => {
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    expect(store.householdId).toBe('home_xxxxxxxx')
    expect(store.selfMemberKey).toBe('user_self')
  })

  it('setMonth / setPayerMode / setSelectedCategoryIds update filter', () => {
    const store = useLedgerStore()
    store.setMonth('2026-08')
    store.setPayerMode('me')
    store.setSelectedCategoryIds(['cat_xxxxxxxxxxxxx_1'])
    expect(store.currentMonth).toBe('2026-08')
    expect(store.payerMode).toBe('me')
    expect(store.selectedCategoryIds).toEqual(['cat_xxxxxxxxxxxxx_1'])
  })
})

describe('loadCategories', () => {
  it('populates categories from cloud', async () => {
    const cats = [makeCategory()]
    setLedgerStoreCloudClientForTesting({
      initCategories: jest.fn(async () => ({ status: 'INITED' as const, categories: cats })),
      addEntry: jest.fn(),
      updateEntry: jest.fn(),
      deleteEntry: jest.fn(),
      restoreEntry: jest.fn(),
      listEntries: jest.fn(),
      getEntry: jest.fn(),
      addCategory: jest.fn(),
      updateCategory: jest.fn(),
      removeCategory: jest.fn(),
      getStats: jest.fn(),
    })
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    await store.loadCategories()
    expect(store.categories).toHaveLength(1)
  })
})

describe('loadEntries', () => {
  it('populates entries from cloud', async () => {
    const entry = makeEntry()
    setLedgerStoreCloudClientForTesting({
      initCategories: jest.fn(),
      addEntry: jest.fn(),
      updateEntry: jest.fn(),
      deleteEntry: jest.fn(),
      restoreEntry: jest.fn(),
      listEntries: jest.fn(async () => ({ status: 'LISTED' as const, entries: [entry], deletedEntries: [] })),
      getEntry: jest.fn(),
      addCategory: jest.fn(),
      updateCategory: jest.fn(),
      removeCategory: jest.fn(),
      getStats: jest.fn(),
    })
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    store.setMonth('all')
    await store.loadEntries()
    expect(store.entries).toHaveLength(1)
  })
})

describe('addEntry / updateEntry / deleteEntry / restoreEntry', () => {
  it('addEntry prepends to entries on success', async () => {
    const entry = makeEntry()
    setLedgerStoreCloudClientForTesting({
      initCategories: jest.fn(),
      addEntry: jest.fn(async () => ({ status: 'ADDED' as const, entry })),
      updateEntry: jest.fn(),
      deleteEntry: jest.fn(),
      restoreEntry: jest.fn(),
      listEntries: jest.fn(),
      getEntry: jest.fn(),
      addCategory: jest.fn(),
      updateCategory: jest.fn(),
      removeCategory: jest.fn(),
      getStats: jest.fn(),
    })
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    const result = await store.addEntry({
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
    expect(result).not.toBeNull()
    expect(store.entries).toHaveLength(1)
  })

  it('updateEntry replaces in entries on success', async () => {
    const entry = makeEntry({ amountCents: 8000 })
    setLedgerStoreCloudClientForTesting({
      initCategories: jest.fn(),
      addEntry: jest.fn(),
      updateEntry: jest.fn(async () => ({ status: 'UPDATED' as const, entry })),
      deleteEntry: jest.fn(),
      restoreEntry: jest.fn(),
      listEntries: jest.fn(),
      getEntry: jest.fn(),
      addCategory: jest.fn(),
      updateCategory: jest.fn(),
      removeCategory: jest.fn(),
      getStats: jest.fn(),
    })
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    store.entries = [makeEntry()]
    const result = await store.updateEntry({
      entryId: 'ledger_xxxxxxxxxxxxx_1',
      operationToken: 'op_xxxxxxxxxxxxx_1',
      amountCents: 8000,
      categoryId: 'cat_xxxxxxxxxxxxx_1',
      note: '',
      occurredAt: '2026-08-17T10:00:00.000Z',
      receiptMediaId: null,
    })
    expect(result).not.toBeNull()
    expect(store.entries[0].amountCents).toBe(8000)
  })

  it('deleteEntry removes from entries on success', async () => {
    setLedgerStoreCloudClientForTesting({
      initCategories: jest.fn(),
      addEntry: jest.fn(),
      updateEntry: jest.fn(),
      deleteEntry: jest.fn(async () => ({ status: 'DELETED' as const, entryId: 'ledger_xxxxxxxxxxxxx_1', deletedAt: '2026-08-17T10:00:00.000Z' })),
      restoreEntry: jest.fn(),
      listEntries: jest.fn(),
      getEntry: jest.fn(),
      addCategory: jest.fn(),
      updateCategory: jest.fn(),
      removeCategory: jest.fn(),
      getStats: jest.fn(),
    })
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    store.entries = [makeEntry()]
    const ok = await store.deleteEntry({ entryId: 'ledger_xxxxxxxxxxxxx_1', operationToken: 'op_xxxxxxxxxxxxx_1' })
    expect(ok).toBe(true)
    expect(store.entries).toHaveLength(0)
  })

  it('restoreEntry moves from deleted to active', async () => {
    const entry = makeEntry()
    setLedgerStoreCloudClientForTesting({
      initCategories: jest.fn(),
      addEntry: jest.fn(),
      updateEntry: jest.fn(),
      deleteEntry: jest.fn(),
      restoreEntry: jest.fn(async () => ({ status: 'RESTORED' as const, entry })),
      listEntries: jest.fn(),
      getEntry: jest.fn(),
      addCategory: jest.fn(),
      updateCategory: jest.fn(),
      removeCategory: jest.fn(),
      getStats: jest.fn(),
    })
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    store.deletedEntries = [entry]
    const result = await store.restoreEntry({ entryId: 'ledger_xxxxxxxxxxxxx_1', operationToken: 'op_xxxxxxxxxxxxx_1' })
    expect(result).not.toBeNull()
    expect(store.entries).toHaveLength(1)
    expect(store.deletedEntries).toHaveLength(0)
  })
})

describe('addCategory / updateCategoryHidden / removeCategory', () => {
  it('addCategory appends to categories on success', async () => {
    const cat = makeCategory({ name: '宠物', isCustom: true })
    setLedgerStoreCloudClientForTesting({
      initCategories: jest.fn(),
      addEntry: jest.fn(),
      updateEntry: jest.fn(),
      deleteEntry: jest.fn(),
      restoreEntry: jest.fn(),
      listEntries: jest.fn(),
      getEntry: jest.fn(),
      addCategory: jest.fn(async () => ({ status: 'ADDED' as const, category: cat })),
      updateCategory: jest.fn(),
      removeCategory: jest.fn(),
      getStats: jest.fn(),
    })
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    const result = await store.addCategory({ requestId: 'req_xxxxxxxxxxxxx_1', name: '宠物', iconKey: 'tag', colorKey: 'gray' })
    expect(result).not.toBeNull()
    expect(store.categories).toHaveLength(1)
  })

  it('updateCategoryHidden tracks hiddenByMeCategoryIds', async () => {
    setLedgerStoreCloudClientForTesting({
      initCategories: jest.fn(),
      addEntry: jest.fn(),
      updateEntry: jest.fn(),
      deleteEntry: jest.fn(),
      restoreEntry: jest.fn(),
      listEntries: jest.fn(),
      getEntry: jest.fn(),
      addCategory: jest.fn(),
      updateCategory: jest.fn(async () => ({ status: 'UPDATED' as const, category: makeCategory(), hiddenByMe: true })),
      removeCategory: jest.fn(),
      getStats: jest.fn(),
    })
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    await store.updateCategoryHidden('cat_xxxxxxxxxxxxx_1', true)
    expect(store.hiddenByMeCategoryIds).toContain('cat_xxxxxxxxxxxxx_1')
  })

  it('removeCategory removes from categories on success', async () => {
    setLedgerStoreCloudClientForTesting({
      initCategories: jest.fn(),
      addEntry: jest.fn(),
      updateEntry: jest.fn(),
      deleteEntry: jest.fn(),
      restoreEntry: jest.fn(),
      listEntries: jest.fn(),
      getEntry: jest.fn(),
      addCategory: jest.fn(),
      updateCategory: jest.fn(),
      removeCategory: jest.fn(async () => ({ status: 'REMOVED' as const, categoryId: 'cat_xxxxxxxxxxxxx_1' })),
      getStats: jest.fn(),
    })
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    store.categories = [makeCategory()]
    const ok = await store.removeCategory('cat_xxxxxxxxxxxxx_1')
    expect(ok).toBe(true)
    expect(store.categories).toHaveLength(0)
  })

  // 回归测试：subpackage 详情页 / 编辑页都走 loadEntry；不能直接 await import('services/ledger-cloud')。
  it('loadEntry returns detail on success', async () => {
    const detail = { ...makeEntry(), updatedAt: '2026-08-17T10:00:00.000Z', deletedAt: null }
    setLedgerStoreCloudClientForTesting({
      initCategories: jest.fn(),
      addEntry: jest.fn(),
      updateEntry: jest.fn(),
      deleteEntry: jest.fn(),
      restoreEntry: jest.fn(),
      listEntries: jest.fn(),
      getEntry: jest.fn(async () => ({ status: 'LOADED' as const, detail })),
      addCategory: jest.fn(),
      updateCategory: jest.fn(),
      removeCategory: jest.fn(),
      getStats: jest.fn(),
    })
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    const result = await store.loadEntry('ledger_xxxxxxxxxxxxx_1')
    expect(result).not.toBeNull()
    expect(result!.id).toBe('ledger_xxxxxxxxxxxxx_1')
    expect((result as any).updatedAt).toBe('2026-08-17T10:00:00.000Z')
  })

  it('loadEntry returns null and sets errorMessage on failure', async () => {
    setLedgerStoreCloudClientForTesting({
      initCategories: jest.fn(),
      addEntry: jest.fn(),
      updateEntry: jest.fn(),
      deleteEntry: jest.fn(),
      restoreEntry: jest.fn(),
      listEntries: jest.fn(),
      getEntry: jest.fn(async () => ({ status: 'LEDGER_NOT_FOUND' as const, retryable: false, errorMessage: '账目不存在' })),
      addCategory: jest.fn(),
      updateCategory: jest.fn(),
      removeCategory: jest.fn(),
      getStats: jest.fn(),
    })
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    const result = await store.loadEntry('ledger_xxxxxxxxxxxxx_missing')
    expect(result).toBeNull()
    expect(store.errorMessage).toBe('账目不存在')
  })

  // 回归测试：类目管理重命名走 store action；不能直接 await import('services/ledger-cloud')。
  it('renameCategory updates local cache on success', async () => {
    const renamed = makeCategory({ name: '宠物粮' })
    setLedgerStoreCloudClientForTesting({
      initCategories: jest.fn(),
      addEntry: jest.fn(),
      updateEntry: jest.fn(),
      deleteEntry: jest.fn(),
      restoreEntry: jest.fn(),
      listEntries: jest.fn(),
      getEntry: jest.fn(),
      addCategory: jest.fn(),
      updateCategory: jest.fn(async () => ({ status: 'UPDATED' as const, category: renamed, hiddenByMe: false })),
      removeCategory: jest.fn(),
      getStats: jest.fn(),
    })
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    store.categories = [makeCategory()]
    const result = await store.renameCategory('cat_xxxxxxxxxxxxx_1', '宠物粮')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('宠物粮')
    // 本地缓存同步刷新
    expect(store.categories[0].name).toBe('宠物粮')
  })

  it('renameCategory returns null and sets errorMessage on failure', async () => {
    setLedgerStoreCloudClientForTesting({
      initCategories: jest.fn(),
      addEntry: jest.fn(),
      updateEntry: jest.fn(),
      deleteEntry: jest.fn(),
      restoreEntry: jest.fn(),
      listEntries: jest.fn(),
      getEntry: jest.fn(),
      addCategory: jest.fn(),
      updateCategory: jest.fn(async () => ({ status: 'LEDGER_CATEGORY_NAME_TAKEN' as const, retryable: false, errorMessage: '类目名已被使用' })),
      removeCategory: jest.fn(),
      getStats: jest.fn(),
    })
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', 'user_self')
    const result = await store.renameCategory('cat_xxxxxxxxxxxxx_1', '餐饮')
    expect(result).toBeNull()
    expect(store.errorMessage).toBe('类目名已被使用')
  })
})

describe('getters', () => {
  it('categoriesMap builds id → category lookup', () => {
    const store = useLedgerStore()
    store.categories = [makeCategory({ id: 'cat_a' }), makeCategory({ id: 'cat_b' })]
    expect(store.categoriesMap.cat_a).toBeDefined()
    expect(store.categoriesMap.cat_b).toBeDefined()
  })

  it('visibleCategories excludes hiddenByMe', () => {
    const store = useLedgerStore()
    store.categories = [makeCategory({ id: 'cat_a' }), makeCategory({ id: 'cat_b' })]
    store.hiddenByMeCategoryIds = ['cat_a']
    expect(store.visibleCategories.map((c) => c.id)).toEqual(['cat_b'])
  })

  it('monthEntries filters by selectedCategoryIds (payerMode 由云端处理)', () => {
    const store = useLedgerStore()
    store.setHouseholdContext('home_xxxxxxxx', '')
    store.entries = [
      makeEntry({ id: 'e1', payer: { memberKey: 'user_self', nickname: '我', avatar: { kind: 'builtin', id: 'person-neutral' } } as any }),
      makeEntry({ id: 'e2', categoryId: 'cat_xxxxxxxxxxxxx_2', payer: { memberKey: 'user_other', nickname: 'TA', avatar: { kind: 'builtin', id: 'person-neutral' } } as any }),
    ]
    store.payerMode = 'me'  // 在前端不再过滤（云端处理）
    expect(store.monthEntries.map((e) => e.id).sort()).toEqual(['e1', 'e2'])
    store.payerMode = 'all'
    store.selectedCategoryIds = ['cat_xxxxxxxxxxxxx_2']
    expect(store.monthEntries.map((e) => e.id)).toEqual(['e2'])
  })
})
