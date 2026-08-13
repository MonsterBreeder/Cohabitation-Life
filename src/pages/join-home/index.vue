<template>
  <!-- 本页只确认邀请仍被保留，不显示邀请原文，也不执行加入。 -->
  <view class="entry-shell">
    <view class="entry-shell__card" data-testid="join-home-entry">
      <text class="entry-shell__eyebrow">邀请已确认</text>
      <text class="entry-shell__title">加入这个家</text>
      <text v-if="hasPendingInvite" class="entry-shell__description">对方邀请你一起记住和处理家里的小事。确认加入功能正在下一步准备中。</text>
      <text v-else class="entry-shell__description">邀请信息暂时无法继续使用，请让对方重新发一份邀请。</text>
      <text class="entry-shell__hint">这里不会显示邀请内容，也不会提前加入家庭。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '../../store/modules/auth'

const auth = useAuthStore()
// 后续加入模块将使用该邀请再次向云端核验。
const hasPendingInvite = computed(() => Boolean(auth.pendingInviteToken))
</script>

<style scoped>
/* 加入入口与创建入口保持一致的说明卡片样式。 */
.entry-shell { display: flex; align-items: center; min-height: 100vh; padding: 48rpx; box-sizing: border-box; background: #fff9f2; }
.entry-shell__card { width: 100%; padding: 56rpx 40rpx; border: 2rpx solid #d8eee2; border-radius: 28rpx; background: #fff; box-sizing: border-box; }
.entry-shell__eyebrow { display: block; color: #43c89a; font-size: 24rpx; font-weight: 700; letter-spacing: 4rpx; }
.entry-shell__title { display: block; margin-top: 24rpx; color: #29443a; font-size: 44rpx; font-weight: 700; }
.entry-shell__description { display: block; margin-top: 22rpx; color: #52665d; font-size: 29rpx; line-height: 1.7; }
.entry-shell__hint { display: block; margin-top: 40rpx; color: #74847d; font-size: 25rpx; }
</style>
