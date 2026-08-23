declare function require(path: string): any

const { createHousehold, confirmHousehold, getCurrentHousehold, updateHousehold, updateProfile, DEFAULT_HOUSEHOLD_NAME, DEFAULT_PROFILE_NAME } = require('../../cloudfunctions/household/household-domain')
const { withoutDocumentId } = require('../../cloudfunctions/household/repository-data')

type RecordMap = Map<string, any>

function createRepository(initialHouseholds: any[] = []) {
  const households: RecordMap = new Map(initialHouseholds.map((item) => [item._id, structuredClone(item)]))
  const locks: RecordMap = new Map()
  const operations: RecordMap = new Map()
  const users: RecordMap = new Map()
  let queue = Promise.resolve()

  const repository = {
    findHouseholdsByMemberKey: jest.fn(async (identityKey: string) =>
      [...households.values()].filter((item) => item.memberKeys?.includes(identityKey)),
    ),
    runTransaction: jest.fn(async (work: (transaction: any) => Promise<any>) => {
      const run = queue.then(async () => {
        const householdDraft = new Map(households)
        const lockDraft = new Map(locks)
        const operationDraft = new Map(operations)
        const transaction = {
          getCreationLock: async (id: string) => lockDraft.get(id) || null,
          getHousehold: async (id: string) => householdDraft.get(id) || null,
          createHousehold: async (record: any) => householdDraft.set(record._id, structuredClone(record)),
          createCreationLock: async (record: any) => lockDraft.set(record._id, structuredClone(record)),
          createOperation: async (record: any) => operationDraft.set(record._id, structuredClone(record)),
        }
        const result = await work(transaction)
        households.clear(); householdDraft.forEach((value, key) => households.set(key, value))
        locks.clear(); lockDraft.forEach((value, key) => locks.set(key, value))
        operations.clear(); operationDraft.forEach((value, key) => operations.set(key, value))
        return result
      })
      queue = run.then(() => undefined, () => undefined)
      return run
    }),
    households,
    locks,
    operations,
    getOperation: async (id: string) => operations.get(id) || null,
    getHousehold: async (id: string) => households.get(id) || null,
    getUser: jest.fn(async (id: string) => users.get(id) || null),
    updateHousehold: jest.fn(async (id: string, data: any) => households.set(id, { ...households.get(id), ...structuredClone(data) })),
    updateUser: jest.fn(async (id: string, data: any) => users.set(id, structuredClone(data))),
    users,
  }
  return repository
}

function dependencies(repository: ReturnType<typeof createRepository>, ids = ['home-first', 'home-second']) {
  let index = 0
  return {
    identityKey: 'trusted-user',
    repository,
    now: () => new Date('2026-08-14T08:00:00.000Z'),
    createHouseholdId: () => ids[index++] || 'home-extra',
    checkText: async () => true,
  }
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    requestId: 'request_1234567890',
    operationToken: 'operation_1234567890abcdef',
    name: DEFAULT_HOUSEHOLD_NAME,
    avatar: { kind: 'builtin', id: 'household-01' },
    ...overrides,
  }
}

describe('createHousehold', () => {
  it('creates one household with server-owned membership and a neutral profile', async () => {
    const repository = createRepository()
    const result = await createHousehold(request(), dependencies(repository))

    expect(result).toEqual({
      status: 'HOME', retryable: false, created: true,
      household: {
        id: 'home-first', name: DEFAULT_HOUSEHOLD_NAME, avatar: { kind: 'builtin', id: 'household-01' }, memberCount: 1, currentMemberRole: 'owner',
        members: [{ nickname: DEFAULT_PROFILE_NAME, avatar: { kind: 'builtin', id: 'person-neutral' }, profilePreset: 'neutral', isSelf: true }],
      },
      profile: { nickname: DEFAULT_PROFILE_NAME, avatar: { kind: 'builtin', id: 'person-neutral' }, profilePreset: 'neutral' },
    })
    expect(repository.households.get('home-first')).toMatchObject({ ownerKey: 'trusted-user', memberKeys: ['trusted-user'] })
    expect(typeof result.household.name).toBe('string')
    expect(JSON.stringify(result)).not.toContain('trusted-user')
  })

  it('returns the first household unchanged for sequential and concurrent retries', async () => {
    const repository = createRepository()
    const deps = dependencies(repository)
    const [first, second] = await Promise.all([
      createHousehold(request({ name: '第一个家' }), deps),
      createHousehold(request({ requestId: 'request_abcdefghij', operationToken: 'operation_abcdefghijklmnop', name: '第二个家' }), deps),
    ])

    expect(first.household.id).toBe('home-first')
    expect(second.household).toEqual(first.household)
    expect(repository.households.size).toBe(1)
    await expect(createHousehold(request({ name: '覆盖名称' }), deps)).resolves.toMatchObject({ created: false, household: { name: '第一个家' } })
  })

  it('returns an old household without requiring a creation lock', async () => {
    const repository = createRepository([{ _id: 'legacy-random-id', memberKeys: ['trusted-user'], ownerKey: 'trusted-user' }])
    const result = await createHousehold(request(), dependencies(repository))

    expect(result).toMatchObject({ created: false, household: { id: 'legacy-random-id', name: DEFAULT_HOUSEHOLD_NAME } })
    expect(repository.runTransaction).not.toHaveBeenCalled()
    expect(repository.households.size).toBe(1)
  })

  it('stops when legacy data contains more than one household', async () => {
    const repository = createRepository([
      { _id: 'legacy-1', memberKeys: ['trusted-user'] },
      { _id: 'legacy-2', memberKeys: ['trusted-user'] },
    ])
    await expect(createHousehold(request(), dependencies(repository))).rejects.toMatchObject({ code: 'MULTIPLE_HOUSEHOLDS' })
    expect(repository.runTransaction).not.toHaveBeenCalled()
  })

  it('rejects invalid text, request credentials and non-whitelisted avatars', async () => {
    const invalidRequests = [
      request({ name: '第一行\n第二行' }),
      request({ name: '家'.repeat(21) }),
      request({ requestId: 'short' }),
      request({ operationToken: 'short' }),
      request({ avatar: { kind: 'builtin', id: 'forged-avatar', approved: true } }),
      request({ avatar: { kind: 'custom', id: 'forged-media', approved: true } }),
    ]
    for (const input of invalidRequests) {
      await expect(createHousehold(input, dependencies(createRepository()))).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    }
  })

  it('accepts an already approved custom household avatar owned by the creator', async () => {
    const repository = createRepository()
    const customAvatar = { kind: 'custom', resourceId: 'avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', digest: 'a'.repeat(64) }
    repository.avatarMedia = {
      get: jest.fn(async () => ({ _id: customAvatar.resourceId, ownerKey: 'trusted-user', purpose: 'household', state: 'approved', digest: customAvatar.digest, formalPath: 'avatar-private/safe.png' })),
    }

    await expect(createHousehold(request({ avatar: customAvatar }), dependencies(repository))).resolves.toMatchObject({
      created: true,
      household: { avatar: customAvatar },
    })
  })

  it('ignores forged identity, household, owner, member and approval fields', async () => {
    const repository = createRepository()
    await createHousehold(request({
      identityKey: 'forged-user', householdId: 'forged-home', ownerKey: 'forged-owner',
      memberKeys: ['forged-member'], approved: true,
    }), dependencies(repository))

    expect(repository.households.has('forged-home')).toBe(false)
    expect(repository.households.get('home-first')).toMatchObject({ ownerKey: 'trusted-user', memberKeys: ['trusted-user'] })
  })

  it('does not commit either record when a transaction write fails', async () => {
    const repository = createRepository()
    repository.runTransaction.mockImplementationOnce(async (work: (transaction: any) => Promise<any>) => work({
      getCreationLock: async () => null,
      createHousehold: async () => undefined,
      createCreationLock: async () => { throw new Error('write failed') },
      createOperation: async () => undefined,
    }))

    await expect(createHousehold(request(), dependencies(repository))).rejects.toThrow('write failed')
    expect(repository.households.size).toBe(0)
    expect(repository.locks.size).toBe(0)
  })
})

describe('profile editing', () => {
  it('updates only a member household and normalises old profile data', async () => {
    const repository = createRepository([{ _id: 'home-1', name: '旧名称', memberKeys: ['trusted-user'], ownerKey: 'trusted-user' }])
    const deps = dependencies(repository)
    await expect(updateHousehold({ name: '  新家庭  ', avatar: { kind: 'builtin', id: 'household-03' } }, deps)).resolves.toMatchObject({ household: { name: '新家庭', avatar: { id: 'household-03' } } })
    await expect(updateProfile({ nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' }, profilePreset: 'xiaoshuai' }, deps)).resolves.toMatchObject({ profile: { nickname: '小帅', avatar: { id: 'person-01' }, profilePreset: 'xiaoshuai' } })
    expect(repository.users.get('trusted-user')).not.toHaveProperty('gender')
  })

  it('keeps an existing long nickname unchanged until the user actually renames it', async () => {
    const legacyNickname = '旧昵称'.repeat(4)
    const repository = createRepository([{ _id: 'home-1', name: '旧名称', memberKeys: ['trusted-user'], ownerKey: 'trusted-user' }])
    repository.users.set('trusted-user', { _id: 'trusted-user', nickname: legacyNickname, avatar: { kind: 'builtin', id: 'person-01' }, profilePreset: 'custom' })
    const deps = dependencies(repository)

    await expect(getCurrentHousehold(deps)).resolves.toMatchObject({ profile: { nickname: legacyNickname } })
    await expect(updateProfile({ nickname: legacyNickname, avatar: { kind: 'builtin', id: 'person-02' }, profilePreset: 'custom' }, deps))
      .resolves.toMatchObject({ profile: { nickname: legacyNickname, avatar: { id: 'person-02' } } })
    await expect(updateProfile({ nickname: '新昵称'.repeat(4), avatar: { kind: 'builtin', id: 'person-02' }, profilePreset: 'custom' }, deps))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' })
  })

  it('rejects invalid text, forged avatars and non-members without overwriting old data', async () => {
    const repository = createRepository([{ _id: 'home-1', name: '旧名称', avatar: { kind: 'builtin', id: 'household-01' }, memberKeys: ['trusted-user'] }])
    const deps = dependencies(repository)
    await expect(updateProfile({ nickname: '昵称'.repeat(6), avatar: { kind: 'builtin', id: 'person-01' }, profilePreset: 'custom' }, deps)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(updateHousehold({ name: '家庭'.repeat(11), avatar: { kind: 'builtin', id: 'household-02' } }, deps)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(updateProfile({ nickname: '昵称', avatar: { kind: 'custom', id: 'unsafe' }, profilePreset: 'custom' }, deps)).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    expect(repository.households.get('home-1').name).toBe('旧名称')
    await expect(updateProfile({ nickname: '昵称', avatar: { kind: 'builtin', id: 'person-01' }, profilePreset: 'custom' }, { ...deps, identityKey: 'other' })).rejects.toMatchObject({ code: 'NO_HOME' })
  })
})

describe('confirmHousehold', () => {
  it('binds a pending operation to the trusted cloud identity', async () => {
    const repository = createRepository()
    await createHousehold(request(), dependencies(repository))

    await expect(confirmHousehold(request(), dependencies(repository))).resolves.toMatchObject({ status: 'HOME' })
    await expect(confirmHousehold(request(), { ...dependencies(repository), identityKey: 'another-user' }))
      .resolves.toEqual({ status: 'OPERATION_MISMATCH', retryable: false })
  })
})

describe('getCurrentHousehold', () => {
  // 保护首页只能按可信身份读取自己的家庭，不接受任何前端家庭编号。
  it('returns the only matching household and reports an empty membership', async () => {
    const household = { _id: 'home-current', name: '山茶小屋', avatar: { kind: 'builtin', id: 'household-02' }, memberKeys: ['trusted-user'], ownerKey: 'trusted-user' }
    await expect(getCurrentHousehold(dependencies(createRepository([household])))).resolves.toMatchObject({
      status: 'HOME', household: { id: 'home-current', name: '山茶小屋' }, profile: { nickname: '小伙伴' },
    })
    await expect(getCurrentHousehold({ ...dependencies(createRepository()), identityKey: 'new-user' }))
      .resolves.toEqual({ status: 'NO_HOME', retryable: false })
  })

  it('refuses to choose one household when membership data conflicts', async () => {
    const repository = createRepository([
      { _id: 'home-1', memberKeys: ['trusted-user'] },
      { _id: 'home-2', memberKeys: ['trusted-user'] },
    ])
    await expect(getCurrentHousehold(dependencies(repository))).rejects.toMatchObject({ code: 'MULTIPLE_HOUSEHOLDS' })
  })

  it('returns only two safe member display records and marks the current user as me', async () => {
    const repository = createRepository([{
      _id: 'home-pair', ownerKey: 'trusted-user', memberKeys: ['trusted-user', 'other-user'],
      name: '两个人的家', avatar: { kind: 'builtin', id: 'household-01' },
    }])
    repository.users.set('trusted-user', { _id: 'trusted-user', nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' }, profilePreset: 'xiaoshuai' })
    repository.users.set('other-user', { _id: 'other-user', nickname: '小美', avatar: { kind: 'builtin', id: 'person-02' }, profilePreset: 'xiaomei' })

    await expect(getCurrentHousehold(dependencies(repository))).resolves.toMatchObject({
      household: {
        memberCount: 2,
        members: [
          { nickname: '小帅', isSelf: true },
          { nickname: '小美', isSelf: false },
        ],
      },
    })
    const result = await getCurrentHousehold(dependencies(repository))
    expect(JSON.stringify(result.household.members)).not.toContain('trusted-user')
    expect(JSON.stringify(result.household.members)).not.toContain('other-user')
  })
})

describe('household repository data', () => {
  it('uses the document id only for addressing and excludes it from written data', () => {
    expect(withoutDocumentId({ _id: 'home-1', name: '我们的小家', memberKeys: ['trusted-user'] })).toEqual({
      name: '我们的小家',
      memberKeys: ['trusted-user'],
    })
  })
})

export {}
