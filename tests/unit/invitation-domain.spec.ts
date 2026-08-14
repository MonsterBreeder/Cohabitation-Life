declare function require(path: string): any

const {
  createInvitation,
  previewInvitation,
  joinInvitation,
  removeOtherMember,
} = require('../../cloudfunctions/household/invitation-domain')

const token = 'A'.repeat(32)

function createRepository(seed: { households?: any[]; invitations?: any[]; users?: any[] } = {}) {
  const households = new Map((seed.households || []).map((item) => [item._id, structuredClone(item)]))
  const invitations = new Map((seed.invitations || []).map((item) => [item._id, structuredClone(item)]))
  const users = new Map((seed.users || []).map((item) => [item._id, structuredClone(item)]))
  const locks = new Map()
  let queue = Promise.resolve()
  return {
    households,
    invitations,
    users,
    locks,
    findHouseholdsByMemberKey: jest.fn(async (identityKey: string) => [...households.values()].filter((home) => home.memberKeys.includes(identityKey))),
    findInvitationByTokenHash: jest.fn(async (tokenHash: string) => [...invitations.values()].find((invite) => invite.tokenHash === tokenHash) || null),
    getHousehold: jest.fn(async (id: string) => households.get(id) || null),
    getUser: jest.fn(async (id: string) => users.get(id) || null),
    runTransaction: jest.fn(async (work: (transaction: any) => Promise<any>) => {
      const run = queue.then(async () => {
        const homeDraft = new Map([...households].map(([key, value]) => [key, structuredClone(value)]))
        const inviteDraft = new Map([...invitations].map(([key, value]) => [key, structuredClone(value)]))
        const userDraft = new Map([...users].map(([key, value]) => [key, structuredClone(value)]))
        const lockDraft = new Map([...locks].map(([key, value]) => [key, structuredClone(value)]))
        const transaction = {
          getHousehold: async (id: string) => homeDraft.get(id) || null,
          setHousehold: async (record: any) => homeDraft.set(record._id, structuredClone(record)),
          deleteHousehold: async (id: string) => homeDraft.delete(id),
          getInvitation: async (id: string) => inviteDraft.get(id) || null,
          setInvitation: async (record: any) => inviteDraft.set(record._id, structuredClone(record)),
          getUser: async (id: string) => userDraft.get(id) || null,
          setUser: async (record: any) => userDraft.set(record._id, structuredClone(record)),
          getMembershipLock: async (id: string) => lockDraft.get(id) || null,
          setMembershipLock: async (record: any) => lockDraft.set(record._id, structuredClone(record)),
          deleteMembershipLock: async (id: string) => lockDraft.delete(id),
        }
        const result = await work(transaction)
        households.clear(); homeDraft.forEach((value, key) => households.set(key, value))
        invitations.clear(); inviteDraft.forEach((value, key) => invitations.set(key, value))
        users.clear(); userDraft.forEach((value, key) => users.set(key, value))
        locks.clear(); lockDraft.forEach((value, key) => locks.set(key, value))
        return result
      })
      queue = run.then(() => undefined, () => undefined)
      return run
    }),
  }
}

function dependencies(repository: ReturnType<typeof createRepository>, identityKey = 'owner') {
  return {
    identityKey,
    repository,
    now: () => new Date('2026-08-14T12:00:00.000Z'),
    createToken: () => token,
  }
}

describe('邀请与成员关系', () => {
  it('仅允许单人家庭的创建者生成一份有效邀请，并且重发会替换旧邀请', async () => {
    const repository = createRepository({ households: [{ _id: 'home-1', ownerKey: 'owner', memberKeys: ['owner'] }] })

    const first = await createInvitation({ inviteeName: '小美' }, dependencies(repository))
    const second = await createInvitation({ inviteeName: '小美' }, dependencies(repository))

    expect(first).toMatchObject({ status: 'INVITE_READY', expiresAt: '2026-08-15T12:00:00.000Z' })
    expect(second).toMatchObject({ status: 'INVITE_READY' })
    expect(repository.invitations.size).toBe(1)
  })

  it('邀请对象昵称只用于创建者本机展示，不会写入邀请', async () => {
    const repository = createRepository({ households: [{ _id: 'home-1', ownerKey: 'owner', memberKeys: ['owner'] }] })

    await expect(createInvitation({ inviteeName: '这是一个超过十二个字的邀请对象昵称' }, dependencies(repository))).resolves.toMatchObject({ status: 'INVITE_READY' })
    expect(repository.invitations.get('invite_home-1')).not.toHaveProperty('inviteeName')
  })

  it('无家庭的受邀者加入后，邀请失效且家庭恰好有两人', async () => {
    const repository = createRepository({
      households: [{ _id: 'home-1', ownerKey: 'owner', memberKeys: ['owner'] }],
      invitations: [{ _id: 'invite_home-1', householdId: 'home-1', tokenHash: require('crypto').createHash('sha256').update(token).digest('hex'), expiresAt: '2026-08-15T12:00:00.000Z' }],
      users: [{ _id: 'guest', nickname: '小美' }],
    })

    await expect(joinInvitation({ inviteToken: token, mode: 'join' }, dependencies(repository, 'guest'))).resolves.toMatchObject({
      status: 'HOME', household: { id: 'home-1', memberCount: 2 },
    })
    expect(repository.households.get('home-1').memberKeys).toEqual(['owner', 'guest'])
    expect(repository.invitations.get('invite_home-1').usedAt).toBeTruthy()
  })

  it('单人家庭仅在明确转入后才会被替换，个人资料会保留', async () => {
    const repository = createRepository({
      households: [
        { _id: 'target', ownerKey: 'owner', memberKeys: ['owner'] },
        { _id: 'old', ownerKey: 'guest', memberKeys: ['guest'] },
      ],
      invitations: [{ _id: 'invite_target', householdId: 'target', tokenHash: require('crypto').createHash('sha256').update(token).digest('hex'), expiresAt: '2026-08-15T12:00:00.000Z' }],
      users: [{ _id: 'guest', nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } }],
    })

    await expect(joinInvitation({ inviteToken: token, mode: 'join' }, dependencies(repository, 'guest'))).resolves.toMatchObject({ status: 'TRANSFER_CONFIRM' })
    await expect(joinInvitation({ inviteToken: token, mode: 'transfer' }, dependencies(repository, 'guest'))).resolves.toMatchObject({ status: 'HOME', household: { id: 'target', memberCount: 2 } })
    expect(repository.households.has('old')).toBe(false)
    expect(repository.users.get('guest')).toMatchObject({ nickname: '小帅' })
  })

  it('拒绝把双人家庭成员转入其他家庭，也拒绝普通成员移除他人', async () => {
    const repository = createRepository({
      households: [
        { _id: 'target', ownerKey: 'owner', memberKeys: ['owner'] },
        { _id: 'old', ownerKey: 'guest', memberKeys: ['guest', 'partner'] },
      ],
      invitations: [{ _id: 'invite_target', householdId: 'target', tokenHash: require('crypto').createHash('sha256').update(token).digest('hex'), expiresAt: '2026-08-15T12:00:00.000Z' }],
    })

    await expect(joinInvitation({ inviteToken: token, mode: 'transfer' }, dependencies(repository, 'guest'))).resolves.toMatchObject({ status: 'ALREADY_IN_HOME' })
    await expect(removeOtherMember({}, dependencies(repository, 'partner'))).resolves.toMatchObject({ status: 'FORBIDDEN' })
  })

  it('创建者移除唯一另一位成员后，对方没有家庭但保留资料和一次性提醒', async () => {
    const repository = createRepository({
      households: [{ _id: 'home-1', ownerKey: 'owner', memberKeys: ['owner', 'guest'] }],
      users: [{ _id: 'guest', nickname: '小伙伴' }],
    })

    await expect(removeOtherMember({}, dependencies(repository))).resolves.toMatchObject({ status: 'HOME', household: { memberCount: 1 } })
    expect(repository.households.get('home-1').memberKeys).toEqual(['owner'])
    expect(repository.users.get('guest')).toMatchObject({ nickname: '小伙伴', membershipNotice: 'removed_from_home' })
  })

  it('预览从不消耗邀请，也不暴露成员身份', async () => {
    const repository = createRepository({
      households: [{ _id: 'home-1', name: '我们的小家', ownerKey: 'owner', memberKeys: ['owner'] }],
      invitations: [{ _id: 'invite_home-1', householdId: 'home-1', tokenHash: require('crypto').createHash('sha256').update(token).digest('hex'), expiresAt: '2026-08-15T12:00:00.000Z' }],
      users: [{ _id: 'owner', nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' }, profilePreset: 'xiaoshuai' }],
    })

    await expect(previewInvitation({ inviteToken: token }, dependencies(repository, 'guest'))).resolves.toEqual({
      status: 'INVITE_PREVIEW', retryable: false,
      household: { name: '我们的小家', avatar: { kind: 'builtin', id: 'household-01' }, memberCount: 1 },
      inviter: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' }, profilePreset: 'xiaoshuai' },
    })
    expect(JSON.stringify(await previewInvitation({ inviteToken: token }, dependencies(repository, 'guest')))).not.toContain('owner')
  })
})

export {}
