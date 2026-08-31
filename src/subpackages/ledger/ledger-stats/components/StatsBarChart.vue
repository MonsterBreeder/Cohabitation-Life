<!--
  账本统计柱状图（PRD 008）：使用微信小程序原生 2D canvas 绘制纵向柱状图。
  数据：PayerBar[]（payer + expenseCents + percent）。
  X 轴：付款人昵称；Y 轴和柱顶展示金额（元）。
-->
<template>
  <view class="stats-bar">
    <canvas
      v-if="bars.length > 0"
      type="2d"
      :id="canvasId"
      :canvas-id="canvasId"
      class="stats-bar__canvas"
      :style="{ height: height + 'rpx' }"
    />
    <view v-else class="stats-bar__empty" data-testid="stats-bar-empty">
      <text class="stats-bar__empty-text">本月还没有付款人数据</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useCanvasChart, type CanvasChartDrawer } from '../../utils/use-canvas-chart'
import { formatYuan } from '../../../../utils/format'
import type { PayerBar } from '../ledger-stats-view'

interface Props {
  bars: PayerBar[]
  height?: number
}
const props = withDefaults(defineProps<Props>(), {
  height: 480,
})

const canvasId = ref(`stats-bar-${Math.random().toString(36).slice(2, 10)}`)

const renderSource = computed(() => props.bars.map((bar) => `${bar.payerKey}:${bar.expenseCents}:${bar.payerName}`).join('|'))

const drawBars: CanvasChartDrawer = (context, { width, height }) => {
  if (props.bars.length === 0) return
  const maxCents = Math.max(...props.bars.map((bar) => bar.expenseCents), 1)
  const ceiling = Math.ceil((maxCents * 1.2) / 100) * 100
  const tickLabels = Array.from({ length: 5 }, (_, index) => (
    formatYuan(Math.round(ceiling * (1 - index / 4)), { sign: 'none' })
  ))

  context.font = '11px sans-serif'
  // 根据最长刻度动态预留左边距，金额变大时也不会切掉人民币符号或首位数字。
  const longestTickWidth = Math.max(...tickLabels.map((label) => context.measureText(label).width))
  const padding = { top: 34, right: 12, bottom: 38, left: Math.ceil(longestTickWidth) + 12 }
  const chartWidth = Math.max(width - padding.left - padding.right, 1)
  const chartHeight = Math.max(height - padding.top - padding.bottom, 1)
  context.textBaseline = 'middle'
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4
    const y = padding.top + chartHeight * ratio
    context.beginPath()
    context.moveTo(padding.left, y)
    context.lineTo(width - padding.right, y)
    context.strokeStyle = '#E4ECE7'
    context.lineWidth = 1
    context.stroke()
    context.fillStyle = '#74847D'
    context.textAlign = 'right'
    context.fillText(tickLabels[index], padding.left - 6, y)
  }

  const slotWidth = chartWidth / props.bars.length
  const barWidth = Math.min(slotWidth * 0.42, 54)
  props.bars.forEach((bar, index) => {
    const barHeight = chartHeight * (bar.expenseCents / ceiling)
    const x = padding.left + slotWidth * index + (slotWidth - barWidth) / 2
    const y = padding.top + chartHeight - barHeight
    context.fillStyle = '#43C89A'
    context.fillRect(x, y, barWidth, barHeight)
    context.fillStyle = '#29443A'
    context.textAlign = 'center'
    context.textBaseline = 'bottom'
    context.fillText(formatYuan(bar.expenseCents, { sign: 'none' }), x + barWidth / 2, Math.max(y - 5, 12))
    context.fillStyle = '#74847D'
    context.textBaseline = 'top'
    context.fillText(bar.payerName, x + barWidth / 2, padding.top + chartHeight + 9)
  })
}

useCanvasChart(canvasId.value, renderSource, drawBars)
</script>

<style lang="scss" scoped>
.stats-bar {
  width: 100%;
  &__canvas {
    width: 100%;
    /* 行内样式控制高度（height prop），不能写死在 css 否则 setup.ts 默认值 480 无效 */
  }
  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 400rpx;
    &-text {
      color: #74847D;
      font-size: 26rpx;
      font-style: italic;
    }
  }
}
</style>
