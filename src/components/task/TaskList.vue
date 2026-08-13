<template>
  <!-- 事项列表当前只展示状态，不在组件内部修改 Pinia 数据。 -->
  <view class="section">
    <view class="section-heading"><text class="section-title">等待处理</text><text class="section-caption">{{ tasks.length }} 件</text></view>
    <view v-if="tasks.length" class="task-list">
      <view v-for="task in tasks" :key="task.id" class="task-card"><view class="task-mark" :class="`task-mark--${task.type}`" /><view class="task-content"><text class="task-name">{{ task.title }}</text><text class="task-meta">{{ task.dueLabel }}</text></view><text class="task-status">{{ task.statusLabel }}</text></view>
    </view>
    <view v-else class="empty-state"><text class="empty-title">现在没有等待处理的事</text><text class="empty-caption">要不要先记下一件？</text></view>
  </view>
</template>

<script setup lang="ts">
import type { Task } from '../../types/task'

// 事项由首页统一读取后传入，保持单向数据流。
defineProps<{ tasks: Task[] }>()
</script>

<style scoped>
/* 列表标题、事项卡和空状态的局部样式。 */
.section { display: flex; flex-direction: column; gap: 20rpx; }.section-heading { display: flex; align-items: center; justify-content: space-between; }.section-title { color: #2d3b31; font-size: 36rpx; font-weight: 700; }.section-caption { color: #849087; font-size: 26rpx; }.task-list { display: flex; flex-direction: column; gap: 16rpx; }
.task-card { display: flex; align-items: center; min-height: 112rpx; padding: 0 24rpx; border-radius: 20rpx; background: #fff; box-shadow: 0 8rpx 22rpx rgba(42, 58, 47, 0.05); }.task-mark { width: 18rpx; height: 18rpx; margin-right: 20rpx; border-radius: 50%; }.task-mark--low_stock { background: #d99833; }.task-mark--to_handle { background: #498469; }.task-mark--expiring { background: #c66b68; }.task-content { display: flex; flex: 1; flex-direction: column; gap: 6rpx; }.task-name { color: #344037; font-size: 29rpx; font-weight: 600; }.task-meta { color: #89928b; font-size: 24rpx; }.task-status { color: #66806d; font-size: 24rpx; }.empty-state { display: flex; flex-direction: column; align-items: center; padding: 64rpx 24rpx; border-radius: 20rpx; background: #fff; }.empty-title { color: #59665c; font-size: 29rpx; font-weight: 600; }.empty-caption { margin-top: 12rpx; color: #929b94; font-size: 25rpx; }
</style>
