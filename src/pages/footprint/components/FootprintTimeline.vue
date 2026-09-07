<template>
  <view class="footprint-timeline">
    <view
      v-for="entry in entries"
      :key="entry.id"
      class="footprint-timeline__item"
      role="button"
      :aria-label="`${entry.place.name}，${formatFootprintVisitDate(entry.visitedAt)}`"
      @click="emit('press', entry.id)"
    >
      <image v-if="photoUrls[entry.coverPhoto?.resourceId || '']" class="footprint-timeline__cover" :src="photoUrls[entry.coverPhoto?.resourceId || '']" mode="aspectFill" />
      <view v-else class="footprint-timeline__cover footprint-timeline__cover--empty">
        <wd-icon name="location" size="42rpx" color="#267A5A" />
      </view>
      <view class="footprint-timeline__content">
        <text class="footprint-timeline__place">{{ entry.place.name }}</text>
        <text class="footprint-timeline__date">{{ formatFootprintVisitDate(entry.visitedAt) }}</text>
        <text v-if="footprintMemoryPreview(entry)" class="footprint-timeline__memory">{{ footprintMemoryPreview(entry) }}</text>
      </view>
      <wd-icon name="arrow-right" size="30rpx" color="#74847D" />
    </view>
  </view>
</template>

<script setup lang="ts">
import type { FootprintEntrySummary } from '../../../types/footprint'
import { footprintMemoryPreview, formatFootprintVisitDate } from '../footprint-view'

interface Props { entries: FootprintEntrySummary[]; photoUrls: Record<string, string> }
defineProps<Props>()
const emit = defineEmits<{ press: [entryId: string] }>()
</script>

<style lang="scss" scoped>
.footprint-timeline {
  display: flex;
  flex-direction: column;
  gap: 20rpx;

  &__item {
    display: flex;
    min-height: 132rpx;
    align-items: center;
    gap: 22rpx;
    padding: 20rpx;
    border: 2rpx solid $brand-color-border;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;

    &:active { background: #effbf5; }
  }

  &__cover {
    width: 104rpx;
    height: 104rpx;
    flex-shrink: 0;
    border-radius: 18rpx;
    background: #effbf5;

    &--empty { display: flex; align-items: center; justify-content: center; }
  }

  &__content { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 8rpx; }
  &__place { overflow: hidden; color: $brand-color-text; font-size: 30rpx; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
  &__date { color: $brand-color-action; font-size: 24rpx; }
  &__memory { overflow: hidden; color: $brand-color-text-secondary; font-size: 24rpx; text-overflow: ellipsis; white-space: nowrap; }
}
</style>
