import { hasHouseholdChanges, hasProfileChanges, householdNameError, nicknameError, pickRandomProfileAvatar } from '../../src/subpackages/household/edit-view'

describe('资料编辑视图规则', () => {
  const profile = { nickname: '小伙伴', avatar: { kind: 'builtin' as const, id: 'person-neutral' as const }, profilePreset: 'neutral' as const }

  it('识别草稿是否真的修改', () => {
    expect(hasHouseholdChanges('家', 'household-01', '家', 'household-01')).toBe(false)
    expect(hasHouseholdChanges('家', 'household-01', '新家', 'household-01')).toBe(true)
    expect(hasProfileChanges(profile, { ...profile })).toBe(false)
    expect(hasProfileChanges(profile, { ...profile, nickname: '小帅' })).toBe(true)
  })

  it('按完整字符验证20字家庭名和12字昵称', () => {
    expect(householdNameError('家'.repeat(20))).toBe('')
    expect(householdNameError('家'.repeat(21))).toContain('20')
    expect(nicknameError('👨‍👩‍👧‍👦'.repeat(12))).toBe('')
    expect(nicknameError('👨‍👩‍👧‍👦'.repeat(13))).toContain('12')
  })

  it('随机选择只返回四个内置形象', () => {
    expect(pickRandomProfileAvatar(() => 0)).toBe('person-01')
    expect(pickRandomProfileAvatar(() => 0.999)).toBe('person-04')
  })
})
