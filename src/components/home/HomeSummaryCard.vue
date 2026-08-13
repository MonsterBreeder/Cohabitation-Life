<template>
  <!-- 首页统计卡只展示父页面传入的标题、数量和色调。 -->
  <view class="card" :class="cardClass"><text class="label">{{ label }}</text><text class="count">{{ count }}</text><text class="suffix">件</text></view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// 卡片色调使用有限值，避免模板接受任意样式名。
interface Props { label: string; count: number; tone: 'warm' | 'green' | 'blue' | 'pink' }
const props = defineProps<Props>()
const cardClass = computed(() => `card--${props.tone}`)
</script>

<style scoped>
/* 统计卡布局与四种预设色调。 */
.card { display: flex; flex-wrap: wrap; align-items: baseline; min-height: 166rpx; padding: 28rpx; box-sizing: border-box; border-radius: 24rpx; }
.card--warm { background: #fff0d5; }.card--green { background: #e3f0df; }.card--blue { background: #e4eff6; }.card--pink { background: #f9e5e4; }
.label { width: 100%; margin-bottom: 16rpx; color: #536057; font-size: 25rpx; }.count { color: #26372c; font-size: 48rpx; font-weight: 700; line-height: 1; }.suffix { margin-left: 4rpx; color: #627067; font-size: 24rpx; }
</style>
