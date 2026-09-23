<template>
  <view class="warm-empty-state" :class="{ 'warm-empty-state--compact': compact }">
    <image class="warm-empty-state__image" :src="imageSrc" mode="aspectFit" />
    <text class="warm-empty-state__title">{{ title }}</text>
    <text class="warm-empty-state__copy">{{ copy }}</text>
    <view v-if="$slots.default" class="warm-empty-state__action"><slot /></view>
  </view>
</template>

<script setup lang="ts">
/**
 * 品牌空状态需要同时控制插画比例、虚线纸张底板和业务操作位置；Wot UI 的标准状态组件
 * 无法呈现这套共同生活手账构图，因此保留为睦录专用组合组件，业务判断仍留在页面。
 */
interface Props {
  imageSrc: string
  title: string
  copy: string
  compact?: boolean
}

withDefaults(defineProps<Props>(), { compact: false })
</script>

<style lang="scss" scoped>
.warm-empty-state {
  // 整体底板保持轻量，让空状态说明和下一步操作仍是阅读重点。
  display: flex;
  min-height: 360rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 42rpx 34rpx;
  border: 2rpx dashed rgba($brand-color-primary, 0.18);
  border-radius: $brand-radius-card;
  background: rgba($brand-color-surface, 0.8);
  text-align: center;

  &--compact {
    min-height: 300rpx;
    margin-top: 0;
    padding: 34rpx 28rpx;
  }

  &__image {
    width: 210rpx;
    height: 158rpx;
  }

  // 文案区统一三类空状态的层级，不在共享组件里判断具体业务含义。
  &__title {
    margin-top: 20rpx;
    color: $brand-color-text;
    font-size: 30rpx;
    font-weight: 700;
  }

  &__copy {
    max-width: 500rpx;
    margin-top: 12rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    line-height: 1.6;
  }

  &__action {
    margin-top: 24rpx;
  }
}
</style>
