import {
  createInvitationInCloud,
  resetInvitationCloudForTesting,
  setInvitationCloudEnvironmentForTesting,
  setInvitationCloudRuntimeForTesting,
  setInvitationCloudTimeoutForTesting,
} from '../../src/services/invitation-cloud'

describe('邀请云端服务', () => {
  const init = jest.fn()
  const callFunction = jest.fn()

  beforeEach(() => {
    resetInvitationCloudForTesting()
    init.mockReset()
    callFunction.mockReset()
    setInvitationCloudEnvironmentForTesting('test-env')
    setInvitationCloudRuntimeForTesting({ cloud: { init, callFunction } })
  })

  afterEach(resetInvitationCloudForTesting)

  it('旧版本返回邀请时，仍保留当前填写的邀请对象昵称', async () => {
    callFunction.mockResolvedValue({ result: { status: 'INVITE_READY', retryable: false, inviteToken: 'A'.repeat(32), expiresAt: '2026-08-15T12:00:00.000Z' } })

    await expect(createInvitationInCloud('小帅')).resolves.toMatchObject({ status: 'INVITE_READY', inviteeName: '小帅' })
  })

  it('云端长期没有回应时，会结束等待而不是让页面一直显示准备中', async () => {
    setInvitationCloudTimeoutForTesting(1)
    callFunction.mockImplementation(() => new Promise(() => undefined))

    await expect(createInvitationInCloud('小帅')).rejects.toThrow('INVITATION_TIMEOUT')
  })
})
