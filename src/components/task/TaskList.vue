<template>
  <!-- 首页事项分组：优先处理仍置顶；其他事项按快到期、快没了、待处理排列。 -->
  <view class="task-list">
    <view
      v-for="(section, sectionIdx) in visibleSections"
      :key="section.key"
      class="task-list__section"
      :data-testid="section.testId"
    >
      <view class="task-list__section-heading">
        <text class="task-list__section-title">{{ section.title }}</text>
        <!-- 插画只跟随第一个可见分组，避免在事项列表前额外增加一行。 -->
        <image
          v-if="sectionIdx === 0"
          class="task-list__section-illustration"
          src="/static/warm-life/scenes/empty-tasks.png"
          mode="aspectFit"
          data-testid="home-tasks-scene"
        />
      </view>
      <TaskSummaryCard
        v-for="task in section.tasks"
        :key="task.id"
        :task="task"
        @press="emit('press', task.id)"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TaskSummaryCard from './TaskSummaryCard.vue'
import type { CurrentTasks, TaskSummary } from '../../types/task'

interface Props {
  current: CurrentTasks
}
interface TaskSection {
  key: string
  title: string
  testId: string
  tasks: TaskSummary[]
}

const props = defineProps<Props>()
const emit = defineEmits<{ press: [taskId: string] }>()

// 统一生成可见分组，保证装饰图始终落在第一组标题上，不因空分组留下空隙。
const visibleSections = computed<TaskSection[]>(() =>
  [
    { key: 'priority', title: '优先处理', testId: 'task-priority-section', tasks: props.current.priority },
    { key: 'expiring', title: '快到期', testId: 'task-group-expiring', tasks: props.current.groups.expiring },
    {
      key: 'low_stock',
      title: '快没了',
      testId: 'task-group-low_stock',
      tasks: props.current.groups.low_stock,
    },
    {
      key: 'to_handle',
      title: '待处理',
      testId: 'task-group-to_handle',
      tasks: props.current.groups.to_handle,
    },
  ].filter((section) => section.tasks.length > 0),
)
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
  &__section-heading {
    display: flex;
    min-height: 52rpx;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
  }
  &__section-title {
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 700;
  }
  &__section-illustration {
    width: 66rpx;
    height: 52rpx;
    flex: 0 0 auto;
  }
}
</style>
