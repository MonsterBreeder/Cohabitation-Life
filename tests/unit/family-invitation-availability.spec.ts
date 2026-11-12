import { createHash } from 'node:crypto'

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  database: () => mockDatabase,
  getWXContext: () => ({ APPID: 'test-app', OPENID: mockOpenId }),
}), { virtual: true })
jest.mock('@cloudbase/node-sdk', () => ({}), { virtual: true })
jest.mock('@cloudbase/node-sdk/lib/storage', () => ({}), { virtual: true })

const ownerKey = identityKey('owner')
const memberKey = identityKey('member')
let mockOpenId = 'owner'
let settings: { enabled?: unknown } | null = null
let memberKeys = [ownerKey]
const readSettings = jest.fn(async () => ({ data: settings }))
const writeInvitation = jest.fn()
const home = () => ({
  _id: 'home-test',
  name: '测试家庭',
  ownerKey,
  memberKeys,
  avatar: { kind: 'builtin', id: 'household-01' },
})
const mockDatabase = {
  command: { all: (keys: string[]) => keys },
  collection: (name: string) => ({
    doc: (id: string) => ({
      get: async () => {
        if (name === 'appSettings' && id === 'family-invitations') return readSettings()
        return { data: name === 'households' && id === 'home-test' ? home() : null }
      },
      set: writeInvitation,
    }),
    where: ({ memberKeys: keys }: { memberKeys: string[] }) => ({
      limit: () => ({ get: async () => ({ data: keys.every((key) => memberKeys.includes(key)) ? [home()] : [] }) }),
    }),
  }),
  runTransaction: (work: (transaction: typeof mockDatabase) => unknown): unknown => work(mockDatabase),
}

function identityKey(openId: string): string {
  return `user_${createHash('sha256').update(`test-app:${openId}`).digest('hex')}`
}

const { main } = require('../../cloudfunctions/household/index')

beforeEach(() => {
  mockOpenId = 'owner'
  memberKeys = [ownerKey]
  settings = null
  jest.clearAllMocks()
})

// 用家庭服务的真实入口验证开关状态及邀请写入，避免只验证按钮显示。
it.each([null, { enabled: false }, { enabled: 'true' }])('只有明确开启才允许发出邀请（%p）', async (value) => {
  settings = value
  expect(await main({ action: 'get' })).toMatchObject({ status: 'HOME', household: { invitationEnabled: false } })
  expect(await main({ action: 'createInvite' })).toEqual({ status: 'INVITE_DISABLED', retryable: false })
  expect(writeInvitation).not.toHaveBeenCalled()
})

it('打开后可以发出邀请，关闭后旧页面无法继续生成', async () => {
  settings = { enabled: true }
  expect(await main({ action: 'get' })).toMatchObject({ household: { invitationEnabled: true } })
  expect(await main({ action: 'createInvite' })).toMatchObject({ status: 'INVITE_READY' })
  settings = { enabled: false }
  expect(await main({ action: 'createInvite' })).toMatchObject({ status: 'INVITE_DISABLED' })
  expect(writeInvitation).toHaveBeenCalledTimes(1)
})

it('配置读取失败时家庭资料仍能返回', async () => {
  const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  try {
    readSettings.mockRejectedValueOnce(new Error('读取超时'))
    expect(await main({ action: 'get' })).toMatchObject({ status: 'HOME', household: { invitationEnabled: false } })
  } finally {
    warning.mockRestore()
  }
})

// 双人家庭的双方同步读取入口开关，家庭成员和角色不受开关影响。
it.each([false, true])('开关为 %s 时，两位成员仍能读取同一家庭和自己的角色', async (enabled) => {
  settings = { enabled }
  memberKeys = [ownerKey, memberKey]
  const owner = await main({ action: 'get' })
  mockOpenId = 'member'
  const member = await main({ action: 'get' })
  expect(owner.household).toMatchObject({ id: 'home-test', memberCount: 2, currentMemberRole: 'owner', invitationEnabled: enabled })
  expect(member.household).toMatchObject({ id: 'home-test', memberCount: 2, currentMemberRole: 'member', invitationEnabled: enabled })
  expect(owner.household.members.map((entry: { isSelf: boolean }) => entry.isSelf)).toEqual([true, false])
  expect(member.household.members.map((entry: { isSelf: boolean }) => entry.isSelf)).toEqual([false, true])
  expect(readSettings).toHaveBeenCalledTimes(2)
})
