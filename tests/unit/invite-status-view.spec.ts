import { describeInviteStatusView, describeInviteStatusLoading } from '../../src/subpackages/household/invite-status/invite-status-view'

describe('invite status view', () => {
  it('未开始用户看到"结束邀请"回到欢迎页，不暴露原文或家庭编号', () => {
    const view = describeInviteStatusView({
      notice: 'invite_invalid',
      hasStartedUse: false,
      hasHousehold: false,
      isResolving: false,
      errorMessage: null,
    })
    expect(view.title).toBe('这份邀请无效')
    expect(view.primaryAction).toBe('end-invite-and-welcome')
    expect(view.primaryLabel).toBe('结束这份邀请')
  })

  it('已开始用户且有家庭时回到自己的家，不跳转加入', () => {
    const view = describeInviteStatusView({
      notice: 'home_full',
      hasStartedUse: true,
      hasHousehold: true,
      isResolving: false,
      errorMessage: null,
    })
    expect(view.primaryAction).toBe('back-home')
    expect(view.title).toContain('不适用')
  })

  it('已开始用户没有家庭时主动去创建', () => {
    const view = describeInviteStatusView({
      notice: 'invite_expired',
      hasStartedUse: true,
      hasHousehold: false,
      isResolving: false,
      errorMessage: null,
    })
    expect(view.primaryAction).toBe('create-home')
    expect(view.title).toBe('这份邀请已失效')
  })

  it('未知 notice 回退到通用文案', () => {
    const view = describeInviteStatusView({
      notice: null,
      hasStartedUse: false,
      hasHousehold: false,
      isResolving: false,
      errorMessage: null,
    })
    expect(view.title).toBe('邀请暂时无法使用')
    expect(view.primaryAction).toBe('end-invite-and-welcome')
  })

  it('加载占位页只在确认邀请时显示', () => {
    const view = describeInviteStatusLoading()
    expect(view.primaryLoading).toBe(true)
    expect(view.primaryDisabled).toBe(true)
    expect(view.primaryAction).toBeNull()
  })
})
