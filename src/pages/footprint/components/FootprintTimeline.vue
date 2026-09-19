<template>
  <view class="footprint-timeline">
    <view
      v-for="entry in entries"
      :key="entry.id"
      class="footprint-timeline__item"
      role="button"
      :aria-label="`${entryTitle(entry)}，${entryDate(entry)}`"
      @click="emit('press', entry.id)"
    >
      <image
        v-if="photoUrls[entryCoverId(entry)]"
        class="footprint-timeline__cover"
        :src="photoUrls[entryCoverId(entry)]"
        mode="aspectFill"
      />
      <view v-else class="footprint-timeline__cover footprint-timeline__cover--empty">
        <wd-icon name="location" size="42rpx" color="#267A5A" />
      </view>
      <view class="footprint-timeline__content">
        <view class="footprint-timeline__heading">
          <text class="footprint-timeline__place">{{ entryTitle(entry) }}</text>
          <text v-if="entry.entryKind === 'hike'" class="footprint-timeline__kind">徒步</text>
        </view>
        <text class="footprint-timeline__date">{{ entryDate(entry) }}</text>
        <text v-if="footprintMemoryPreview(entry)" class="footprint-timeline__memory">
          {{ footprintMemoryPreview(entry) }}
        </text>
      </view>
      <wd-icon name="arrow-right" size="30rpx" color="#74847D" />
    </view>
  </view>
</template>

<script setup lang="ts">
import type { FootprintTimelineEntry } from '../../../types/footprint'
import { footprintMemoryPreview, formatFootprintVisitDate } from '../footprint-view'

interface Props {
  entries: FootprintTimelineEntry[]
  photoUrls: Record<string, string>
}
defineProps<Props>()
const emit = defineEmits<{ press: [entryId: string] }>()

function entryTitle(entry: FootprintTimelineEntry): string {
  return entry.entryKind === 'hike' ? entry.name || '未命名徒步' : entry.place.name
}
function entryDate(entry: FootprintTimelineEntry): string {
  return entry.entryKind === 'hike'
    ? entry.hikedAt
      ? formatFootprintVisitDate(entry.hikedAt)
      : '暂无数据'
    : formatFootprintVisitDate(entry.visitedAt)
}
function entryCoverId(entry: FootprintTimelineEntry): string {
  return entry.coverPhoto?.resourceId || ''
}
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

    &:active {
      background: #effbf5;
    }
  }

  &__cover {
    width: 104rpx;
    height: 104rpx;
    flex-shrink: 0;
    border-radius: 18rpx;
    background: #effbf5;

    &--empty {
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  &__content {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 8rpx;
  }
  &__heading {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10rpx;
  }
  &__place {
    overflow: hidden;
    color: $brand-color-text;
    font-size: 30rpx;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__kind {
    flex-shrink: 0;
    padding: 4rpx 10rpx;
    border-radius: 999rpx;
    background: #e8f7ef;
    color: $brand-color-action;
    font-size: 18rpx;
    font-weight: 700;
  }
  &__date {
    color: $brand-color-action;
    font-size: 24rpx;
  }
  &__memory {
    overflow: hidden;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
