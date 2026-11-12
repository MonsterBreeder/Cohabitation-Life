import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  householdAvatarSource,
  profileAvatarSource,
  isCurrentMemberAvatarRequest,
  resolveHomeLoadDestination,
} from '../../src/pages/index/home-view'

const homePageSource = readFileSync(resolve(__dirname, '../../src/pages/index/index.vue'), 'utf8')

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

  // 首页关闭好友转发和朋友圈分享，家庭邀请在独立页面操作。
  it('不注册首页的微信转发和朋友圈分享', () => {
    expect(homePageSource).not.toMatch(/onShareAppMessage|onShareTimeline|showShareMenu/)
    expect(homePageSource).not.toContain('open-type="share"')
  })

  it('只接受当前家庭当前批次的成员头像结果', () => {
    expect(
      isCurrentMemberAvatarRequest({
        requestVersion: 2,
        currentVersion: 2,
        requestHouseholdId: 'home-a',
        currentHouseholdId: 'home-a',
      }),
    ).toBe(true)
    expect(
      isCurrentMemberAvatarRequest({
        requestVersion: 1,
        currentVersion: 2,
        requestHouseholdId: 'home-a',
        currentHouseholdId: 'home-a',
      }),
    ).toBe(false)
    expect(
      isCurrentMemberAvatarRequest({
        requestVersion: 2,
        currentVersion: 2,
        requestHouseholdId: 'home-a',
        currentHouseholdId: 'home-b',
      }),
    ).toBe(false)
  })
})
