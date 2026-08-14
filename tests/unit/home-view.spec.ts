import { householdAvatarSource, profileAvatarSource, resolveHomeLoadDestination } from '../../src/pages/index/home-view'

describe('home view rules', () => {
  // 保护首页加载分流：未登录、无家庭和成功家庭都只能到对应页面。
  it('resolves login and household destinations from confirmed state', () => {
    expect(resolveHomeLoadDestination(false, 'HOME')).toBe('login')
    expect(resolveHomeLoadDestination(true, 'NO_HOME')).toBe('create-home')
    expect(resolveHomeLoadDestination(true, 'HOME')).toBe('home')
    expect(resolveHomeLoadDestination(true, 'TEMPORARY_FAILURE')).toBe('stay')
  })

  // 保护云端返回的有限素材编号始终映射到已打包头像。
  it('maps household and neutral profile avatars to local assets', () => {
    expect(householdAvatarSource('household-03')).toBe('/static/avatars/households/household-03.png')
    expect(profileAvatarSource('person-neutral')).toBe('/static/avatars/people/person-01.png')
  })
})
