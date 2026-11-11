<!-- 文件用途：组合聊天小票的票头和正文，统一确认卡和回执的边框、虚线和留白。 -->
<template>
  <view class="receipt-paper">
    <view class="receipt-paper__header" :class="{ 'receipt-paper__header--tear': tear }">
      <view class="receipt-paper__heading">
        <slot name="heading" />
      </view>
      <BookkeepingIcon name="ticket" tone="ticket" />
    </view>
    <view class="receipt-paper__body">
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
import BookkeepingIcon from './BookkeepingIcon.vue'

/** 待确认小票使用分割线，正式结果使用更轻的票头。 */
defineProps<{ tear?: boolean }>()
</script>

<style lang="scss" scoped>
/* 纸张使用细边框，金额和操作自然构成阅读顺序。 */
.receipt-paper {
  background: $brand-color-surface;
  border: 1rpx solid $brand-color-border;
  border-radius: $brand-radius-card;
  overflow: hidden;
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18rpx;
    padding: 26rpx 28rpx;
    background: #f0f4ea;
  }
  &__header--tear {
    background: #e5f2e8;
    border-bottom: 2rpx dashed #bdd5c4;
  }
  &__heading {
    min-width: 0;
    flex: 1;
  }
  &__body {
    padding: 10rpx 28rpx 24rpx;
  }
}
</style>
