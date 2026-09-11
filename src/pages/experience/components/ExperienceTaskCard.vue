<template>
  <!-- 体验页事项卡：纯展示 + 上报认领切换；不读 store。 -->
  <view class="experience-task-card" data-testid="experience-task-card">
    <view class="experience-task-card__header">
      <text class="experience-task-card__title">{{ task.title }}</text>
      <text class="experience-task-card__assignee">{{ task.assigneeLabel }}</text>
    </view>
    <text class="experience-task-card__description">{{ task.description }}</text>
    <view class="experience-task-card__action">
      <text class="experience-task-card__state">{{ task.state === 'claimed' ? '由我处理' : '尚未认领' }}</text>
      <wd-button
        size="small"
        round
        :variant="task.state === 'claimed' ? 'plain' : 'filled'"
        data-testid="experience-task-toggle"
        :custom-class="task.state === 'claimed' ? 'experience-task-card__btn experience-task-card__btn--plain' : 'experience-task-card__btn'"
        @click="emit('toggle', task.id)"
      >{{ task.state === 'claimed' ? '恢复示例' : '认领' }}</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { ExperienceTask } from '../../../types/experience'

interface Props { task: ExperienceTask }
defineProps<Props>()
const emit = defineEmits<{ toggle: [taskId: string] }>()
</script>

<style lang="scss" scoped>
.experience-task-card {
  /* 体验事项卡：标题 + 责任方 + 描述 + 认领按钮。 */
  padding: 24rpx 28rpx;
  border: 2rpx solid $brand-color-border;
  border-radius: $brand-radius-card;
  background: $brand-color-surface;
  margin-bottom: 16rpx;

  &__header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  &__title {
    color: $brand-color-text;
    font-size: 30rpx;
    font-weight: 700;
  }
  &__assignee {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
  }
  &__description {
    display: block;
    margin-top: 12rpx;
    color: $brand-color-text-secondary;
    font-size: 26rpx;
    line-height: 1.6;
  }
  &__action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 18rpx;
  }
  &__state {
    color: $brand-color-action;
    font-size: 24rpx;
    font-weight: 700;
  }
  :deep(.experience-task-card__btn) {
    height: 60rpx;
    padding: 0 28rpx;
    font-size: 24rpx;
  }
  :deep(.experience-task-card__btn--plain) {
    border-color: $brand-color-primary;
    color: $brand-color-action;
    background: $brand-color-surface;
  }
}
</style>
