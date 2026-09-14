import type { BuiltinHouseholdAvatarId, BuiltinProfileAvatarId } from '../../types/household'

const HOME_SHARE_TITLE = '睦录｜把共同生活认真记下来'

const householdAvatarSources: Record<BuiltinHouseholdAvatarId, string> = {
  'household-01': '/static/avatars/households/household-01.png',
  'household-02': '/static/avatars/households/household-02.png',
  'household-03': '/static/avatars/households/household-03.png',
}

const profileAvatarSources: Record<BuiltinProfileAvatarId, string> = {
  // 默认中性资料先使用第一张无性别形象；后续编辑页仍保存明确的素材编号。
  'person-neutral': '/static/avatars/people/person-01.png',
  'person-01': '/static/avatars/people/person-01.png',
  'person-02': '/static/avatars/people/person-02.png',
  'person-03': '/static/avatars/people/person-03.png',
  'person-04': '/static/avatars/people/person-04.png',
}

/** 将受限的内置素材编号映射为本地路径，不接受云端直接下发任意地址。 */
export function householdAvatarSource(id: BuiltinHouseholdAvatarId): string {
  return householdAvatarSources[id]
}

/** 将本人头像编号映射为已打包素材，默认资料也始终有可展示图片。 */
export function profileAvatarSource(id: BuiltinProfileAvatarId): string {
  return profileAvatarSources[id]
}

export type HomeLoadDestination = 'login' | 'create-home' | 'home' | 'stay'

/** 首页只根据已确认状态决定去向，失败留在原位供用户重试。 */
export function resolveHomeLoadDestination(hasLogin: boolean, status?: string): HomeLoadDestination {
  if (!hasLogin) return 'login'
  if (status === 'NO_HOME') return 'create-home'
  if (status === 'HOME') return 'home'
  return 'stay'
}

/** 好友转发只使用公开品牌文案和固定首页路径，避免把当前家庭资料带入分享卡片。 */
export function createHomeShareMessage(): { title: string; path: string } {
  return {
    title: HOME_SHARE_TITLE,
    path: '/pages/index/index',
  }
}

/** 朋友圈分享不附带查询参数，接收者进入后仍由首页执行正常的登录与家庭分流。 */
export function createHomeTimelineShare(): { title: string; query: string } {
  return {
    title: HOME_SHARE_TITLE,
    query: '',
  }
}
