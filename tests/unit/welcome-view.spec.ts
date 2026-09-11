import { describeWelcomeView, resolveWelcomeMode, type WelcomeViewInput } from '../../src/pages/login/welcome-view'

const noInviteInput: WelcomeViewInput = {
  hasStartedUse: false,
  authResolving: false,
  authErrorMessage: null,
  invitePhase: 'other',
  invitePreview: null,
  inviteErrorMessage: null,
  inviteTerminalNotice: null,
  agreementChecked: true,
}

const invitePreview = {
  inviterNickname: '小帅',
  inviterAvatar: { kind: 'builtin', id: 'person-01' } as const,
  householdName: '我们的小家',
  memberCount: 1,
}

describe('welcome view', () => {
  it('未开始用户没有邀请时显示欢迎页，主按钮为"开始使用"，文案不再暗示创建', () => {
    const view = describeWelcomeView(noInviteInput)
    expect(view.mode).toBe('welcome')
    expect(view.primary).toMatchObject({ label: '开始使用', action: 'start-use' })
    expect(view.secondary).toMatchObject({ label: '先看看怎么用', action: 'preview-experience' })
    expect(view.showAgreement).toBe(true)
    expect(view.agreementHint).toMatch(/根据云端真实状态/)
    expect(view.loadingText).toBeNull()
    expect(view.primaryTestId).toBe('welcome-primary-start-use--welcome')
  })

  it('未开始用户有邀请时显示摘要，主按钮为"加入这个家"', () => {
    const view = describeWelcomeView({ ...noInviteInput, invitePhase: 'idle', invitePreview })
    expect(view.mode).toBe('invite-summary')
    expect(view.primary).toMatchObject({ label: '加入这个家', action: 'start-use' })
    expect(view.secondary).toMatchObject({ label: '先看看怎么用', action: 'preview-experience' })
    expect(view.invitation?.householdName).toBe('我们的小家')
    expect(view.invitation?.memberCount).toBe(1)
    expect(view.showAgreement).toBe(true)
    expect(view.agreementHint).toMatch(/核验/)
    expect(view.primaryTestId).toBe('welcome-primary-start-use--invite-summary')
  })

  it('邀请预览中显示加载并禁用按钮', () => {
    const view = describeWelcomeView({ ...noInviteInput, invitePhase: 'previewing' })
    expect(view.mode).toBe('invite-pending')
    expect(view.primary.action).toBeNull()
    expect(view.primary.disabled).toBe(true)
    expect(view.loadingText).toBe('正在确认邀请')
  })

  it('邀请暂时失败时给重试和结束邀请两个动作', () => {
    const view = describeWelcomeView({ ...noInviteInput, inviteErrorMessage: '网络错误' })
    expect(view.mode).toBe('invite-failed')
    expect(view.primary).toMatchObject({ label: '重新确认邀请', action: 'retry' })
    expect(view.secondary).toMatchObject({ label: '结束这份邀请', action: 'end-invite' })
    expect(view.errorMessage).toBe('网络错误')
  })

  it('邀请终态只显示结束邀请和体验入口', () => {
    const view = describeWelcomeView({ ...noInviteInput, inviteTerminalNotice: 'invite_expired' })
    expect(view.mode).toBe('invite-terminal')
    expect(view.primary).toMatchObject({ label: '结束这份邀请', action: 'end-invite' })
    expect(view.secondary).toMatchObject({ label: '先看看怎么用', action: 'preview-experience' })
    expect(view.terminalTitle).toBe('这份邀请已失效')
    expect(view.terminalMessage).toContain('有效时间')
  })

  it('已上线用户恢复中显示"正在确认登录状态"', () => {
    const view = describeWelcomeView({ ...noInviteInput, hasStartedUse: true, authResolving: true })
    expect(view.mode).toBe('recovery-pending')
    expect(view.loadingText).toBe('正在确认登录状态')
    expect(view.showAgreement).toBe(false)
  })

  it('已上线用户恢复失败时显示重试按钮，不需要协议', () => {
    const view = describeWelcomeView({ ...noInviteInput, hasStartedUse: true, authErrorMessage: '网络断开' })
    expect(view.mode).toBe('recovery-failed')
    expect(view.primary).toMatchObject({ label: '重新确认', action: 'retry' })
    expect(view.errorMessage).toBe('网络断开')
    expect(view.showAgreement).toBe(false)
  })

  it('欢迎页未勾选协议时主按钮不可点', () => {
    const view = describeWelcomeView({ ...noInviteInput, agreementChecked: false })
    expect(view.mode).toBe('welcome')
    expect(view.primary.disabled).toBe(true)
  })

  it('邀请摘要未勾选协议时主按钮不可点', () => {
    const view = describeWelcomeView({ ...noInviteInput, agreementChecked: false, invitePhase: 'idle', invitePreview })
    expect(view.mode).toBe('invite-summary')
    expect(view.primary.disabled).toBe(true)
  })

  it('恢复 / 邀请终态 / 邀请失败时不需要协议，按钮按业务可用', () => {
    expect(describeWelcomeView({ ...noInviteInput, hasStartedUse: true, authErrorMessage: 'x' }).showAgreement).toBe(false)
    expect(describeWelcomeView({ ...noInviteInput, inviteTerminalNotice: 'invite_used' }).showAgreement).toBe(false)
    expect(describeWelcomeView({ ...noInviteInput, inviteErrorMessage: 'x' }).showAgreement).toBe(false)
    expect(describeWelcomeView({ ...noInviteInput, invitePhase: 'previewing' }).showAgreement).toBe(false)
  })

  it('视图模式解析与 describeWelcomeView 保持一致', () => {
    expect(resolveWelcomeMode({ ...noInviteInput, invitePhase: 'previewing' })).toBe('invite-pending')
    expect(resolveWelcomeMode({ ...noInviteInput, inviteTerminalNotice: 'home_full' })).toBe('invite-terminal')
    expect(resolveWelcomeMode(noInviteInput)).toBe('welcome')
  })
})
