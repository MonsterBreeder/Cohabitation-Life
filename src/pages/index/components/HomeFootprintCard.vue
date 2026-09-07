<template>
  <view class="home-footprint-card" role="button" aria-label="进入我们的足迹" @click="emit('press')">
    <view class="home-footprint-card__icon"><wd-icon name="location" size="46rpx" color="#267A5A" /></view>
    <view class="home-footprint-card__content">
      <text class="home-footprint-card__title">我们的足迹</text>
      <view v-if="loading" class="home-footprint-card__copy"><wd-loading size="24rpx" color="#267A5A" /> 正在加载足迹</view>
      <text v-else-if="errorMessage" class="home-footprint-card__copy">暂时没有读到，点击仍可进入</text>
      <text v-else-if="summary?.latestEntry" class="home-footprint-card__copy">去过 {{ summary.placeCount }} 个地方 · 最近去了 {{ summary.latestEntry.place.name }}</text>
      <text v-else class="home-footprint-card__copy">还没有共同足迹，去记录第一个地方吧</text>
      <text v-if="summary?.latestEntry" class="home-footprint-card__copy">{{ formatFootprintVisitDate(summary.latestEntry.visitedAt) }}</text>
    </view>
    <image v-if="coverUrl" class="home-footprint-card__cover" :src="coverUrl" mode="aspectFill" />
    <wd-icon v-else name="arrow-right" size="30rpx" color="#74847D" />
  </view>
</template>

<script setup lang="ts">
import type { FootprintHomeSummary } from '../../../types/footprint'
import { formatFootprintVisitDate } from '../../../utils/footprint-display'
// 家庭足迹组合卡片：同时展示地点数、最新游玩日期和可选照片，点击统一进入足迹。
interface Props { summary: FootprintHomeSummary | null; loading: boolean; errorMessage: string | null; coverUrl: string }
defineProps<Props>()
const emit = defineEmits<{ press: [] }>()
</script>

<style lang="scss" scoped>
.home-footprint-card {
  display: flex;
  min-height: 116rpx;
  align-items: center;
  gap: 20rpx;
  margin-top: 24rpx;
  padding: 22rpx 24rpx;
  border-radius: $brand-radius-card;
  background: $brand-color-surface;

  &:active { background: #effbf5; }
  &__icon { display: flex; width: 72rpx; height: 72rpx; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 18rpx; background: #effbf5; }
  &__content { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 8rpx; }
  &__title { color: $brand-color-text; font-size: 29rpx; font-weight: 700; }
  &__copy { overflow: hidden; color: $brand-color-text-secondary; font-size: 23rpx; text-overflow: ellipsis; white-space: nowrap; }
  &__cover { width: 72rpx; height: 72rpx; flex-shrink: 0; border-radius: 16rpx; }
}
</style>
