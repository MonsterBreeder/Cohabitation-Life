<template>
  <!-- 登录页品牌区只负责展示，不读取或修改登录状态。 -->
  <view class="brand-hero" :class="{ 'brand-hero--compact': compact }">
    <view class="brand-hero__logo-wrap">
      <view class="brand-hero__accent brand-hero__accent--mint" />
      <image
        class="brand-hero__logo"
        src="/static/brand/logo.png"
        mode="aspectFit"
        data-testid="login-logo"
        aria-label="睦录 Logo"
      />
      <view class="brand-hero__accent brand-hero__accent--coral" />
    </view>
    <text class="brand-hero__name" data-testid="login-product-name">睦录</text>
    <text v-if="!compact" class="brand-hero__title" data-testid="login-title">两个人的小事，一起记得</text>
    <text v-if="!compact" class="brand-hero__subtitle" data-testid="login-subtitle">一起记住、认领和完成家里的小事</text>
  </view>
</template>

<script setup lang="ts">
// compact 用于恢复登录时缩小品牌区，避免展示完整登录操作。
withDefaults(defineProps<{ compact?: boolean }>(), {
  compact: false,
})
</script>

<style lang="scss" scoped>
.brand-hero {
  /* 品牌主体：Logo、产品名和欢迎文案。 */
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  &__logo-wrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 188rpx;
    height: 188rpx;
    margin-bottom: 24rpx;
  }
  &__logo {
    position: relative;
    z-index: 1;
    width: 152rpx;
    height: 152rpx;
  }
  &__accent {
    position: absolute;
    width: 24rpx;
    height: 24rpx;
    border-radius: 50%;
  }
  &__accent--mint {
    top: 22rpx;
    left: 10rpx;
    background: $brand-color-primary;
  }
  &__accent--coral {
    right: 14rpx;
    bottom: 18rpx;
    width: 18rpx;
    height: 18rpx;
    background: $brand-color-accent;
  }
  &__name {
    color: $brand-color-primary;
    font-size: 25rpx;
    font-weight: 700;
    letter-spacing: 7rpx;
  }
  &__title {
    margin-top: 28rpx;
    color: $brand-color-text;
    font-size: 48rpx;
    font-weight: 700;
    line-height: 1.35;
  }
  &__subtitle {
    margin-top: 18rpx;
    color: $brand-color-text-secondary;
    font-size: 28rpx;
    line-height: 1.7;
  }
  &--compact &__logo-wrap {
    width: 152rpx;
    height: 152rpx;
    margin-bottom: 16rpx;
  }
  &--compact &__logo {
    width: 124rpx;
    height: 124rpx;
  }
  &--compact &__accent {
    transform: scale(.8);
  }
}
</style>
