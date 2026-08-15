<template>
  <!-- 事项卡片：首页分组和优先级区通用。
       不修改 Pinia 数据；通过 @click 把 navigation intent 抛给调用方。 -->
  <button
    class="task-summary-card"
    :class="`task-summary-card--${task.type}`"
    :data-testid="`task-summary-${task.id}`"
    @click="emit('press', task.id)"
  >
    <view class="task-summary-card__mark" :class="`task-summary-card__mark--${task.type}`" />
    <view class="task-summary-card__content">
      <text class="task-summary-card__title">{{ task.title }}</text>
      <text class="task-summary-card__meta">
        {{ typeLabel }} · {{ dueLabel }} · {{ statusLabel }}
      </text>
    </view>
    <view v-if="task.isOverdueOrToday" class="task-summary-card__priority" data-testid="task-summary-priority">
      <text class="task-summary-card__priority-text">{{ task.isOverdueOrToday ? '今天/逾期' : '' }}</text>
    </view>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TaskSummary } from '../../types/task'
import { TASK_TYPES_DISPLAY } from './task-shared'

interface Props { task: TaskSummary }
const props = defineProps<Props>()
const emit = defineEmits<{ press: [taskId: string] }>()

const typeLabel = computed(() => {
  const opt = TASK_TYPES_DISPLAY.find((item) => item.value === props.task.type)
  return opt ? opt.label : ''
})

const dueLabel = computed(() => {
  if (!props.task.dueDate) return '无截止'
  if (props.task.isOverdueOrToday) return '今天/逾期'
  return props.task.dueDate
})

const statusLabel = computed(() => {
  if (props.task.status === 'claimed') {
    const who = props.task.assignee?.nickname || '成员'
    return `由 ${who} 处理`
  }
  return '待认领'
})
</script>

<style lang="scss" scoped>
.task-summary-card { display: flex; align-items: center; width: 100%; min-height: 112rpx; padding: 24rpx 28rpx; border: 0; border-radius: 18rpx; background: $brand-color-surface; box-shadow: 0 8rpx 22rpx rgba(42, 58, 47, 0.05); text-align: left; }
.task-summary-card::after { border: 0; }
.task-summary-card__mark { width: 12rpx; align-self: stretch; margin-right: 18rpx; border-radius: 6rpx; }
.task-summary-card__mark--low_stock { background: #d99833; }
.task-summary-card__mark--to_handle { background: #498469; }
.task-summary-card__mark--expiring { background: #c66b68; }
.task-summary-card__content { display: flex; flex: 1; flex-direction: column; gap: 6rpx; }
.task-summary-card__title { color: $brand-color-text; font-size: 29rpx; font-weight: 600; line-height: 1.4; }
.task-summary-card__meta { color: $brand-color-text-secondary; font-size: 23rpx; }
.task-summary-card__priority { padding: 6rpx 14rpx; border-radius: 999rpx; background: #fff3e8; }
.task-summary-card__priority-text { color: #a55d31; font-size: 21rpx; font-weight: 700; }
</style>
