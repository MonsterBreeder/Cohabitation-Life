<template>
  <view class="profile-page">
    <!-- 加载态：转圈 + 标准文案（与全站 loading 风格统一；方案 2 全站统一为转圈） -->
    <view v-if="isLoading" class="page-state" data-testid="profile-loading">
      <wd-loading color="#267A5A" size="40rpx" />
      <text class="page-state__title">正在加载我的</text>
    </view>

    <view v-else-if="household && profile" class="profile-content">
      <view class="profile-heading">
        <text class="profile-heading__eyebrow">我的空间</text>
        <text class="profile-heading__title">设置和陪伴都在这里</text>
      </view>

      <button class="profile-summary" @click="openProfileEditor">
        <view class="profile-summary__avatar">
          <view v-if="profileAvatarLoading" class="profile-summary__avatar-placeholder" aria-label="个人头像加载中">
            <wd-loading color="#43C89A" size="32rpx" />
          </view>
          <wd-avatar v-else-if="profile.avatar.kind === 'builtin'" :src="profileAvatarSource(profile.avatar.id)" size="116rpx" />
          <wd-avatar v-else-if="profileAvatarUrl" :src="profileAvatarUrl" :alt="`${profile.nickname}的头像`" size="116rpx" />
          <wd-avatar v-else icon="user" bg-color="#effbf5" color="#267A5A" size="116rpx" />
        </view>
        <view class="profile-summary__content">
          <text class="profile-summary__label">我的资料</text>
          <text class="profile-summary__name">{{ profile.nickname }}</text>
        </view>
        <wd-icon name="arrow-right" size="34rpx" color="#74847d" />
      </button>

      <view class="profile-section">
        <text class="profile-section__title">我的家庭</text>
        <HomeSummaryCard
          :name="household.name"
          :avatar-src="household.avatar.kind === 'builtin' ? householdAvatarSource(household.avatar.id) : householdAvatarUrl"
          :avatar-loading="householdAvatarLoading"
          :member-count="household.memberCount"
          @press="openHouseholdEditor"
        />
      </view>

      <view class="profile-section">
        <text class="profile-section__title">家庭成员</text>
        <MemberProfileCard
          v-for="member in household.members"
          :key="`${member.nickname}-${member.isSelf}`"
          :nickname="member.nickname"
          :avatar-src="member.avatar.kind === 'builtin' ? profileAvatarSource(member.avatar.id) : memberAvatarUrls[member.avatar.resourceId] || ''"
          :avatar-loading="isMemberAvatarLoading(member)"
          :is-self="member.isSelf"
          :editable="member.isSelf"
          @press="openProfileEditor"
        />
        <button v-if="household.currentMemberRole === 'owner'" class="profile-action" @click="openMemberManagement">
          <view class="profile-action__icon"><wd-icon name="user-add" size="36rpx" color="#267a5a" /></view>
          <view class="profile-action__content">
            <text class="profile-action__title">{{ household.memberCount === 1 ? '邀请成员' : '管理成员' }}</text>
            <text class="profile-action__copy">{{ household.memberCount === 1 ? '邀请另一位成员一起使用这个家' : '查看成员和管理邀请' }}</text>
          </view>
          <wd-icon name="arrow-right" size="32rpx" color="#74847d" />
        </button>
      </view>
    </view>

    <view v-else class="profile-error">
      <text class="profile-error__copy">暂时无法读取资料，请回到首页后重试。</text>
    </view>
    <!-- 我的页完成家庭确认后也可直接新增三类内容。 -->
    <GlobalQuickAdd :visible="Boolean(household && profile) && !isLoading" with-tab-bar />
    <AppTabBar active="mine" />
  </view>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import AppTabBar from '../../components/AppTabBar.vue'
import GlobalQuickAdd from '../../components/GlobalQuickAdd.vue'
import HomeSummaryCard from '../../components/home/HomeSummaryCard.vue'
import { getAvatarTemporaryUrl } from '../../services/avatar-media'
import { useHouseholdStore } from '../../store/modules/household'
import type { CustomAvatar, HouseholdMemberDisplay } from '../../types/household'
import { householdAvatarSource, profileAvatarSource } from '../index/home-view'
import MemberProfileCard from '../index/components/MemberProfileCard.vue'

const householdStore = useHouseholdStore()
const { household, profile, phase } = storeToRefs(householdStore)
const isLoading = computed(() => phase.value === 'checking')
// 自定义头像地址异步返回：初始保持空值，不用内置头像冒充占位。
const householdAvatarUrl = shallowRef('')
const profileAvatarUrl = shallowRef('')
const memberAvatarUrls = shallowRef<Record<string, string>>({})
const householdAvatarLoading = shallowRef(false)
const profileAvatarLoading = shallowRef(false)
const memberAvatarLoading = shallowRef<Record<string, boolean>>({})

/** 成员自定义头像按资源编号独立记录加载状态，内置头像不进入加载态。 */
function isMemberAvatarLoading(member: HouseholdMemberDisplay): boolean {
  return member.avatar.kind === 'custom' && Boolean(memberAvatarLoading.value[member.avatar.resourceId])
}

/** 我的页只读取已确认资料，头像地址在读取成功后按成员范围短暂获取。 */
async function loadProfile(): Promise<void> {
  const result = await householdStore.loadCurrent()
  if (result?.status !== 'HOME') return

  // 家庭资料先到、头像地址后到；同步建立占位状态，避免渲染出一帧默认头像。
  householdAvatarUrl.value = ''
  profileAvatarUrl.value = ''
  memberAvatarUrls.value = {}
  householdAvatarLoading.value = result.household.avatar.kind === 'custom'
  profileAvatarLoading.value = result.profile.avatar.kind === 'custom'
  const customMembers = result.household.members.filter((member): member is typeof member & { avatar: CustomAvatar } => member.avatar.kind === 'custom')
  memberAvatarLoading.value = Object.fromEntries(customMembers.map((member) => [member.avatar.resourceId, true]))

  const requests: Array<Promise<void>> = []
  if (result.household.avatar.kind === 'custom') {
    requests.push(getAvatarTemporaryUrl(result.household.avatar.resourceId)
      .then((url) => { householdAvatarUrl.value = url })
      .catch(() => { householdAvatarUrl.value = '' })
      .finally(() => { householdAvatarLoading.value = false }))
  }
  if (result.profile.avatar.kind === 'custom') {
    requests.push(getAvatarTemporaryUrl(result.profile.avatar.resourceId)
      .then((url) => { profileAvatarUrl.value = url })
      .catch(() => { profileAvatarUrl.value = '' })
      .finally(() => { profileAvatarLoading.value = false }))
  }
  for (const member of customMembers) {
    const resourceId = member.avatar.resourceId
    requests.push(getAvatarTemporaryUrl(resourceId)
      .then((url) => { memberAvatarUrls.value = { ...memberAvatarUrls.value, [resourceId]: url } })
      .catch(() => { memberAvatarUrls.value = { ...memberAvatarUrls.value, [resourceId]: '' } })
      .finally(() => { memberAvatarLoading.value = { ...memberAvatarLoading.value, [resourceId]: false } }))
  }
  await Promise.all(requests)
}

function openProfileEditor(): void { uni.navigateTo({ url: '/subpackages/household/edit-profile/index' }) }
function openHouseholdEditor(): void { uni.navigateTo({ url: '/subpackages/household/edit-household/index' }) }
function openMemberManagement(): void { uni.navigateTo({ url: '/subpackages/household/member-management/index' }) }

onShow(() => { void loadProfile() })
</script>

<style lang="scss" scoped>
.profile-page {
  /* 我的页承载个人、家庭和成员设置，首页不再出现管理入口。 */
  min-height: 100vh;
  padding: 48rpx 32rpx 32rpx;
  box-sizing: border-box;
  background: $brand-color-background;
}
.page-state {
  /* 加载 / 错误 / 空 通用态：与 pages/index/index.vue 的 .page-state 保持同一视觉语言
   （方案 2 全站 loading 统一为"转圈 + 文案"） */
  display: flex;
  min-height: 70vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  &__title {
    margin-top: 24rpx;
    color: $brand-color-text;
    font-size: 32rpx;
    font-weight: 700;
  }
}
.profile-content {
  display: flex;
  flex-direction: column;
  padding-bottom: 32rpx;
}
.profile-heading {
  display: flex;
  flex-direction: column;
  margin-bottom: 34rpx;
  &__eyebrow {
    color: $brand-color-primary;
    font-size: 23rpx;
    font-weight: 700;
    letter-spacing: 4rpx;
  }
  &__title {
    margin-top: 14rpx;
    color: $brand-color-text;
    font-size: 46rpx;
    font-weight: 700;
    line-height: 1.28;
  }
}
.profile-summary {
  display: flex;
  width: 100%;
  align-items: center;
  padding: 30rpx;
  border: 0;
  border-radius: $brand-radius-card;
  background: $brand-color-surface;
  box-shadow: 0 14rpx 34rpx rgba(41, 68, 58, .07);
  text-align: left;
  &::after {
    border: 0;
  }
  &__avatar {
    width: 116rpx;
    height: 116rpx;
    flex-shrink: 0;
  }
  &__avatar-placeholder {
    display: flex;
    width: 116rpx;
    height: 116rpx;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #effbf5;
  }
  &__content {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    margin-left: 24rpx;
  }
  &__label {
    color: $brand-color-text-secondary;
    font-size: 23rpx;
  }
  &__name {
    margin-top: 10rpx;
    color: $brand-color-text;
    font-size: 36rpx;
    font-weight: 700;
  }
}
.profile-section {
  margin-top: 46rpx;
  &__title {
    display: block;
    margin-bottom: 20rpx;
    color: $brand-color-text;
    font-size: 30rpx;
    font-weight: 700;
  }
}
.profile-action {
  display: flex;
  width: 100%;
  align-items: center;
  margin-top: 18rpx;
  padding: 26rpx 28rpx;
  border: 2rpx solid #d8eee2;
  border-radius: $brand-radius-card;
  background: #effbf5;
  text-align: left;
  &::after {
    border: 0;
  }
  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 62rpx;
    height: 62rpx;
    border-radius: 50%;
    background: #fff;
  }
  &__content {
    display: flex;
    flex: 1;
    flex-direction: column;
    margin-left: 18rpx;
  }
  &__title {
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 700;
  }
  &__copy {
    margin-top: 8rpx;
    color: $brand-color-text-secondary;
    font-size: 23rpx;
  }
}
.profile-error {
  display: flex;
  min-height: 70vh;
  align-items: center;
  justify-content: center;
  padding: 32rpx;
  text-align: center;
  &__copy {
    color: $brand-color-text-secondary;
    font-size: 27rpx;
  }
}
</style>
