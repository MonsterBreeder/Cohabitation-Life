// 保护生活页固定应用范围，未开放应用不能跳进空页面。
import { LIFE_APPS, lifeAppDestination } from '../../src/pages/life/life-view'

describe('生活页应用入口', () => {
  it('固定展示四个应用且只开放徒步', () => {
    expect(LIFE_APPS.map((item) => item.id)).toEqual(['hiking', 'weight', 'cycling', 'star'])
    expect(LIFE_APPS.filter((item) => item.enabled).map((item) => item.id)).toEqual(['hiking'])
  })

  it('未开放应用不产生跳转地址', () => {
    expect(lifeAppDestination('hiking')).toBe('/subpackages/hiking/hiking-home/index')
    expect(lifeAppDestination('weight')).toBeNull()
  })
})
