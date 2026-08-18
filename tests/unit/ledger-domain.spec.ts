declare function require(path: string): any

const {
  initCategories,
  addEntry,
  updateEntry,
  deleteEntry,
  restoreEntry,
  listEntries,
  getEntry,
  addCategory,
  updateCategory,
  removeCategory,
  getStats,
  LedgerDomainError,
} = require('../../cloudfunctions/ledger/ledger-domain')

// In-memory repository stub. 模式与 task-domain.spec 一致。

type RecordMap = Map<string, any>

function createRepository(initial: { entries?: any[]; categories?: any[]; operations?: any[]; households?: any[]; users?: any[] } = {}) {
  const entries: RecordMap = new Map((initial.entries || []).map((e) => [e._id, structuredClone(e)]))
  const categories: RecordMap = new Map((initial.categories || []).map((c) => [c._id, structuredClone(c)]))
  const operations: RecordMap = new Map((initial.operations || []).map((o) => [o._id, structuredClone(o)]))
  const households: RecordMap = new Map((initial.households || []).map((h) => [h._id, structuredClone(h)]))
  const users: RecordMap = new Map((initial.users || []).map((u) => [u._id, structuredClone(u)]))

  const repository = {
    getHousehold: jest.fn(async (id: string) => households.get(id) || null),
    isMemberOfHousehold: jest.fn(async (identityKey: string, householdId?: string) => {
      // 接受 (identityKey, householdId) 两参数；测试桩要兼容 domain 的真实签名
      const hId = householdId || HOUSEHOLD_ID
      const home = households.get(hId)
      return Boolean(home && Array.isArray(home.memberKeys) && home.memberKeys.includes(identityKey))
    }),
    getEntry: jest.fn(async (id: string) => entries.get(id) || null),
    getOperation: jest.fn(async (id: string) => operations.get(id) || null),
    findCategoriesByHousehold: jest.fn(async (householdId: string) =>
      [...categories.values()].filter((c) => c.householdId === householdId),
    ),
    findCategoryById: jest.fn(async (id: string) => categories.get(id) || null),
    findEntriesByHousehold: jest.fn(async (householdId: string, filter: any) => {
      let list = [...entries.values()].filter((e) => e.householdId === householdId)
      if (filter && filter.month && filter.month !== 'all') {
        const [y, m] = filter.month.split('-').map((v) => Number.parseInt(v, 10))
        const start = Date.UTC(y, m - 1, 1)
        const end = Date.UTC(y, m, 1)
        list = list.filter((e) => {
          const t = new Date(e.occurredAt).getTime()
          return t >= start && t < end
        })
      }
      if (filter && filter.categoryIds && filter.categoryIds.length > 0) {
        list = list.filter((e) => filter.categoryIds.includes(e.categoryId))
      }
      if (filter && filter.payerMode === 'me' && filter.selfMemberKey) {
        list = list.filter((e) => e.payerMemberKey === filter.selfMemberKey)
      }
      return list
    }),
    countEntriesByCategory: jest.fn(async (categoryId: string, householdId: string) =>
      [...entries.values()].filter((e) => e.categoryId === categoryId && e.householdId === householdId && !e.deletedAt).length,
    ),
    getProfileForMember: jest.fn(async (memberKey: string) => {
      if (memberKey && memberKey.startsWith('user_')) return users.get(memberKey) || null
      return null
    }),
    addCategory: jest.fn(async (data: any) => {
      const id = data._id || `cat_${Math.random().toString(36).slice(2, 14)}`
      categories.set(id, { ...data, _id: id })
      return id
    }),
    updateCategory: jest.fn(async (id: string, data: any) => {
      const current = categories.get(id)
      if (!current) throw new Error('category not found')
      categories.set(id, { ...current, ...data })
    }),
    removeCategory: jest.fn(async (id: string) => categories.delete(id)),
    runTransaction: jest.fn(async (work: (tx: any) => Promise<any>) => {
      const entryDraft = new Map(entries)
      const opDraft = new Map(operations)
      const catDraft = new Map(categories)
      const transaction = {
        addEntry: async (data: any) => {
          const id = data._id
          entryDraft.set(id, { ...data, _id: id })
        },
        updateEntry: async (id: string, data: any) => {
          const current = entryDraft.get(id)
          if (!current) throw new Error('entry not found')
          entryDraft.set(id, { ...current, ...data })
        },
        addCategory: async (data: any) => {
          const id = data._id
          catDraft.set(id, { ...data, _id: id })
        },
        // addOperation 在云端用 doc(id).set({data: withoutDocumentId(record)})，stub 等价物：
        // 接受完整 record（可能已 withoutDocumentId），但 stub 端需要 _id 做 key
        // 这里 data 可能是 { _id, kind, ...} 或 { kind, ...}（_id 已被剥）
        // 用 sortOrder 之外的字段推断 id 太脆弱，改为让 domain 端保留 _id 调用
        addOperation: async (data: any) => {
          // 兜底：如果 data 没有 _id 字段，我们从外层 operations 找最近一条同 kind 匹配
          // 实际上更稳的方案是 domain 不剥 _id；这里给一个 lookup 兜底
          if (data && data._id) {
            opDraft.set(data._id, { ...data })
            return
          }
          // data 没有 _id 时的兜底：通过 data 的 kind + entryId 找现有 op
          // （仅用于幂等去重 — 如果已经存在就不重复 add）
          for (const [existingId, existing] of opDraft.entries()) {
            if (existing.kind === data.kind && existing.entryId === data.entryId) {
              return // 幂等：已存在
            }
            if (existing.kind === data.kind && existing.categoryId === data.categoryId) {
              return
            }
          }
          // 实在没有就生成一个占位 id（仅 stub 行为，不影响真云端）
          const stubId = `op_stub_${Math.random().toString(36).slice(2, 14)}`
          opDraft.set(stubId, { ...data, _id: stubId })
        },
      }
      const result = await work(transaction)
      entries.clear(); entryDraft.forEach((v, k) => entries.set(k, v))
      operations.clear(); opDraft.forEach((v, k) => operations.set(k, v))
      categories.clear(); catDraft.forEach((v, k) => categories.set(k, v))
      return result
    }),
  }
  return repository
}

const HOUSEHOLD_ID = 'home_xxxxxxxxxxxx'
const SELF = 'user_self'
const OTHER = 'user_other'
const NOW = new Date('2026-08-17T10:00:00.000Z')

function makeDependencies(overrides: any = {}) {
  const repo = overrides.repository || createRepository({
    households: [{ _id: HOUSEHOLD_ID, name: '我们的小家', memberKeys: [SELF, OTHER] }],
  })
  return {
    identityKey: SELF,
    selfMemberKey: SELF,
    householdId: HOUSEHOLD_ID,
    repository: repo,
    now: () => NOW,
  }
}

describe('initCategories', () => {
  it('writes 8 preset categories on first call', async () => {
    const deps = makeDependencies()
    const result = await initCategories({ requestId: 'req_xxxxxxxxxxx_xxxxxxxxxxxxxxx1' }, deps)
    expect(result.status).toBe('INITED')
    expect(result.categories).toHaveLength(8)
    expect(result.categories[0].key).toBe('dining')
    expect(result.categories[7].key).toBe('other')
  })

  it('is idempotent on second call', async () => {
    const deps = makeDependencies()
    await initCategories({ requestId: 'req_xxxxxxxxxxx_xxxxxxxxxxxxxxx1' }, deps)
    const result = await initCategories({ requestId: 'req_xxxxxxxxxxx_xxxxxxxxxxxxxxx2' }, deps)
    expect(result.status).toBe('INITED')
    expect(result.categories).toHaveLength(8)
  })
})

describe('addEntry', () => {
  it('creates entry with valid input', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF, OTHER] }],
      categories: [{ _id: 'cat_xxxxxxxxxxxxx_dining', householdId: HOUSEHOLD_ID, key: 'dining', name: '餐饮', iconKey: 'fork-spoon', colorKey: 'amber', isCustom: false, sortOrder: 0 }],
    })
    const deps = makeDependencies({ repository: repo })
    const result = await addEntry({
      requestId: 'req_xxxxxxxxxxx_add_1',
      operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxxadd_1',
      type: 'expense',
      amountCents: 5000,
      categoryId: 'cat_xxxxxxxxxxxxx_dining',
      payerMemberKey: SELF,
      note: '买菜',
      occurredAt: NOW.toISOString(),
      receiptMediaId: null,
    }, deps)
    expect(result.status).toBe('ADDED')
    expect(result.entry.amountCents).toBe(5000)
    expect(result.entry.note).toBe('买菜')
  })

  // 回归测试：addEntry 是"创建类"action，幂等锁只用 requestId（creationLockId），
  // 不需要 operationToken。前端 AddLedgerEntryRequest 也没有这个字段。
  it('succeeds without operationToken (creation-lock uses requestId)', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF, OTHER] }],
      categories: [{ _id: 'cat_xxxxxxxxxxxxx_dining', householdId: HOUSEHOLD_ID, key: 'dining', name: '餐饮', iconKey: 'fork-spoon', colorKey: 'amber', isCustom: false, sortOrder: 0 }],
    })
    const deps = makeDependencies({ repository: repo })
    const result = await addEntry({
      requestId: 'req_xxxxxxxxxxx_add_no_op',
      type: 'expense',
      amountCents: 3500,
      categoryId: 'cat_xxxxxxxxxxxxx_dining',
      payerMemberKey: SELF,
      note: '没传 operationToken 也要成功',
      occurredAt: NOW.toISOString(),
      receiptMediaId: null,
    }, deps)
    expect(result.status).toBe('ADDED')
    expect(result.entry.amountCents).toBe(3500)
  })

  it('rejects when not household member', async () => {
    const repo = createRepository({ households: [{ _id: HOUSEHOLD_ID, memberKeys: [OTHER] }] })
    const deps = makeDependencies({ repository: repo })
    await expect(addEntry({
      requestId: 'req_xxxxxxxxxxx_xxxxxxxxxxxxxxx1', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxx1', type: 'expense', amountCents: 100, categoryId: 'cat_xxxxxxxxxxxxx_xxxxxxxxxxxxx_1', payerMemberKey: SELF, note: '', occurredAt: NOW.toISOString(), receiptMediaId: null,
    }, deps)).rejects.toThrow(LedgerDomainError)
  })

  it('rejects when category not in household', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      categories: [{ _id: 'cat_xxxxxxxxxxxxx_other', householdId: 'home_other', key: 'dining', name: '餐饮', iconKey: 'fork-spoon', colorKey: 'amber' }],
    })
    const deps = makeDependencies({ repository: repo })
    await expect(addEntry({
      requestId: 'req_xxxxxxxxxxx_xxxxxxxxxxxxxxx1', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxx1', type: 'expense', amountCents: 100, categoryId: 'cat_xxxxxxxxxxxxx_other', payerMemberKey: SELF, note: '', occurredAt: NOW.toISOString(), receiptMediaId: null,
    }, deps)).rejects.toThrow(/LEDGER_CATEGORY_NOT_FOUND/)
  })

  it('rejects when payer not a member', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      categories: [{ _id: 'cat_xxxxxxxxxxxxx_xxxxxxxxxxxxx_1', householdId: HOUSEHOLD_ID, key: 'dining', name: '餐饮', iconKey: 'fork-spoon', colorKey: 'amber' }],
    })
    const deps = makeDependencies({ repository: repo })
    await expect(addEntry({
      requestId: 'req_xxxxxxxxxxx_xxxxxxxxxxxxxxx1', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxx1', type: 'expense', amountCents: 100, categoryId: 'cat_xxxxxxxxxxxxx_xxxxxxxxxxxxx_1', payerMemberKey: 'user_stranger', note: '', occurredAt: NOW.toISOString(), receiptMediaId: null,
    }, deps)).rejects.toThrow(/LEDGER_PAYER_NOT_MEMBER/)
  })

  it('rejects invalid amount (zero / negative / non-integer)', async () => {
    const deps = makeDependencies()
    await expect(addEntry({ requestId: 'r_xxxxxxxxxxxxxx', operationToken: 'o_xxxxxxxxxxxxxx', type: 'expense', amountCents: 0, categoryId: 'c_xxxxxxxxxxxxxx', payerMemberKey: SELF, note: '', occurredAt: NOW.toISOString(), receiptMediaId: null }, deps)).rejects.toThrow(/LEDGER_AMOUNT_INVALID/)
    await expect(addEntry({ requestId: 'r_xxxxxxxxxxxxxx', operationToken: 'o_xxxxxxxxxxxxxx', type: 'expense', amountCents: -1, categoryId: 'c_xxxxxxxxxxxxxx', payerMemberKey: SELF, note: '', occurredAt: NOW.toISOString(), receiptMediaId: null }, deps)).rejects.toThrow(/LEDGER_AMOUNT_INVALID/)
    await expect(addEntry({ requestId: 'r_xxxxxxxxxxxxxx', operationToken: 'o_xxxxxxxxxxxxxx', type: 'expense', amountCents: 1.5, categoryId: 'c_xxxxxxxxxxxxxx', payerMemberKey: SELF, note: '', occurredAt: NOW.toISOString(), receiptMediaId: null }, deps)).rejects.toThrow(/LEDGER_AMOUNT_INVALID/)
  })
})

describe('updateEntry / deleteEntry / restoreEntry', () => {
  const baseEntry = {
    _id: 'entry_xxxxxxxxxxxx_1',
    householdId: HOUSEHOLD_ID,
    type: 'expense',
    amountCents: 5000,
    categoryId: 'cat_xxxxxxxxxxxxx_dining',
    payerMemberKey: SELF,
    note: '买菜',
    occurredAt: NOW.toISOString(),
    receiptMediaId: null,
    payer: { memberKey: SELF, nickname: '我', avatar: { kind: 'builtin', id: 'person-neutral' } },
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    deletedAt: null,
  }
  const baseCategory = { _id: 'cat_xxxxxxxxxxxxx_dining', householdId: HOUSEHOLD_ID, key: 'dining', name: '餐饮', iconKey: 'fork-spoon', colorKey: 'amber' }

  it('updateEntry succeeds for own entry', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      categories: [baseCategory],
      entries: [baseEntry],
    })
    const deps = makeDependencies({ repository: repo })
    const result = await updateEntry({
      entryId: 'entry_xxxxxxxxxxxx_1', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxxup_1', amountCents: 8000, categoryId: 'cat_xxxxxxxxxxxxx_dining', note: '买菜改', occurredAt: NOW.toISOString(), receiptMediaId: null,
    }, deps)
    expect(result.status).toBe('UPDATED')
    expect(result.entry.amountCents).toBe(8000)
  })

  it('updateEntry rejects entry not in household', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      categories: [baseCategory],
      entries: [{ ...baseEntry, householdId: 'home_other' }],
    })
    const deps = makeDependencies({ repository: repo })
    await expect(updateEntry({ entryId: 'entry_xxxxxxxxxxxx_1', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxxup_1', amountCents: 8000, categoryId: 'cat_xxxxxxxxxxxxx_dining', note: '', occurredAt: NOW.toISOString(), receiptMediaId: null }, deps)).rejects.toThrow(/LEDGER_NOT_FOUND/)
  })

  it('deleteEntry is idempotent on repeated operationToken', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      entries: [baseEntry],
    })
    const deps = makeDependencies({ repository: repo })
    const r1 = await deleteEntry({ entryId: 'entry_xxxxxxxxxxxx_1', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxxd_1' }, deps)
    expect(r1.status).toBe('DELETED')
    const r2 = await deleteEntry({ entryId: 'entry_xxxxxxxxxxxx_1', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxxd_1' }, deps)
    expect(r2.status).toBe('DELETED')
  })

  // 回归测试：PRD 008 软删只创建者可做；非创建者即使是家庭成员也被 LEDGER_FORBIDDEN 拒绝。
  it('deleteEntry rejects non-creator household member (PRD 008)', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF, OTHER] }],
      entries: [baseEntry],  // baseEntry 的 payerMemberKey 是 SELF
    })
    const deps = { ...makeDependencies({ repository: repo }), identityKey: OTHER }
    await expect(deleteEntry({ entryId: 'entry_xxxxxxxxxxxx_1', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxxd_other' }, deps))
      .rejects.toThrow(/LEDGER_FORBIDDEN/)
  })

  // 撤销删除（restoreEntry）任何成员都可做——这条不变。
  it('restoreEntry allows non-creator household member', async () => {
    const deleted = { ...baseEntry, deletedAt: '2026-08-15T10:00:00.000Z' }
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF, OTHER] }],
      entries: [deleted],
    })
    const deps = { ...makeDependencies({ repository: repo }), identityKey: OTHER }
    const result = await restoreEntry({ entryId: 'entry_xxxxxxxxxxxx_1', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxxr_other' }, deps)
    expect(result.status).toBe('RESTORED')
  })

  it('restoreEntry succeeds for soft-deleted entry', async () => {
    const deleted = { ...baseEntry, deletedAt: '2026-08-15T10:00:00.000Z' }
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      entries: [deleted],
    })
    const deps = makeDependencies({ repository: repo })
    const result = await restoreEntry({ entryId: 'entry_xxxxxxxxxxxx_1', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxxr_1' }, deps)
    expect(result.status).toBe('RESTORED')
  })
})

describe('listEntries / getEntry', () => {
  const entryActive = {
    _id: 'entry_xxxxxxxxxxxxx_active',
    householdId: HOUSEHOLD_ID, type: 'expense', amountCents: 5000, categoryId: 'cat_xxxxxxxxxxxxx_dining',
    payerMemberKey: SELF, note: '', occurredAt: NOW.toISOString(), receiptMediaId: null,
    payer: { memberKey: SELF, nickname: '我', avatar: { kind: 'builtin', id: 'person-neutral' } },
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null,
  }
  const entryDeleted = { ...entryActive, _id: 'entry_xxxxxxxxxxxxx_deleted', deletedAt: '2026-08-10T10:00:00.000Z' }

  it('listEntries excludes soft-deleted by default', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      entries: [entryActive, entryDeleted],
    })
    const deps = makeDependencies({ repository: repo })
    const result = await listEntries({ month: 'all', payerMode: 'all', categoryIds: [] }, deps)
    expect(result.entries.map((e: any) => e.id)).toEqual(['entry_xxxxxxxxxxxxx_active'])
    expect(result.deletedEntries).toEqual([])
  })

  it('listEntries returns deletedEntries when includeDeleted=true', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      entries: [entryActive, entryDeleted],
    })
    const deps = makeDependencies({ repository: repo })
    const result = await listEntries({ month: 'all', payerMode: 'all', categoryIds: [], includeDeleted: true }, deps)
    expect(result.entries).toHaveLength(1)
    expect(result.deletedEntries).toHaveLength(1)
  })

  it('getEntry returns LEDGER_NOT_FOUND for soft-deleted', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      entries: [entryDeleted],
    })
    const deps = makeDependencies({ repository: repo })
    await expect(getEntry({ entryId: 'entry_deleted' }, deps)).rejects.toThrow(/LEDGER_NOT_FOUND/)
  })

  // 回归测试：getEntry 必须在响应里告诉前端"我能不能编辑 / 删除"。
  // 否则前端用 selfMemberKey 比对永远拿不到按钮（selfMemberKey 在前端没值）。
  it('getEntry sets canEdit/canDelete=true for the creator', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF, OTHER] }],
      entries: [{
        _id: 'entry_xxxxxxxxxxxx_active',
        householdId: HOUSEHOLD_ID,
        type: 'expense', amountCents: 1000, categoryId: 'cat_xxxxxxxxxxxxx_dining',
        payerMemberKey: SELF, note: '', occurredAt: NOW.toISOString(), receiptMediaId: null,
        payer: { memberKey: SELF, nickname: '我', avatar: { kind: 'builtin', id: 'person-neutral' } },
        createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null,
      }],
    })
    const deps = makeDependencies({ repository: repo })
    const result = await getEntry({ entryId: 'entry_xxxxxxxxxxxx_active' }, deps)
    expect(result.status).toBe('LOADED')
    expect(result.detail.canEdit).toBe(true)
    expect(result.detail.canDelete).toBe(true)
  })

  it('getEntry sets canEdit/canDelete=false for non-creator household member', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF, OTHER] }],
      entries: [{
        _id: 'entry_xxxxxxxxxxxx_active',
        householdId: HOUSEHOLD_ID,
        type: 'expense', amountCents: 1000, categoryId: 'cat_xxxxxxxxxxxxx_dining',
        payerMemberKey: SELF, note: '', occurredAt: NOW.toISOString(), receiptMediaId: null,
        payer: { memberKey: SELF, nickname: '我', avatar: { kind: 'builtin', id: 'person-neutral' } },
        createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null,
      }],
    })
    // 切换到 OTHER 视角调用
    const deps = { ...makeDependencies({ repository: repo }), identityKey: OTHER }
    const result = await getEntry({ entryId: 'entry_xxxxxxxxxxxx_active' }, deps)
    expect(result.status).toBe('LOADED')
    expect(result.detail.canEdit).toBe(false)
    expect(result.detail.canDelete).toBe(false)
  })
})

describe('addCategory / updateCategory / removeCategory', () => {
  const baseCategory = { _id: 'cat_xxxxxxxxxxxxx_preset', householdId: HOUSEHOLD_ID, key: 'dining', name: '餐饮', iconKey: 'fork-spoon', colorKey: 'amber', isCustom: false, sortOrder: 0, isHiddenBy: [] }

  it('addCategory rejects name duplicate', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      categories: [baseCategory],
    })
    const deps = makeDependencies({ repository: repo })
    await expect(addCategory({ requestId: 'r_xxxxxxxxxxxxxx', name: '餐饮', iconKey: 'fork-spoon', colorKey: 'amber' }, deps)).rejects.toThrow(/LEDGER_CATEGORY_NAME_TAKEN/)
  })

  // 回归测试：addCategory 是"创建类"action，幂等锁只用 requestId（creationLockId），
  // 不需要 operationToken。前端 AddLedgerCategoryRequest 也没有这个字段。
  it('addCategory succeeds without operationToken (creation-lock uses requestId)', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      categories: [baseCategory],
    })
    const deps = makeDependencies({ repository: repo })
    const result = await addCategory({
      requestId: 'r_xxxxxxxxxxxxxx_no_op',
      name: '宠物',
      iconKey: 'tag',
      colorKey: 'gray',
    }, deps)
    expect(result.status).toBe('ADDED')
    expect(result.category.name).toBe('宠物')
  })

  it('updateCategory can hide preset', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      categories: [baseCategory],
    })
    const deps = makeDependencies({ repository: repo })
    const result = await updateCategory({ categoryId: 'cat_xxxxxxxxxxxxx_preset', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxxh_1', setHiddenByMe: true }, deps)
    expect(result.status).toBe('UPDATED')
    expect(result.hiddenByMe).toBe(true)
  })

  it('updateCategory cannot rename preset', async () => {
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      categories: [baseCategory],
    })
    const deps = makeDependencies({ repository: repo })
    await expect(updateCategory({ categoryId: 'cat_xxxxxxxxxxxxx_preset', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxxn_1', name: '饮' }, deps)).rejects.toThrow(/LEDGER_INVALID_REQUEST/)
  })

  it('removeCategory rejects when in use', async () => {
    const custom = { _id: 'cat_xxxxxxxxxxxxx_custom', householdId: HOUSEHOLD_ID, key: 'custom_x', name: '宠物', iconKey: 'tag', colorKey: 'gray', isCustom: true, sortOrder: 100, isHiddenBy: [] }
    const entry = {
      _id: 'entry_xxxxxxxxxxxx_1', householdId: HOUSEHOLD_ID, type: 'expense', amountCents: 1000, categoryId: 'cat_xxxxxxxxxxxxx_custom',
      payerMemberKey: SELF, note: '', occurredAt: NOW.toISOString(), receiptMediaId: null,
      payer: { memberKey: SELF, nickname: '我', avatar: { kind: 'builtin', id: 'person-neutral' } },
      createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null,
    }
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      categories: [custom],
      entries: [entry],
    })
    const deps = makeDependencies({ repository: repo })
    await expect(removeCategory({ categoryId: 'cat_xxxxxxxxxxxxx_custom', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxxrm_1' }, deps)).rejects.toThrow(/LEDGER_CATEGORY_IN_USE/)
  })

  it('removeCategory succeeds for unused custom', async () => {
    const custom = { _id: 'cat_xxxxxxxxxxxxx_custom', householdId: HOUSEHOLD_ID, key: 'custom_x', name: '宠物', iconKey: 'tag', colorKey: 'gray', isCustom: true, sortOrder: 100, isHiddenBy: [] }
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF] }],
      categories: [custom],
    })
    const deps = makeDependencies({ repository: repo })
    const result = await removeCategory({ categoryId: 'cat_xxxxxxxxxxxxx_custom', operationToken: 'op_xxxxxxxxxxx_xxxxxxxxxxxxxxxrm_2' }, deps)
    expect(result.status).toBe('REMOVED')
  })
})

describe('getStats', () => {
  const catDining = { _id: 'cat_xxxxxxxxxxxxx_dining', householdId: HOUSEHOLD_ID, key: 'dining', name: '餐饮', iconKey: 'fork-spoon', colorKey: 'amber' }
  const catTransport = { _id: 'cat_xxxxxxxxxxxxx_transport', householdId: HOUSEHOLD_ID, key: 'transport', name: '交通', iconKey: 'car', colorKey: 'blue' }

  it('aggregates expense / income / by category / by payer', async () => {
    const entries = [
      { _id: 'entry_xxxxxxxxxxx_1', householdId: HOUSEHOLD_ID, type: 'expense', amountCents: 5000, categoryId: 'cat_xxxxxxxxxxxxx_dining', payerMemberKey: SELF, note: '', occurredAt: NOW.toISOString(), receiptMediaId: null, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null, payer: { memberKey: SELF } },
      { _id: 'entry_xxxxxxxxxxx_2', householdId: HOUSEHOLD_ID, type: 'expense', amountCents: 3000, categoryId: 'cat_xxxxxxxxxxxxx_transport', payerMemberKey: OTHER, note: '', occurredAt: NOW.toISOString(), receiptMediaId: null, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null, payer: { memberKey: OTHER } },
      { _id: 'entry_xxxxxxxxxxx_3', householdId: HOUSEHOLD_ID, type: 'income', amountCents: 10000, categoryId: 'cat_xxxxxxxxxxxxx_dining', payerMemberKey: SELF, note: '', occurredAt: NOW.toISOString(), receiptMediaId: null, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), deletedAt: null, payer: { memberKey: SELF } },
    ]
    const repo = createRepository({
      households: [{ _id: HOUSEHOLD_ID, memberKeys: [SELF, OTHER] }],
      categories: [catDining, catTransport],
      entries,
    })
    const deps = makeDependencies({ repository: repo })
    const result = await getStats({ month: 'all' }, deps)
    expect(result.status).toBe('LOADED')
    expect(result.stats.monthExpenseCents).toBe(8000)
    expect(result.stats.monthIncomeCents).toBe(10000)
    expect(result.stats.netCents).toBe(2000)
    expect(result.stats.byCategory).toHaveLength(2)
    expect(result.stats.byPayer).toHaveLength(2)
  })
})
