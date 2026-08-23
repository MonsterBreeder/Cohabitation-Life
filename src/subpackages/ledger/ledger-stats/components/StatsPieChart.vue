<!--
  饼图（PRD 008 / Plan U7）：纯 inline SVG，不引第三方图表库。
  数据：CategorySlice[]（按 percent 0~1 排好的色块）。
-->
<template>
  <view class="stats-pie">
    <view v-if="slices.length === 0" class="stats-pie__empty" data-testid="stats-pie-empty">
      <text class="stats-pie__empty-text">本月没有类目支出</text>
    </view>
    <view v-else class="stats-pie__container" data-testid="stats-pie">
      <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="stats-pie__svg">
        <circle :cx="cx" :cy="cy" :r="radius" :fill="emptyColor" />
        <path
          v-for="(seg, i) in segments"
          :key="`seg-${i}`"
          :d="seg.d"
          :fill="seg.colorHex"
          :data-testid="`stats-pie-slice-${i}`"
        />
        <circle :cx="cx" :cy="cy" :r="innerRadius" :fill="surfaceColor" />
      </svg>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CategorySlice } from '../ledger-stats-view'

interface Props {
  slices: CategorySlice[]
  size?: number
  emptyColor?: string
  surfaceColor?: string
}
const props = withDefaults(defineProps<Props>(), {
  size: 240,
  emptyColor: '#E4ECE7',
  surfaceColor: '#FFFFFF',
})

const cx = computed(() => props.size / 2)
const cy = computed(() => props.size / 2)
const radius = computed(() => props.size / 2 - 4)
const innerRadius = computed(() => radius.value * 0.6)

const segments = computed(() => {
  if (props.slices.length === 0) return []
  const total = props.slices.reduce((s, x) => s + x.percent, 0)
  if (total <= 0) return []
  let startAngle = -Math.PI / 2  // 12 点钟方向开始
  const out: Array<{ d: string; colorHex: string }> = []
  for (const slice of props.slices) {
    const angle = (slice.percent / total) * Math.PI * 2
    const endAngle = startAngle + angle
    out.push({
      d: arcPath(cx.value, cy.value, radius.value, startAngle, endAngle),
      colorHex: slice.colorHex,
    })
    startAngle = endAngle
  }
  return out
})

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle)
  const y1 = cy + r * Math.sin(startAngle)
  const x2 = cx + r * Math.cos(endAngle)
  const y2 = cy + r * Math.sin(endAngle)
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
}
</script>

<style lang="scss" scoped>
.stats-pie {
  width: 100%;
  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 240rpx;
    &-text {
      color: #74847D;
      font-size: 26rpx;
      font-style: italic;
    }
  }
  &__container {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  &__svg {
    display: block;
  }
}
</style>
