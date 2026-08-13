<template>
  <!-- 本页只表示登录分流成功，不提前实现创建家庭表单。 -->
  <view class="entry-shell">
    <view class="entry-shell__card" data-testid="create-home-entry">
      <text class="entry-shell__eyebrow">已完成身份确认</text>
      <text class="entry-shell__title">创建我们的家</text>
      <text class="entry-shell__description">接下来，你可以给两个人共同使用的小家取一个名字。</text>
      <text class="entry-shell__hint">创建功能正在下一步准备中。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
// 创建家庭将在独立 PRD 中实现，本模块不需要页面状态。
</script>

<style scoped>
/* 登录后目的页使用统一的轻量说明卡片。 */
.entry-shell { display: flex; align-items: center; min-height: 100vh; padding: 48rpx; box-sizing: border-box; background: #fff9f2; }
.entry-shell__card { width: 100%; padding: 56rpx 40rpx; border: 2rpx solid #d8eee2; border-radius: 28rpx; background: #fff; box-sizing: border-box; }
.entry-shell__eyebrow { display: block; color: #43c89a; font-size: 24rpx; font-weight: 700; letter-spacing: 4rpx; }
.entry-shell__title { display: block; margin-top: 24rpx; color: #29443a; font-size: 44rpx; font-weight: 700; }
.entry-shell__description { display: block; margin-top: 22rpx; color: #52665d; font-size: 29rpx; line-height: 1.7; }
.entry-shell__hint { display: block; margin-top: 40rpx; color: #74847d; font-size: 25rpx; }
</style>
