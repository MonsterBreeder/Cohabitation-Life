<template>
  <view class="hiking-metrics">
    <!-- 缺失成果统一显示“暂无数据”，不以 0 冒充真实测量值。 -->
    <view v-for="item in items" :key="item.label" class="hiking-metrics__item">
      <text class="hiking-metrics__value">{{ item.value }}</text>
      <text class="hiking-metrics__label">{{ item.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HikingMetrics } from '../../../types/hiking'

const props = defineProps<{ metrics: HikingMetrics }>()
// 首屏只放最容易理解的三项，其余成果由详情页补充展示。
const items = computed(() => [
  {
    label: '距离',
    value:
      props.metrics.distanceMeters == null
        ? '暂无数据'
        : `${(props.metrics.distanceMeters / 1000).toFixed(1)} km`,
  },
  {
    label: '有效时长',
    value:
      props.metrics.durationSeconds == null
        ? '暂无数据'
        : `${Math.round(props.metrics.durationSeconds / 60)} 分钟`,
  },
  {
    label: '累计爬升',
    value:
      props.metrics.elevationGainMeters == null
        ? '暂无数据'
        : `${Math.round(props.metrics.elevationGainMeters)} m`,
  },
])
</script>

<style lang="scss" scoped>
.hiking-metrics {
  // 三项成果等宽排列，长文案在窄屏内截断而不挤坏卡片。
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10rpx;

  &__item {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 8rpx;
    padding: 18rpx 10rpx;
    border-radius: 18rpx;
    background: #f4faf7;
    text-align: center;
  }
  &__value {
    overflow: hidden;
    color: $brand-color-text;
    font-size: 24rpx;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__label {
    color: $brand-color-text-secondary;
    font-size: 20rpx;
  }
}
</style>
