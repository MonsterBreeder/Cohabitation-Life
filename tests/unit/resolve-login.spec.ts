declare function require(path: string): {
  hashInviteToken(value: string): string
  resolveLoginEntry(
    input: { intent: 'login' | 'resume'; inviteToken?: unknown },
    dependencies: { identityKey: string; repository: Repository; now: Date },
  ): Promise<{ status: string; retryable: boolean; notice?: string }>
}

interface Repository {
  findUserByIdentityKey: jest.Mock
  findHouseholdByMemberKey: jest.Mock
  ensureUser: jest.Mock
  findInvitationByTokenHash: jest.Mock
  findHouseholdById: jest.Mock
}

const { hashInviteToken, resolveLoginEntry } = require('../../cloudfunctions/resolve-login/entry-state')

const token = 'A'.repeat(32)

// 每个测试使用独立仓库替身，明确观察哪些读写被触发。
function createRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    findUserByIdentityKey: jest.fn().mockResolvedValue(null),
    findHouseholdByMemberKey: jest.fn().mockResolvedValue(null),
    ensureUser: jest.fn().mockResolvedValue(undefined),
    findInvitationByTokenHash: jest.fn().mockResolvedValue(null),
    findHouseholdById: jest.fn().mockResolvedValue(null),
    ...overrides,
  }
}

// 统一提供可信身份和固定时间，避免测试依赖机器环境。
function resolve(input: { intent: 'login' | 'resume'; inviteToken?: unknown; userId?: string; householdId?: string }, repository: Repository) {
  return resolveLoginEntry(input, {
    identityKey: 'trusted-identity-key',
    repository,
    now: new Date('2026-08-13T12:00:00.000Z'),
  })
}

// 保护云端登录判断不会相信客户端身份、误用邀请或重复建档。
describe('resolveLoginEntry', () => {
  it('creates one minimal user only for an explicit login without an invitation', async () => {
    const repository = createRepository()

    await expect(resolve({ intent: 'login' }, repository)).resolves.toEqual({ status: 'CREATE_HOME', retryable: false })
    expect(repository.ensureUser).toHaveBeenCalledWith('trusted-identity-key')
  })

  it('keeps resume read-only when no user exists', async () => {
    const repository = createRepository()

    await expect(resolve({ intent: 'resume' }, repository)).resolves.toEqual({ status: 'NEED_LOGIN', retryable: false })
    expect(repository.ensureUser).not.toHaveBeenCalled()
  })

  it('returns home for an existing household user and ignores forged client fields', async () => {
    const repository = createRepository({
      findUserByIdentityKey: jest.fn().mockResolvedValue({ createdAt: 'earlier' }),
      findHouseholdByMemberKey: jest.fn().mockResolvedValue({ _id: 'real-home' }),
    })

    await expect(resolve({ intent: 'resume', userId: 'forged-user', householdId: 'forged-home' }, repository)).resolves.toEqual({
      status: 'HOME',
      retryable: false,
    })
    expect(repository.findUserByIdentityKey).toHaveBeenCalledWith('trusted-identity-key')
  })

  it('does not create a user or read data for malformed invitations', async () => {
    const repository = createRepository()

    await expect(resolve({ intent: 'login', inviteToken: 'bad' }, repository)).resolves.toEqual({
      status: 'INVITE_INVALID',
      retryable: false,
      notice: 'invite_invalid',
    })
    expect(repository.findInvitationByTokenHash).not.toHaveBeenCalled()
    expect(repository.ensureUser).not.toHaveBeenCalled()
  })

  it('does not create a user for an invitation that is not found', async () => {
    const repository = createRepository()

    await expect(resolve({ intent: 'login', inviteToken: token }, repository)).resolves.toEqual({
      status: 'INVITE_INVALID',
      retryable: false,
      notice: 'invite_invalid',
    })
    expect(repository.ensureUser).not.toHaveBeenCalled()
  })

  it.each([undefined, '', 'not-a-date'])('treats an invitation with %p expiry as invalid without creating a user', async (expiresAt) => {
    const repository = createRepository({
      findInvitationByTokenHash: jest.fn().mockResolvedValue({ expiresAt, householdId: 'home-1' }),
    })

    await expect(resolve({ intent: 'login', inviteToken: token }, repository)).resolves.toEqual({
      status: 'INVITE_INVALID',
      retryable: false,
      notice: 'invite_invalid',
    })
    expect(repository.findHouseholdById).not.toHaveBeenCalled()
    expect(repository.ensureUser).not.toHaveBeenCalled()
  })

  it.each([
    ['expired', { expiresAt: '2026-08-13T11:59:59.000Z' }, null, 'INVITE_EXPIRED'],
    ['used', { expiresAt: '2026-08-14T12:00:00.000Z', usedAt: '2026-08-13T11:00:00.000Z' }, null, 'INVITE_USED'],
    ['full', { expiresAt: '2026-08-14T12:00:00.000Z', householdId: 'home-1' }, { memberKeys: ['a', 'b'] }, 'HOME_FULL'],
  ])('returns %s invitation state without changing invitation or household records', async (_name, invitation, household, status) => {
    const repository = createRepository({
      findInvitationByTokenHash: jest.fn().mockResolvedValue(invitation),
      findHouseholdById: jest.fn().mockResolvedValue(household),
    })

    await expect(resolve({ intent: 'login', inviteToken: token }, repository)).resolves.toMatchObject({ status })
    expect(repository.ensureUser).toHaveBeenCalledTimes(1)
    expect(repository).not.toHaveProperty('consumeInvitation')
    expect(repository).not.toHaveProperty('addHouseholdMember')
  })

  it('returns join confirmation for a valid invitation without consuming it', async () => {
    const repository = createRepository({
      findInvitationByTokenHash: jest.fn().mockResolvedValue({ expiresAt: '2026-08-14T12:00:00.000Z', householdId: 'home-1' }),
      findHouseholdById: jest.fn().mockResolvedValue({ memberKeys: ['a'] }),
    })

    await expect(resolve({ intent: 'login', inviteToken: token }, repository)).resolves.toEqual({ status: 'JOIN_CONFIRM', retryable: false })
    expect(repository.findInvitationByTokenHash).toHaveBeenCalledWith(hashInviteToken(token))
    expect(repository.ensureUser).toHaveBeenCalledTimes(1)
  })

  it('does not consume an invitation for a user already in a household', async () => {
    const repository = createRepository({
      findUserByIdentityKey: jest.fn().mockResolvedValue({ createdAt: 'earlier' }),
      findHouseholdByMemberKey: jest.fn().mockResolvedValue({ _id: 'home-1' }),
    })

    await expect(resolve({ intent: 'resume', inviteToken: token }, repository)).resolves.toEqual({
      status: 'ALREADY_IN_HOME',
      retryable: false,
      notice: 'already_in_home',
    })
    expect(repository.ensureUser).not.toHaveBeenCalled()
    expect(repository.findInvitationByTokenHash).not.toHaveBeenCalled()
  })

  it('returns NEED_LOGIN before querying a valid invitation during resume without a user', async () => {
    const repository = createRepository()

    await expect(resolve({ intent: 'resume', inviteToken: token }, repository)).resolves.toEqual({
      status: 'NEED_LOGIN',
      retryable: false,
    })
    expect(repository.findInvitationByTokenHash).not.toHaveBeenCalled()
    expect(repository.ensureUser).not.toHaveBeenCalled()
  })
})

export {}
