<template>
  <!-- 只展示有限邀请原因，不泄露邀请原文或家庭资料。 -->
  <view class="invite-status">
    <view class="invite-status__dot" />
    <view class="invite-status__content">
      <image class="invite-status__logo" src="/static/brand/logo.png" mode="aspectFit" aria-label="睦录 Logo" />
      <view class="invite-status__card" data-testid="invite-status-card">
        <text class="invite-status__eyebrow">睦录</text>
        <text class="invite-status__title" data-testid="invite-status-title">{{ title }}</text>
        <text class="invite-status__description" data-testid="invite-status-description">{{ message }}</text>
        <view class="invite-status__tip">
          <view class="invite-status__tip-mark">i</view>
          <text class="invite-status__tip-text">请联系对方重新发一份邀请。</text>
        </view>
      </view>
    </view>
    <!-- 邀请无效页只在登录且仍有已确认家庭时提供快速新增。 -->
    <GlobalQuickAdd :visible="auth.hasCompletedLogin && Boolean(household) && !checkingHousehold" />
  </view>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'
import { onShow } from '@dcloudio/uni-app'
import GlobalQuickAdd from '../../../components/GlobalQuickAdd.vue'
import { useAuthStore } from '../../../store/modules/auth'
import { useHouseholdStore } from '../../../store/modules/household'

const auth = useAuthStore()
const householdStore = useHouseholdStore()
const { household } = storeToRefs(householdStore)
const checkingHousehold = shallowRef(true)

// 页面文案完全由本地有限提示编号生成。
const content = computed(() => {
  const messages = {
    invite_invalid: { title: '这份邀请无效', message: '请确认你打开的是对方刚刚发来的邀请。' },
    invite_expired: { title: '这份邀请已失效', message: '它可能已经超过了有效时间。' },
    invite_used: { title: '这份邀请已被使用', message: '每份邀请只能用于一次加入确认。' },
    home_full: { title: '这个家已经满员', message: '一个家目前只能由两位成员共同使用。' },
  }

  switch (auth.notice) {
    case 'invite_invalid':
    case 'invite_expired':
    case 'invite_used':
    case 'home_full':
      return messages[auth.notice]
    default:
      return { title: '邀请暂时无法使用', message: '请让对方重新发一份邀请。' }
  }
})

const title = computed(() => content.value.title)
const message = computed(() => content.value.message)

/** 未登录用户不额外请求；已登录时只确认是否仍有家庭，不改变邀请错误内容。 */
async function loadHousehold(): Promise<void> {
  checkingHousehold.value = true
  try {
    if (!auth.hasCompletedLogin) return
    await householdStore.loadCurrent({ preserveExisting: true })
  } finally {
    checkingHousehold.value = false
  }
}

onShow(() => { void loadHousehold() })
</script>

<style lang="scss" scoped>
.invite-status {
  /* 邀请异常页使用单卡片布局，下一步始终是联系对方重新邀请。 */
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 64rpx 48rpx;
  box-sizing: border-box;
  background: $brand-color-background;
  &__content {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 620rpx;
  }
  &__logo {
    display: block;
    width: 132rpx;
    height: 132rpx;
    margin: 0 auto 40rpx;
  }
  &__card {
    padding: 48rpx 40rpx;
    border: 2rpx solid $brand-color-border;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
  }
  &__eyebrow {
    display: block;
    color: $brand-color-primary;
    font-size: 24rpx;
    font-weight: 700;
    letter-spacing: 5rpx;
  }
  &__title {
    display: block;
    margin-top: 22rpx;
    color: $brand-color-text;
    font-size: 42rpx;
    font-weight: 700;
    line-height: 1.35;
  }
  &__description {
    display: block;
    margin-top: 20rpx;
    color: $brand-color-text-secondary;
    font-size: 28rpx;
    line-height: 1.7;
  }
  &__tip {
    display: flex;
    align-items: flex-start;
    margin-top: 38rpx;
    padding-top: 28rpx;
    border-top: 2rpx solid $brand-color-border;
  }
  &__tip-mark {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 32rpx;
    height: 32rpx;
    margin: 4rpx 14rpx 0 0;
    border-radius: 50%;
    background: $brand-color-accent;
    color: #fff;
    font-size: 21rpx;
    font-weight: 700;
    line-height: 1;
  }
  &__tip-text {
    color: $brand-color-text;
    font-size: 25rpx;
    line-height: 1.65;
  }
  &__dot {
    position: absolute;
    top: 96rpx;
    right: -44rpx;
    width: 172rpx;
    height: 172rpx;
    border-radius: 50%;
    background: rgba($brand-color-primary, .13);
  }
}
</style>
