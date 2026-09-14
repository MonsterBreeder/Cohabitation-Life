import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createHomeShareMessage,
  createHomeTimelineShare,
  householdAvatarSource,
  profileAvatarSource,
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

  // 保护首页微信分享：好友与朋友圈使用公开品牌文案，不携带任何家庭私密数据。
  it('builds privacy-safe home share content for friends and timeline', () => {
    expect(createHomeShareMessage()).toEqual({
      title: '睦录｜把共同生活认真记下来',
      path: '/pages/index/index',
    })
    expect(createHomeTimelineShare()).toEqual({
      title: '睦录｜把共同生活认真记下来',
      query: '',
    })
  })

  // 保护页面必须真正注册两个微信分享入口，避免只有文案函数却仍然显示菜单置灰。
  it('registers friend and timeline share hooks on the home page', () => {
    expect(homePageSource).toContain('onShareAppMessage(() => createHomeShareMessage())')
    expect(homePageSource).toContain('onShareTimeline(() => createHomeTimelineShare())')
  })
})
