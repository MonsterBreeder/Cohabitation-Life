import { createPinia, setActivePinia } from 'pinia'
import { resetAuthCloudClientForTesting, setAuthCloudClientForTesting, useAuthStore } from '../../src/store/modules/auth'
import { resetHouseholdCloudClientForTesting, useHouseholdStore } from '../../src/store/modules/household'

// 保护 Pinia 登录状态在首次进入、恢复、邀请和失败时保持一致。
describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    resetAuthCloudClientForTesting()
    resetHouseholdCloudClientForTesting()
  })

  it('does not let an older restore result overwrite a newly created household', async () => {
    let finish!: (value: { status: 'CREATE_HOME'; retryable: false }) => void
    setAuthCloudClientForTesting({ resolve: jest.fn(() => new Promise((resolve) => { finish = resolve })) })
    const auth = useAuthStore()
    auth.hasCompletedLogin = true
    const restoring = auth.restore()

    useHouseholdStore().applyHome({
      status: 'HOME', retryable: false, created: true,
      household: { id: 'home_1', name: '我们的小家', avatar: { kind: 'builtin', id: 'household-01' }, memberCount: 1, currentMemberRole: 'owner' },
      profile: { nickname: '小伙伴', avatar: { kind: 'builtin', id: 'person-neutral' } },
    })
    finish({ status: 'CREATE_HOME', retryable: false })
    await restoring

    expect(auth.navigationIntent).toBeUndefined()
  })

  it('does not query or create a user on a first open', async () => {
    const resolve = jest.fn()
    setAuthCloudClientForTesting({ resolve })

    const auth = useAuthStore()
    await auth.restore()

    expect(resolve).not.toHaveBeenCalled()
    expect(auth.navigationIntent).toBeUndefined()
  })

  it('uses the pending invite only after the user actively logs in', async () => {
    const resolve = jest.fn().mockResolvedValue({ status: 'JOIN_CONFIRM', retryable: false })
    setAuthCloudClientForTesting({ resolve })
    const auth = useAuthStore()
    auth.captureInviteToken('test-invite')

    await auth.login()

    expect(resolve).toHaveBeenCalledWith({ intent: 'login', inviteToken: 'test-invite' })
    expect(auth.pendingInviteToken).toBe('test-invite')
    expect(auth.hasCompletedLogin).toBe(true)
    expect(auth.consumeNavigationIntent()).toMatchObject({ page: 'join-home' })
  })

  it('keeps a valid invite until the join confirmation flow receives it', async () => {
    setAuthCloudClientForTesting({
      resolve: jest.fn().mockResolvedValue({ status: 'JOIN_CONFIRM', retryable: false }),
    })
    const auth = useAuthStore()
    auth.captureInviteToken('valid-invite-token')

    await auth.login()

    expect(auth.pendingInviteToken).toBe('valid-invite-token')
    expect(auth.consumeNavigationIntent()).toMatchObject({ page: 'join-home' })
  })

  it('shares one request when restore is triggered repeatedly', async () => {
    let finish: ((resolution: { status: 'HOME'; retryable: false }) => void) | undefined
    const resolve = jest.fn().mockImplementation(() => new Promise((resolvePromise) => {
      finish = resolvePromise
    }))
    setAuthCloudClientForTesting({ resolve })
    const auth = useAuthStore()
    auth.hasCompletedLogin = true

    const first = auth.restore()
    const second = auth.restore()
    finish?.({ status: 'HOME', retryable: false })
    await Promise.all([first, second])

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(auth.consumeNavigationIntent()).toMatchObject({ page: 'home' })
  })

  it('keeps the invite and current page available after a temporary failure', async () => {
    setAuthCloudClientForTesting({
      resolve: jest.fn().mockRejectedValue(new Error('offline')),
    })
    const auth = useAuthStore()
    auth.captureInviteToken('test-invite')

    await auth.login()

    expect(auth.pendingInviteToken).toBe('test-invite')
    expect(auth.navigationIntent).toBeUndefined()
    expect(auth.errorMessage).toBe('暂时无法连接服务，请稍后重试')
    expect(auth.canRetry).toBe(true)
  })

  it('shows an error when the cloud returns a temporary failure result', async () => {
    setAuthCloudClientForTesting({
      resolve: jest.fn().mockResolvedValue({ status: 'TEMPORARY_FAILURE', retryable: true }),
    })
    const auth = useAuthStore()

    await auth.login()

    expect(auth.navigationIntent).toBeUndefined()
    expect(auth.errorMessage).toBe('云端暂时无法完成登录，请稍后重试')
    expect(auth.canRetry).toBe(true)
  })

  it('clears a stale local login marker when the cloud reports NEED_LOGIN', async () => {
    setAuthCloudClientForTesting({
      resolve: jest.fn().mockResolvedValue({ status: 'NEED_LOGIN', retryable: false }),
    })
    const auth = useAuthStore()
    auth.hasCompletedLogin = true

    await auth.restore()

    expect(auth.hasCompletedLogin).toBe(false)
    expect(auth.consumeNavigationIntent()).toMatchObject({ page: 'login' })
  })

  it('uses the local status mapping instead of a cloud-provided notice', async () => {
    setAuthCloudClientForTesting({
      resolve: jest.fn().mockResolvedValue({
        status: 'INVITE_EXPIRED',
        retryable: false,
        notice: 'already_in_home',
      }),
    })
    const auth = useAuthStore()

    await auth.login()

    expect(auth.notice).toBe('invite_expired')
    expect(auth.consumeNavigationIntent()).toMatchObject({ page: 'invite-status' })
  })

  // 阶段一：本地标记丢失但云端已有家庭时，主动开始必须复用既有家庭，而不是创建第二个。
  it('restores an existing family when the local marker is cleared but the cloud has one', async () => {
    setAuthCloudClientForTesting({
      resolve: jest.fn().mockResolvedValue({ status: 'HOME', retryable: false }),
    })
    const auth = useAuthStore()
    // 模拟用户清缓存 / 重新安装小程序：本地没有开始使用标记。
    auth.hasCompletedLogin = false

    await auth.startUse()

    expect(auth.hasCompletedLogin).toBe(true)
    expect(auth.hasStartedUse).toBe(true)
    expect(auth.consumeNavigationIntent()).toMatchObject({ page: 'home' })
  })

  // 阶段一：已上线用户点击"开始使用"时只走只读恢复，不重复创建用户。
  it('startUse falls back to a read-only resume when the marker already exists', async () => {
    const resolve = jest.fn().mockResolvedValue({ status: 'HOME', retryable: false })
    setAuthCloudClientForTesting({ resolve })
    const auth = useAuthStore()
    auth.hasCompletedLogin = true

    await auth.startUse()

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith({ intent: 'resume', inviteToken: undefined })
    expect(auth.consumeNavigationIntent()).toMatchObject({ page: 'home' })
  })

  // 阶段一：未开始用户在主动开始前不应触发任何云端请求或创建身份。
  it('does not call the cloud or set a marker on the very first open', async () => {
    const resolve = jest.fn()
    setAuthCloudClientForTesting({ resolve })
    const auth = useAuthStore()

    await auth.restore()

    expect(resolve).not.toHaveBeenCalled()
    expect(auth.hasCompletedLogin).toBe(false)
    expect(auth.navigationIntent).toBeUndefined()
  })

  // 阶段一补强：方案 C 调整后，welcome 页不再主动清邀请；startUse 直接把 pendingInviteToken 透传给云端。
  // 这里覆盖两种典型用法：清邀请后不带（create 路径） / 不清邀请则带上（join 路径）。
  it('startUse sends no invite when pendingInviteToken is undefined', async () => {
    const resolve = jest.fn().mockResolvedValue({ status: 'CREATE_HOME', retryable: false })
    setAuthCloudClientForTesting({ resolve })
    const auth = useAuthStore()

    await auth.startUse()

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith({ intent: 'login', inviteToken: undefined })
    expect(auth.consumeNavigationIntent()).toMatchObject({ page: 'create-home' })
  })

  it('startUse forwards the pending invite to the cloud when one exists', async () => {
    const resolve = jest.fn().mockResolvedValue({ status: 'JOIN_CONFIRM', retryable: false })
    setAuthCloudClientForTesting({ resolve })
    const auth = useAuthStore()
    auth.captureInviteToken('valid-invite')
    expect(auth.pendingInviteToken).toBe('valid-invite')

    await auth.startUse()

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith({ intent: 'login', inviteToken: 'valid-invite' })
    // 仍在 join 流程中：邀请不应被消费
    expect(auth.pendingInviteToken).toBe('valid-invite')
    expect(auth.consumeNavigationIntent()).toMatchObject({ page: 'join-home' })
  })
})
