<template>
  <view class="profile-page">
    <view v-if="isLoading" class="profile-loading">
      <wd-skeleton :row-col="[[{ type: 'circle', size: '72px', marginRight: '16px' }, { width: '62%', height: '72px' }]]" animation="gradient" />
    </view>

    <view v-else-if="household && profile" class="profile-content">
      <view class="profile-heading">
        <text class="profile-heading__eyebrow">我的空间</text>
        <text class="profile-heading__title">设置和陪伴都在这里</text>
      </view>

      <button class="profile-summary" @click="openProfileEditor">
        <wd-avatar :src="profile.avatar.kind === 'builtin' ? profileAvatarSource(profile.avatar.id) : profileAvatarUrl" size="116rpx" />
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
          :avatar-src="member.avatar.kind === 'builtin' ? profileAvatarSource(member.avatar.id) : memberAvatarUrls[member.avatar.resourceId] || profileAvatarSource('person-neutral')"
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
    <AppTabBar active="mine" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import AppTabBar from '../../components/AppTabBar.vue'
import HomeSummaryCard from '../../components/home/HomeSummaryCard.vue'
import { getAvatarTemporaryUrl } from '../../services/avatar-media'
import { useHouseholdStore } from '../../store/modules/household'
import type { CustomAvatar } from '../../types/household'
import { householdAvatarSource, profileAvatarSource } from '../index/home-view'
import MemberProfileCard from '../index/components/MemberProfileCard.vue'

const householdStore = useHouseholdStore()
const { household, profile, phase } = storeToRefs(householdStore)
const isLoading = computed(() => phase.value === 'checking')
const householdAvatarUrl = ref('/static/avatars/households/household-01.png')
const profileAvatarUrl = ref('/static/avatars/people/person-01.png')
const memberAvatarUrls = ref<Record<string, string>>({})

/** 我的页只读取已确认资料，头像地址在读取成功后按成员范围短暂获取。 */
async function loadProfile(): Promise<void> {
  const result = await householdStore.loadCurrent()
  if (result?.status !== 'HOME') return
  if (result.household.avatar.kind === 'custom') householdAvatarUrl.value = await getAvatarTemporaryUrl(result.household.avatar.resourceId).catch(() => householdAvatarUrl.value)
  if (result.profile.avatar.kind === 'custom') profileAvatarUrl.value = await getAvatarTemporaryUrl(result.profile.avatar.resourceId).catch(() => profileAvatarUrl.value)
  const customMembers = result.household.members.filter((member): member is typeof member & { avatar: CustomAvatar } => member.avatar.kind === 'custom')
  const urls = await Promise.all(customMembers.map(async (member) => [member.avatar.resourceId, await getAvatarTemporaryUrl(member.avatar.resourceId).catch(() => '')] as const))
  memberAvatarUrls.value = Object.fromEntries(urls.filter(([, url]) => Boolean(url)))
}

function openProfileEditor(): void { uni.navigateTo({ url: '/subpackages/household/edit-profile/index' }) }
function openHouseholdEditor(): void { uni.navigateTo({ url: '/subpackages/household/edit-household/index' }) }
function openMemberManagement(): void { uni.navigateTo({ url: '/subpackages/household/member-management/index' }) }

onShow(() => { void loadProfile() })
</script>

<style lang="scss" scoped>
/* 我的页承载个人、家庭和成员设置，首页不再出现管理入口。 */
.profile-page { min-height: 100vh; padding: 48rpx 32rpx 32rpx; box-sizing: border-box; background: $brand-color-background; }
.profile-loading { padding-top: 84rpx; }
.profile-content { display: flex; flex-direction: column; padding-bottom: 32rpx; }
.profile-heading { display: flex; flex-direction: column; margin-bottom: 34rpx; }
.profile-heading__eyebrow { color: $brand-color-primary; font-size: 23rpx; font-weight: 700; letter-spacing: 4rpx; }
.profile-heading__title { margin-top: 14rpx; color: $brand-color-text; font-size: 46rpx; font-weight: 700; line-height: 1.28; }
.profile-summary { display: flex; width: 100%; align-items: center; padding: 30rpx; border: 0; border-radius: $brand-radius-card; background: $brand-color-surface; box-shadow: 0 14rpx 34rpx rgba(41, 68, 58, .07); text-align: left; }
.profile-summary::after { border: 0; }
.profile-summary__content { display: flex; min-width: 0; flex: 1; flex-direction: column; margin-left: 24rpx; }
.profile-summary__label { color: $brand-color-text-secondary; font-size: 23rpx; }
.profile-summary__name { margin-top: 10rpx; color: $brand-color-text; font-size: 36rpx; font-weight: 700; }
.profile-section { margin-top: 46rpx; }
.profile-section__title { display: block; margin-bottom: 20rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 700; }
.profile-action { display: flex; width: 100%; align-items: center; margin-top: 18rpx; padding: 26rpx 28rpx; border: 2rpx solid #d8eee2; border-radius: $brand-radius-card; background: #effbf5; text-align: left; }
.profile-action::after { border: 0; }
.profile-action__icon { display: flex; align-items: center; justify-content: center; width: 62rpx; height: 62rpx; border-radius: 50%; background: #fff; }
.profile-action__content { display: flex; flex: 1; flex-direction: column; margin-left: 18rpx; }
.profile-action__title { color: $brand-color-text; font-size: 28rpx; font-weight: 700; }
.profile-action__copy { margin-top: 8rpx; color: $brand-color-text-secondary; font-size: 23rpx; }
.profile-error { display: flex; min-height: 70vh; align-items: center; justify-content: center; padding: 32rpx; text-align: center; }
.profile-error__copy { color: $brand-color-text-secondary; font-size: 27rpx; }
</style>
