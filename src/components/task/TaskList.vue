<template>
  <!-- 首页事项分组：priority + 三个 type groups。 -->
  <view class="task-list">
    <view v-if="current.priority.length" class="task-list__section" data-testid="task-priority-section">
      <text class="task-list__section-title">优先处理</text>
      <TaskSummaryCard
        v-for="task in current.priority"
        :key="task.id"
        :task="task"
        @press="emit('press', task.id)"
      />
    </view>

    <view v-if="current.groups.low_stock.length" class="task-list__section" data-testid="task-group-low_stock">
      <text class="task-list__section-title">快没了</text>
      <TaskSummaryCard
        v-for="task in current.groups.low_stock"
        :key="task.id"
        :task="task"
        @press="emit('press', task.id)"
      />
    </view>

    <view v-if="current.groups.to_handle.length" class="task-list__section" data-testid="task-group-to_handle">
      <text class="task-list__section-title">待处理</text>
      <TaskSummaryCard
        v-for="task in current.groups.to_handle"
        :key="task.id"
        :task="task"
        @press="emit('press', task.id)"
      />
    </view>

    <view v-if="current.groups.expiring.length" class="task-list__section" data-testid="task-group-expiring">
      <text class="task-list__section-title">快到期</text>
      <TaskSummaryCard
        v-for="task in current.groups.expiring"
        :key="task.id"
        :task="task"
        @press="emit('press', task.id)"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import TaskSummaryCard from './TaskSummaryCard.vue'
import type { CurrentTasks } from '../../types/task'

interface Props { current: CurrentTasks }
defineProps<Props>()
const emit = defineEmits<{ press: [taskId: string] }>()
</script>

<style lang="scss" scoped>
.task-list {
  display: flex;
  flex-direction: column;
  gap: 32rpx;
  &__section {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
  }
  &__section-title {
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 700;
  }
}
</style>
