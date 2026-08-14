<template>
  <view class="page">
    <!-- 骨架保留两张资料卡的真实结构，但不展示伪造名称或头像。 -->
    <view v-if="isLoading" class="home-skeleton" data-testid="home-loading">
      <wd-skeleton :row-col="householdSkeleton" animation="gradient" />
      <wd-skeleton :row-col="memberSkeleton" animation="gradient" />
    </view>

    <view v-else-if="loadError" class="page-state" data-testid="home-error">
      <wd-icon name="warning" size="76rpx" color="#ff8f79" />
      <text class="page-state__title">家庭资料暂时走丢了</text>
      <text class="page-state__copy">{{ loadError }}</text>
      <wd-button type="primary" :loading="isLoading" @click="loadHome">重新加载</wd-button>
    </view>

    <view v-else-if="household && profile" class="home-content" :data-testid="household.memberCount === 1 ? 'home-single-member' : 'home-two-members'">
      <view class="hero">
        <text class="hero__eyebrow">家里有事</text>
        <text class="hero__title">欢迎回家</text>
        <text class="hero__copy">家不在大小，有人惦记就好。</text>
      </view>

      <HomeSummaryCard
        :name="household.name"
        :avatar-src="household.avatar.kind === 'builtin' ? householdAvatarSource(household.avatar.id) : householdAvatarUrl"
        :member-count="household.memberCount"
      />
      <view class="home-empty">
        <wd-icon name="calendar" size="68rpx" color="#43c89a" />
        <text class="home-empty__title">今天还没有家里事项</text>
        <text class="home-empty__copy">等邀请完成后，我们就从第一件小事开始。</text>
      </view>
    </view>
    <AppTabBar active="home" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { onShow } from '@dcloudio/uni-app'
import HomeSummaryCard from '../../components/home/HomeSummaryCard.vue'
import AppTabBar from '../../components/AppTabBar.vue'
import { useAuthStore } from '../../store/modules/auth'
import { useHouseholdStore } from '../../store/modules/household'
import { householdAvatarSource, resolveHomeLoadDestination } from './home-view'
import { getAvatarTemporaryUrl } from '../../services/avatar-media'

const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const { hasCompletedLogin, errorMessage: authError } = storeToRefs(authStore)
const { phase, household, profile, errorMessage: householdError } = storeToRefs(householdStore)

// 两组骨架分别对应家庭卡和成员卡，重试时复用同一布局。
const householdSkeleton = [[{ type: 'circle', size: '72px', marginRight: '16px' }, { width: '65%', height: '72px' }]]
const memberSkeleton = [[{ type: 'circle', size: '52px', marginRight: '14px' }, { width: '58%', height: '52px' }]]
const isLoading = computed(() => phase.value === 'checking')
const loadError = computed(() => authError.value || householdError.value)
const householdAvatarUrl = ref('/static/avatars/households/household-01.png')

/** 使用重新进入页面清空错误页面历史，避免返回到失效身份状态。 */
function relaunch(url: string): void {
  uni.reLaunch({ url })
}

/** 登录确认和家庭查询串行执行，旧资料在查询开始时立即清空。 */
async function loadHome(): Promise<void> {
  if (resolveHomeLoadDestination(hasCompletedLogin.value) === 'login') {
    relaunch('/pages/login/index')
    return
  }

  await authStore.restore()
  const route = authStore.consumeNavigationIntent()
  if (authError.value) return
  if (route && route.url !== '/pages/index/index') {
    relaunch(route.url)
    return
  }

  const result = await householdStore.loadCurrent()
  if (result?.status === 'HOME') {
    if (result.household.avatar.kind === 'custom') householdAvatarUrl.value = await getAvatarTemporaryUrl(result.household.avatar.resourceId).catch(() => householdAvatarUrl.value)
  }
  const destination = resolveHomeLoadDestination(hasCompletedLogin.value, result?.status)
  if (destination === 'login') relaunch('/pages/login/index')
  if (destination === 'create-home') relaunch('/subpackages/household/create-home/index')
}


onShow(() => {
  void loadHome()
})
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding: 48rpx 32rpx 80rpx; box-sizing: border-box; background: $brand-color-background; }
.home-skeleton { display: flex; flex-direction: column; gap: 52rpx; padding-top: 180rpx; }
.page-state { display: flex; min-height: calc(100vh - 128rpx); flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.page-state__title { margin-top: 28rpx; color: $brand-color-text; font-size: 34rpx; font-weight: 700; }
.page-state__copy { max-width: 520rpx; margin: 16rpx 0 36rpx; color: $brand-color-text-secondary; font-size: 26rpx; line-height: 1.65; }
.home-content { display: flex; flex-direction: column; }
.hero { display: flex; flex-direction: column; margin-bottom: 42rpx; }
.hero__eyebrow { color: $brand-color-primary; font-size: 23rpx; font-weight: 600; letter-spacing: 4rpx; }
.hero__title { margin-top: 14rpx; color: $brand-color-text; font-size: 52rpx; font-weight: 700; line-height: 1.3; }
.hero__copy { margin-top: 12rpx; color: $brand-color-text-secondary; font-size: 27rpx; line-height: 1.6; }
.home-empty { display: flex; flex-direction: column; align-items: center; margin-top: 68rpx; padding: 54rpx 32rpx; border: 2rpx dashed $brand-color-border; border-radius: $brand-radius-card; background: rgba($brand-color-surface, .7); text-align: center; }
.home-empty__title { margin-top: 20rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 700; }
.home-empty__copy { margin-top: 12rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.6; }
</style>
