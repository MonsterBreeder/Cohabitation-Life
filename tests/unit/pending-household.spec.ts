import {
  addPendingHousehold,
  clearPendingHouseholds,
  listPendingHouseholds,
  removePendingHousehold,
  type PendingHousehold,
} from '../../src/utils/pending-household'

describe('pending household storage', () => {
  const values = new Map<string, unknown>()
  const first: PendingHousehold = {
    version: 1,
    requestId: 'request_12345678',
    operationToken: 'operation_12345678',
    draft: { name: '我们的小家', avatar: { kind: 'builtin', id: 'household-01' } },
    createdAt: 10,
  }

  beforeEach(() => {
    values.clear()
    ;(globalThis as typeof globalThis & { uni: unknown }).uni = {
      getStorageSync: (key: string) => values.get(key),
      setStorageSync: (key: string, value: unknown) => values.set(key, value),
      removeStorageSync: (key: string) => values.delete(key),
    }
  })

  it('keeps multiple account-bound operations without storing an identity', () => {
    addPendingHousehold(first)
    addPendingHousehold({ ...first, requestId: 'request_87654321', operationToken: 'operation_87654321' })

    expect(listPendingHouseholds()).toHaveLength(2)
    expect(JSON.stringify([...values.values()])).not.toContain('openid')
  })

  it('replaces the same request and removes only the confirmed operation', () => {
    addPendingHousehold(first)
    addPendingHousehold({ ...first, draft: { ...first.draft, name: '新名字' } })
    removePendingHousehold(first.operationToken)

    expect(listPendingHouseholds()).toEqual([])
  })

  it('ignores damaged or forged local data', () => {
    values.set('household.create.pending.v1', JSON.stringify([{ requestId: 'short', operationToken: 'bad' }]))
    expect(listPendingHouseholds()).toEqual([])
    clearPendingHouseholds()
  })

  it('keeps an approved custom avatar while a creation result is being confirmed', () => {
    const custom = {
      ...first,
      draft: {
        ...first.draft,
        avatar: { kind: 'custom' as const, resourceId: 'avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', digest: 'a'.repeat(64) },
      },
    }
    addPendingHousehold(custom)
    expect(listPendingHouseholds()).toEqual([custom])
  })
})
