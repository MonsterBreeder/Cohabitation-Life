<template>
  <!-- 详情页底部的事件流：按时间倒序展示动作人与时间，不暴露任何内部键。 -->
  <view class="task-event-list">
    <view v-if="!events.length" class="task-event-list__empty">
      <text class="task-event-list__empty-text">还没有操作记录</text>
    </view>
    <view
      v-for="(event, idx) in events"
      :key="`${event.kind}-${event.at}-${idx}`"
      class="task-event-list__row"
      :data-testid="`task-event-${event.kind}`"
    >
      <text class="task-event-list__text">{{ describeEventLine(event) }}</text>
      <text class="task-event-list__time">{{ formatTime(event.at) }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { TaskEvent } from '../../types/task'
import { describeEventLine as buildLine, formatTerminalTime } from './task-shared'

interface Props { events: TaskEvent[] }
defineProps<Props>()

function describeEventLine(event: TaskEvent): string {
  return buildLine(event)
}

function formatTime(iso: string): string {
  return formatTerminalTime(iso)
}
</script>

<style lang="scss" scoped>
.task-event-list { display: flex; flex-direction: column; }
.task-event-list__empty { padding: 24rpx 0; text-align: center; }
.task-event-list__empty-text { color: $brand-color-text-secondary; font-size: 24rpx; }
.task-event-list__row { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid $brand-color-border; }
.task-event-list__row:last-child { border-bottom: 0; }
.task-event-list__text { color: $brand-color-text; font-size: 26rpx; }
.task-event-list__time { color: $brand-color-text-secondary; font-size: 22rpx; }
</style>
