import { createPinia, setActivePinia } from 'pinia'
import {
  resetHouseholdCloudClientForTesting,
  setHouseholdCloudClientForTesting,
  useHouseholdStore,
} from '../../src/store/modules/household'
import { HouseholdCloudError } from '../../src/services/household-cloud'
import { clearPendingHouseholds } from '../../src/utils/pending-household'

const draft = { name: '我们的小家', avatar: { kind: 'builtin' as const, id: 'household-01' as const } }
const home = {
  status: 'HOME' as const, retryable: false as const, created: true,
  household: { id: 'home_1', name: '我们的小家', avatar: draft.avatar, memberCount: 1, currentMemberRole: 'owner' as const },
  profile: { nickname: '小伙伴', avatar: { kind: 'builtin' as const, id: 'person-neutral' as const }, profilePreset: 'neutral' as const },
}

describe('household store', () => {
  beforeEach(() => {
    const values = new Map<string, unknown>()
    ;(globalThis as typeof globalThis & { uni: unknown }).uni = {
      getStorageSync: (key: string) => values.get(key),
      setStorageSync: (key: string, value: unknown) => values.set(key, value),
      removeStorageSync: (key: string) => values.delete(key),
    }
    setActivePinia(createPinia())
    clearPendingHouseholds()
  })

  afterEach(resetHouseholdCloudClientForTesting)

  it('shares one create call and loads the created home', async () => {
    let finish!: (value: typeof home) => void
    const create = jest.fn(() => new Promise<typeof home>((resolve) => { finish = resolve }))
    setHouseholdCloudClientForTesting({ create, confirm: jest.fn(), get: jest.fn() })
    const store = useHouseholdStore()
    store.applyNoHome(store.authoritativeRevision)
    const first = store.create(draft)
    const second = store.create(draft)
    finish(home)
    await Promise.all([first, second])
    expect(create).toHaveBeenCalledTimes(1)
    expect(store.phase).toBe('loaded')
    expect(store.household?.id).toBe('home_1')
  })

  it('keeps the draft after an explicit failure', async () => {
    setHouseholdCloudClientForTesting({
      create: jest.fn().mockResolvedValue({ status: 'INVALID_REQUEST', retryable: false }), confirm: jest.fn(), get: jest.fn(),
    })
    const store = useHouseholdStore()
    store.applyNoHome(store.authoritativeRevision)
    await store.create({ ...draft, name: '我的家' })
    expect(store.phase).toBe('failed')
    expect(store.draft.name).toBe('我的家')
    expect(store.canCreate).toBe(true)
  })

  it('keeps the same request after timeout and only allows confirmation', async () => {
    const create = jest.fn().mockRejectedValue(new HouseholdCloudError('TIMEOUT', 'timeout'))
    const confirm = jest.fn().mockResolvedValue(home)
    setHouseholdCloudClientForTesting({ create, confirm, get: jest.fn() })
    const store = useHouseholdStore()
    store.applyNoHome(store.authoritativeRevision)
    await store.create(draft)
    const requestId = store.pending?.requestId
    expect(store.phase).toBe('confirming')
    expect(store.canCreate).toBe(false)
    await store.confirmPending()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ requestId }))
    expect(store.phase).toBe('loaded')
  })

  it('restores the matching account operation and isolates another account operation', async () => {
    const first = useHouseholdStore()
    first.applyNoHome(first.authoritativeRevision)
    setHouseholdCloudClientForTesting({
      create: jest.fn().mockRejectedValue(new HouseholdCloudError('TIMEOUT', 'timeout')), confirm: jest.fn(), get: jest.fn(),
    })
    await first.create(draft)

    setActivePinia(createPinia())
    const confirm = jest.fn().mockResolvedValueOnce({ status: 'OPERATION_MISMATCH', retryable: false }).mockResolvedValueOnce(home)
    setHouseholdCloudClientForTesting({ create: jest.fn(), confirm, get: jest.fn() })
    const second = useHouseholdStore()
    await second.restorePending()
    expect(second.phase).toBe('editable')

    setActivePinia(createPinia())
    const third = useHouseholdStore()
    await third.restorePending()
    expect(third.phase).toBe('loaded')
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('does not let an older eligibility result overwrite creation success', async () => {
    const store = useHouseholdStore()
    const oldRevision = store.authoritativeRevision
    store.applyHome(home)
    expect(store.applyNoHome(oldRevision)).toBe(false)
    expect(store.phase).toBe('loaded')
  })

  it('loads the current household and clears stale content when retry fails', async () => {
    const get = jest.fn().mockResolvedValueOnce(home).mockRejectedValueOnce(new Error('offline'))
    setHouseholdCloudClientForTesting({ create: jest.fn(), confirm: jest.fn(), get })
    const store = useHouseholdStore()
    await store.loadCurrent()
    expect(store.phase).toBe('loaded')
    expect(store.household?.name).toBe('我们的小家')

    await store.loadCurrent()
    expect(store.phase).toBe('failed')
    expect(store.household).toBeUndefined()
    expect(store.profile).toBeUndefined()
  })

  it('returns to creation state when the trusted account has no household', async () => {
    setHouseholdCloudClientForTesting({
      create: jest.fn(), confirm: jest.fn(), get: jest.fn().mockResolvedValue({ status: 'NO_HOME', retryable: false }),
    })
    const store = useHouseholdStore()
    await store.loadCurrent()
    expect(store.phase).toBe('editable')
  })
})
