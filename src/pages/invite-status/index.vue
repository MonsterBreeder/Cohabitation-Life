<template>
  <!-- 只展示有限邀请原因，不泄露邀请原文或家庭资料。 -->
  <view class="invite-status">
    <view class="invite-status__dot" />
    <view class="invite-status__content">
      <image class="invite-status__logo" src="/static/brand/logo.png" mode="aspectFit" aria-label="家里有事 Logo" />
      <view class="invite-status__card" data-testid="invite-status-card">
        <text class="invite-status__eyebrow">家里有事</text>
        <text class="invite-status__title" data-testid="invite-status-title">{{ title }}</text>
        <text class="invite-status__description" data-testid="invite-status-description">{{ message }}</text>
        <view class="invite-status__tip">
          <view class="invite-status__tip-mark">i</view>
          <text class="invite-status__tip-text">请联系对方重新发一份邀请。</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../../store/modules/auth'

const auth = useAuthStore()

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
</script>

<style lang="scss" scoped>
/* 邀请异常页使用单卡片布局，下一步始终是联系对方重新邀请。 */
.invite-status {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 64rpx 48rpx;
  box-sizing: border-box;
  background: $brand-color-background;
}
.invite-status__content { position: relative; z-index: 1; width: 100%; max-width: 620rpx; }
.invite-status__logo { display: block; width: 132rpx; height: 132rpx; margin: 0 auto 40rpx; }
.invite-status__card { padding: 48rpx 40rpx; border: 2rpx solid $brand-color-border; border-radius: $brand-radius-card; background: $brand-color-surface; }
.invite-status__eyebrow { display: block; color: $brand-color-primary; font-size: 24rpx; font-weight: 700; letter-spacing: 5rpx; }
.invite-status__title { display: block; margin-top: 22rpx; color: $brand-color-text; font-size: 42rpx; font-weight: 700; line-height: 1.35; }
.invite-status__description { display: block; margin-top: 20rpx; color: $brand-color-text-secondary; font-size: 28rpx; line-height: 1.7; }
.invite-status__tip { display: flex; align-items: flex-start; margin-top: 38rpx; padding-top: 28rpx; border-top: 2rpx solid $brand-color-border; }
.invite-status__tip-mark { display: flex; flex: none; align-items: center; justify-content: center; width: 32rpx; height: 32rpx; margin: 4rpx 14rpx 0 0; border-radius: 50%; background: $brand-color-accent; color: #fff; font-size: 21rpx; font-weight: 700; line-height: 1; }
.invite-status__tip-text { color: $brand-color-text; font-size: 25rpx; line-height: 1.65; }
.invite-status__dot { position: absolute; top: 96rpx; right: -44rpx; width: 172rpx; height: 172rpx; border-radius: 50%; background: rgba($brand-color-primary, .13); }
</style>
