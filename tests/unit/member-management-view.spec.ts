import { invitationNameFromInput, invitationNameValidation, invitationPanelState } from '../../src/subpackages/household/member-management/member-management-view'

describe('成员邀请页输入同步', () => {
  it('能读取小程序输入事件中的最新昵称', () => {
    expect(invitationNameFromInput({ detail: { value: '小美' } })).toBe('小美')
    expect(invitationNameFromInput('小帅')).toBe('小帅')
  })

  it('无法读取输入时返回空字符串，交由页面提示重新填写', () => {
    expect(invitationNameFromInput({ detail: {} })).toBe('')
  })

  it('邀请失败后显示重试状态，不会继续伪装成准备中', () => {
    expect(invitationPanelState(false, false, true)).toBe('failed')
    expect(invitationPanelState(false, true, false)).toBe('preparing')
    expect(invitationPanelState(true, false, false)).toBe('ready')
  })

  it('尚未开始时保持手动准备状态', () => {
    expect(invitationPanelState(false, false, false)).toBe('idle')
  })

  it('点击准备时可以直接取得稳定的昵称校验结果', () => {
    expect(invitationNameValidation('小帅')).toEqual({ valid: true, value: '小帅', count: 2 })
    expect(invitationNameValidation('')).toMatchObject({ valid: false, reason: 'empty' })
  })
})
