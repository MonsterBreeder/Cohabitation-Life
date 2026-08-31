<!--
  账本统计饼图（PRD 008）：使用微信小程序原生 2D canvas 绘制环形图。
  原 SVG 在微信小程序不渲染，第三方图表包也无法被分包运行时直接加载，因此收敛为原生画布。
  数据：CategorySlice[]（按 percent 0~1 排好的色块）。
  注：图例在 index.vue 手动渲染（保持原视觉），本组件不显示 ECharts 自带 legend。
-->
<template>
  <view class="stats-pie" :style="{ width: size + 'rpx', height: size + 'rpx' }">
    <view v-if="slices.length > 0" class="stats-pie__chart">
      <canvas
        type="2d"
        :id="canvasId"
        :canvas-id="canvasId"
        class="stats-pie__canvas"
        @touchstart="onPieTouch"
        @tap="onPieTap"
      />
      <cover-view
        v-if="tooltip"
        class="stats-pie__tooltip"
        :style="{ left: tooltip.left + 'px', top: tooltip.top + 'px' }"
        data-testid="stats-pie-tooltip"
      >
        <cover-view class="stats-pie__tooltip-name">{{ tooltip.categoryName }}</cover-view>
        <cover-view class="stats-pie__tooltip-value">{{ tooltip.amountText }} · {{ tooltip.percentText }}</cover-view>
      </cover-view>
    </view>
    <view v-else class="stats-pie__empty" data-testid="stats-pie-empty">
      <text class="stats-pie__empty-text">本月没有类目支出</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onBeforeUnmount, ref, shallowRef } from 'vue'
import { useCanvasChart, type CanvasChartDrawer } from '../../utils/use-canvas-chart'
import { formatYuan } from '../../../../utils/format'
import { findPieSliceIndex, type CategorySlice } from '../ledger-stats-view'

interface Props {
  slices: CategorySlice[]
  size?: number
}
const props = withDefaults(defineProps<Props>(), {
  size: 560,
})

// canvasId 必须稳定（同一组件实例多次渲染不能变），否则 onMounted 时 selectorQuery 找不到节点。
const canvasId = ref(`stats-pie-${Math.random().toString(36).slice(2, 10)}`)
const componentProxy = getCurrentInstance()?.proxy

interface PieTooltip {
  categoryName: string
  amountText: string
  percentText: string
  left: number
  top: number
}

interface CanvasTouchPoint {
  clientX?: number
  clientY?: number
  x?: number
  y?: number
}

interface CanvasTouchEvent {
  touches?: CanvasTouchPoint[]
  changedTouches?: CanvasTouchPoint[]
  detail?: { x?: number; y?: number }
}

const tooltip = shallowRef<PieTooltip | null>(null)
let tooltipTimer: ReturnType<typeof setTimeout> | undefined

const renderSource = computed(() => props.slices.map((slice) => `${slice.categoryId}:${slice.percent}:${slice.colorHex}`).join('|'))

const drawPie: CanvasChartDrawer = (context, { width, height }) => {
  const total = props.slices.reduce((sum, slice) => sum + Math.max(slice.percent, 0), 0)
  if (total <= 0) return
  const centerX = width / 2
  const centerY = height / 2
  const outerRadius = Math.min(width, height) * 0.4
  const innerRadius = outerRadius * 0.6
  let startAngle = -Math.PI / 2

  for (const slice of props.slices) {
    const endAngle = startAngle + (Math.max(slice.percent, 0) / total) * Math.PI * 2
    context.beginPath()
    context.moveTo(centerX, centerY)
    context.arc(centerX, centerY, outerRadius, startAngle, endAngle)
    context.closePath()
    context.fillStyle = slice.colorHex
    context.fill()
    startAngle = endAngle
  }

  // 用页面卡片底色挖出内圆，形成清晰的环形图。
  context.beginPath()
  context.arc(centerX, centerY, innerRadius, 0, Math.PI * 2)
  context.fillStyle = '#FFFFFF'
  context.fill()
}

useCanvasChart(canvasId.value, renderSource, drawPie)

/** 点击扇区后展示类目、金额和占比；点击圆心或图外则关闭提示。 */
function onPieTouch(event: TouchEvent): void {
  // uni-app 的模板类型使用标准 TouchEvent，小程序运行时会额外提供画布内 x / y 坐标。
  showTooltipForEvent(event as unknown as CanvasTouchEvent)
}

/** 开发者工具的鼠标点击只派发 tap，和真机触摸共用同一套命中与提示逻辑。 */
function onPieTap(event: Event): void {
  showTooltipForEvent(event as unknown as CanvasTouchEvent)
}

function showTooltipForEvent(canvasEvent: CanvasTouchEvent): void {
  const touch = canvasEvent.touches?.[0] || canvasEvent.changedTouches?.[0]
  const query = uni.createSelectorQuery()
  const scopedQuery = componentProxy ? query.in(componentProxy) : query
  scopedQuery.select(`#${canvasId.value}`).boundingClientRect((rect) => {
    if (!rect || Array.isArray(rect)) return
    const rectLeft = typeof rect.left === 'number' ? rect.left : 0
    const rectTop = typeof rect.top === 'number' ? rect.top : 0
    const rectWidth = typeof rect.width === 'number' ? rect.width : 0
    const rectHeight = typeof rect.height === 'number' ? rect.height : 0
    if (rectWidth <= 0 || rectHeight <= 0) return
    const localX = typeof touch?.clientX === 'number'
      ? touch.clientX - rectLeft
      : touch?.x ?? canvasEvent.detail?.x
    const localY = typeof touch?.clientY === 'number'
      ? touch.clientY - rectTop
      : touch?.y ?? canvasEvent.detail?.y
    if (typeof localX !== 'number' || typeof localY !== 'number') return

    const sliceIndex = findPieSliceIndex(props.slices, { x: localX, y: localY }, { width: rectWidth, height: rectHeight })
    if (sliceIndex === null) {
      hideTooltip()
      return
    }
    const slice = props.slices[sliceIndex]
    // 提示框限制在画布内部，避免靠边扇区的文字被卡片裁掉。
    const tooltipHalfWidth = 56
    const left = Math.min(Math.max(localX, tooltipHalfWidth), rectWidth - tooltipHalfWidth)
    const top = Math.max(localY - 8, 42)
    tooltip.value = {
      categoryName: slice.categoryName,
      amountText: formatYuan(slice.expenseCents, { sign: 'none' }),
      percentText: `${Math.round(slice.percent * 100)}%`,
      left,
      top,
    }
    if (tooltipTimer) clearTimeout(tooltipTimer)
    tooltipTimer = setTimeout(hideTooltip, 3000)
  }).exec()
}

/** 统一收起提示并清理定时器，避免页面离开后继续更新组件状态。 */
function hideTooltip(): void {
  tooltip.value = null
  if (tooltipTimer) clearTimeout(tooltipTimer)
  tooltipTimer = undefined
}

onBeforeUnmount(hideTooltip)
</script>

<style lang="scss" scoped>
.stats-pie {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  &__chart {
    position: relative;
    width: 100%;
    height: 100%;
  }
  &__canvas {
    width: 100%;
    height: 100%;
  }
  &__tooltip {
    position: absolute;
    z-index: 2;
    display: flex;
    min-width: 112px;
    padding: 8px 10px;
    box-sizing: border-box;
    flex-direction: column;
    align-items: center;
    border-radius: 8px;
    background: rgba(41, 68, 58, 0.94);
    box-shadow: 0 4px 12px rgba(41, 68, 58, 0.18);
    color: #FFFFFF;
    pointer-events: none;
    transform: translate(-50%, -100%);
    &-name {
      font-size: 12px;
      font-weight: 600;
      line-height: 18px;
    }
    &-value {
      font-size: 11px;
      line-height: 16px;
      opacity: 0.9;
    }
  }
  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    &-text {
      color: #74847D;
      font-size: 26rpx;
      font-style: italic;
    }
  }
}
</style>
