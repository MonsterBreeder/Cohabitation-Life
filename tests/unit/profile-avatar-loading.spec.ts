import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function load(relativePath: string): string {
  return readFileSync(resolve(__dirname, `../../${relativePath}`), 'utf8')
}

describe('我的页自定义头像加载状态', () => {
  const profilePage = load('src/pages/profile/index.vue')
  const householdCard = load('src/components/home/HomeSummaryCard.vue')
  const memberCard = load('src/pages/index/components/MemberProfileCard.vue')

  // 保护问题根因：自定义头像地址未返回前，不得先塞内置头像。
  it('自定义头像地址初始为空，不使用默认图片先占位', () => {
    expect(profilePage).toContain("const householdAvatarUrl = shallowRef('')")
    expect(profilePage).toContain("const profileAvatarUrl = shallowRef('')")
    expect(profilePage).not.toContain("memberAvatarUrls[member.avatar.resourceId] || profileAvatarSource('person-neutral')")
  })

  it('个人、家庭和成员头像都传入独立的加载状态', () => {
    expect(profilePage).toContain(':avatar-loading="householdAvatarLoading"')
    expect(profilePage).toContain(':avatar-loading="isMemberAvatarLoading(member)"')
    expect(profilePage).toContain('profileAvatarLoading')
  })

  it('家庭和成员卡片加载时显示转圈，地址缺失时显示中性图标', () => {
    for (const source of [householdCard, memberCard]) {
      expect(source).toContain('v-if="avatarLoading"')
      expect(source).toContain('<wd-loading')
      expect(source).toContain('v-else-if="avatarSrc"')
    }
    expect(householdCard).toContain('icon="home"')
    expect(memberCard).toContain('icon="user"')
  })
})
