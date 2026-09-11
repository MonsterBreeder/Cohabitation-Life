import {
  createInvitationInCloud,
  previewInvitationInCloud,
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

  // 阶段二：预览响应中的邀请人头像只能受控编号或短时 URL；custom 资源编号一律拒绝。
  it.each([
    ['custom resource id', { kind: 'custom', resourceId: 'avatar_resource_1', digest: 'abc' }],
    ['builtin id not in whitelist', { kind: 'builtin', id: 'forged-id' }],
    ['temp url not https', { kind: 'temp', url: 'http://example.com/x' }],
    ['temp url is cloud scheme', { kind: 'temp', url: 'cloud://tcb-qcloud.com/foo' }],
    ['unknown avatar kind', { kind: 'remote', id: 'whatever' }],
    ['avatar missing', null],
  ])('rejects an invitation preview with %s', async (_label, avatar) => {
    callFunction.mockResolvedValue({ result: {
      status: 'INVITE_PREVIEW', retryable: false,
      household: { name: '我们的小家', avatar: { kind: 'builtin', id: 'household-01' }, memberCount: 1 },
      inviter: { nickname: '小帅', avatar },
    } })

    await expect(previewInvitationInCloud('A'.repeat(32))).rejects.toThrow('邀请服务返回的数据无效')
  })

  it('accepts an invitation preview with a builtin inviter avatar', async () => {
    callFunction.mockResolvedValue({ result: {
      status: 'INVITE_PREVIEW', retryable: false,
      household: { name: '我们的小家', avatar: { kind: 'builtin', id: 'household-01' }, memberCount: 1 },
      inviter: { nickname: '小帅', avatar: { kind: 'builtin', id: 'person-01' } },
    } })

    await expect(previewInvitationInCloud('A'.repeat(32))).resolves.toMatchObject({ status: 'INVITE_PREVIEW' })
  })

  it('accepts an invitation preview with a short-lived https temp url', async () => {
    callFunction.mockResolvedValue({ result: {
      status: 'INVITE_PREVIEW', retryable: false,
      household: { name: '我们的小家', avatar: { kind: 'builtin', id: 'household-01' }, memberCount: 1 },
      inviter: { nickname: '小帅', avatar: { kind: 'temp', url: 'https://example.com/temp/avatar' } },
    } })

    await expect(previewInvitationInCloud('A'.repeat(32))).resolves.toMatchObject({ status: 'INVITE_PREVIEW' })
  })
})
