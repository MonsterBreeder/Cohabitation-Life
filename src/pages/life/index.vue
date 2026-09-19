<template>
  <view class="life-page">
    <view v-if="checkingHome" class="life-page__state">
      <wd-loading color="#267A5A" size="42rpx" />
      <text>正在加载生活</text>
    </view>
    <view v-else-if="pageError" class="life-page__state">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text>{{ pageError }}</text>
      <wd-button size="small" variant="plain" @click="loadPage">重新加载</wd-button>
    </view>

    <template v-else>
      <view class="life-page__hero">
        <view class="life-page__hero-copy">
          <text class="life-page__eyebrow">两个人的生活工具箱</text>
          <text class="life-page__title">把喜欢的日子，一起记下来</text>
          <text class="life-page__copy">这里没有陌生人动态，只有属于这个家的共同记录。</text>
        </view>
        <!-- 山径装饰延续足迹页的路线语言，只承担氛围，不作为操作入口。 -->
        <view class="life-page__trail" aria-hidden="true">
          <view class="life-page__trail-dot" />
          <view class="life-page__trail-line" />
          <view class="life-page__trail-dot life-page__trail-dot--end" />
        </view>
      </view>

      <view class="life-page__section-heading">
        <text class="life-page__section-title">共同生活应用</text>
        <text class="life-page__section-note">第一站，从徒步开始</text>
      </view>

      <view class="life-page__grid">
        <view
          v-for="app in LIFE_APPS"
          :key="app.id"
          class="life-page__card"
          :class="[`life-page__card--${app.tone}`, { 'life-page__card--disabled': !app.enabled }]"
          :aria-disabled="!app.enabled"
          @click="openApp(app.id)"
        >
          <view class="life-page__icon"><wd-icon :name="app.icon" size="50rpx" color="#267A5A" /></view>
          <view class="life-page__card-heading">
            <text class="life-page__card-title">{{ app.name }}</text>
            <text v-if="!app.enabled" class="life-page__status">即将开放</text>
          </view>
          <text class="life-page__card-copy">{{ app.description }}</text>
          <view v-if="app.enabled" class="life-page__card-action">
            <text>去记录</text>
            <wd-icon name="arrow-right" size="30rpx" color="#267A5A" />
          </view>
        </view>
      </view>
    </template>

    <AppTabBar active="life" />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppTabBar from '../../components/AppTabBar.vue'
import { useAuthStore } from '../../store/modules/auth'
import { useHouseholdStore } from '../../store/modules/household'
import { LIFE_APPS, lifeAppDestination, type LifeAppCard } from './life-view'

const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const checkingHome = ref(true)
const pageError = ref('')

/** 生活应用只属于当前家庭；主入口恢复时重新确认登录与家庭状态。 */
async function loadPage(): Promise<void> {
  checkingHome.value = true
  pageError.value = ''
  try {
    if (!authStore.hasCompletedLogin) {
      uni.reLaunch({ url: '/pages/login/index' })
      return
    }
    await authStore.restore()
    const result = await householdStore.loadCurrent({ preserveExisting: true })
    if (result?.status === 'NO_HOME') {
      uni.reLaunch({ url: '/subpackages/household/create-home/index' })
      return
    }
    if (result?.status !== 'HOME') pageError.value = '暂时无法确认家庭信息，请重试'
  } finally {
    checkingHome.value = false
  }
}

/** 未开放卡片不做空跳转；可用应用才进入对应业务分包。 */
function openApp(id: LifeAppCard['id']): void {
  const url = lifeAppDestination(id)
  if (url) uni.navigateTo({ url })
}
onShow(() => void loadPage())
</script>

<style lang="scss" scoped>
.life-page {
  min-height: 100vh;
  padding: 28rpx 28rpx 190rpx;
  box-sizing: border-box;
  background: $brand-color-background;

  &__state {
    display: flex;
    min-height: 70vh;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    text-align: center;
  }

  // 顶部像一页共同生活手账，路线元素与足迹模块建立视觉联系。
  &__hero {
    position: relative;
    min-height: 250rpx;
    overflow: hidden;
    padding: 38rpx 34rpx;
    border: 1rpx solid rgba(38, 122, 90, 0.12);
    border-radius: 34rpx;
    background: #effbf5;
    box-shadow: 0 10rpx 30rpx rgba(38, 90, 70, 0.06);
  }
  &__hero-copy {
    position: relative;
    z-index: 1;
    display: flex;
    max-width: 520rpx;
    flex-direction: column;
  }
  &__eyebrow {
    color: $brand-color-action;
    font-size: 22rpx;
    font-weight: 700;
    letter-spacing: 3rpx;
  }
  &__title {
    margin-top: 18rpx;
    color: $brand-color-text;
    font-size: 42rpx;
    font-weight: 800;
    line-height: 1.28;
  }
  &__copy {
    margin-top: 18rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    line-height: 1.65;
  }
  &__trail {
    position: absolute;
    right: -22rpx;
    bottom: 30rpx;
    display: flex;
    width: 250rpx;
    align-items: center;
    opacity: 0.28;
    transform: rotate(-13deg);
  }
  &__trail-line {
    flex: 1;
    height: 0;
    border-top: 3rpx dashed $brand-color-action;
  }
  &__trail-dot {
    width: 15rpx;
    height: 15rpx;
    border: 4rpx solid $brand-color-action;
    border-radius: 50%;
    background: #effbf5;
  }
  &__trail-dot--end {
    width: 24rpx;
    height: 24rpx;
    background: $brand-color-primary;
  }

  // 卡片先表达是否可用，再表达名称，禁用态不只依赖颜色。
  &__section-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    margin: 42rpx 4rpx 20rpx;
  }
  &__section-title {
    color: $brand-color-text;
    font-size: 32rpx;
    font-weight: 800;
  }
  &__section-note {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
  }
  &__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18rpx;
  }
  &__card {
    display: flex;
    min-height: 250rpx;
    flex-direction: column;
    padding: 26rpx;
    border: 1rpx solid rgba(38, 122, 90, 0.1);
    border-radius: 28rpx;
    background: $brand-color-surface;
    box-shadow: 0 8rpx 24rpx rgba(38, 90, 70, 0.05);
    transition:
      transform 0.12s ease,
      opacity 0.15s ease;
  }
  &__card:active {
    transform: scale(0.98);
  }
  &__card--disabled {
    opacity: 0.72;
    box-shadow: none;
  }
  &__card--disabled:active {
    transform: none;
  }
  &__card--green {
    background: #f1fbf6;
  }
  &__card--peach {
    background: #fff5f1;
  }
  &__card--sky {
    background: #f3f8fa;
  }
  &__card--lilac {
    background: #f8f5fa;
  }
  &__icon {
    display: flex;
    width: 82rpx;
    height: 82rpx;
    align-items: center;
    justify-content: center;
    border-radius: 24rpx;
    background: rgba(255, 255, 255, 0.8);
  }
  &__card-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8rpx;
    margin-top: 22rpx;
  }
  &__card-title {
    color: $brand-color-text;
    font-size: 29rpx;
    font-weight: 800;
  }
  &__status {
    flex-shrink: 0;
    padding: 5rpx 10rpx;
    border-radius: 999rpx;
    background: rgba(116, 132, 125, 0.12);
    color: $brand-color-text-secondary;
    font-size: 18rpx;
  }
  &__card-copy {
    margin-top: 12rpx;
    color: $brand-color-text-secondary;
    font-size: 22rpx;
    line-height: 1.5;
  }
  &__card-action {
    display: flex;
    min-height: 54rpx;
    align-items: center;
    gap: 4rpx;
    margin-top: auto;
    padding-top: 18rpx;
    color: $brand-color-action;
    font-size: 23rpx;
    font-weight: 700;
  }
}
</style>
