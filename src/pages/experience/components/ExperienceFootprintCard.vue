<template>
  <!-- 体验页足迹卡：图片 + 简介 + 展开按钮。展开后显示完整副本。 -->
  <view class="experience-footprint-card" data-testid="experience-footprint-card">
    <view class="experience-footprint-card__header">
      <text class="experience-footprint-card__title">{{ footprint.title }}</text>
      <text class="experience-footprint-card__date">{{ footprint.dateLabel }}</text>
    </view>
    <image
      class="experience-footprint-card__image"
      :src="footprint.imagePath"
      mode="aspectFill"
      :aria-label="`${footprint.title} 示例图`"
      data-testid="experience-footprint-image"
    />
    <text class="experience-footprint-card__description">{{ footprint.description }}</text>
    <view v-if="footprint.expanded" class="experience-footprint-card__expanded" data-testid="experience-footprint-expanded">
      <text>{{ footprint.expandedCopy }}</text>
    </view>
    <view class="experience-footprint-card__action">
      <wd-button
        size="small"
        round
        :variant="footprint.expanded ? 'plain' : 'filled'"
        data-testid="experience-footprint-toggle"
        :custom-class="footprint.expanded ? 'experience-footprint-card__btn experience-footprint-card__btn--plain' : 'experience-footprint-card__btn'"
        @click="emit('toggle', footprint.id)"
      >{{ footprint.expanded ? '收起' : '展开' }}</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { ExperienceFootprint } from '../../../types/experience'

interface Props { footprint: ExperienceFootprint }
defineProps<Props>()
const emit = defineEmits<{ toggle: [footprintId: string] }>()
</script>

<style lang="scss" scoped>
.experience-footprint-card {
  /* 体验足迹卡：图片 + 简介 + 展开按钮。 */
  padding: 24rpx 28rpx;
  border: 2rpx solid $brand-color-border;
  border-radius: $brand-radius-card;
  background: $brand-color-surface;
  margin-bottom: 16rpx;

  &__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  &__title {
    color: $brand-color-text;
    font-size: 30rpx;
    font-weight: 700;
  }
  &__date {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
  }
  &__image {
    display: block;
    width: 100%;
    height: 360rpx;
    margin-top: 16rpx;
    border-radius: $brand-radius-input;
    background: $brand-color-background;
  }
  &__description {
    display: block;
    margin-top: 14rpx;
    color: $brand-color-text;
    font-size: 26rpx;
    line-height: 1.6;
  }
  &__expanded {
    margin-top: 14rpx;
    padding: 16rpx 18rpx;
    border-radius: $brand-radius-input;
    background: $brand-color-background;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    line-height: 1.7;
  }
  &__action {
    display: flex;
    justify-content: flex-end;
    margin-top: 18rpx;
  }
  :deep(.experience-footprint-card__btn) {
    height: 60rpx;
    padding: 0 28rpx;
    font-size: 24rpx;
  }
  :deep(.experience-footprint-card__btn--plain) {
    border-color: $brand-color-primary;
    color: $brand-color-action;
    background: $brand-color-surface;
  }
}
</style>
