<!--
  单条评论气泡：左侧 avatar + 右侧 text（昵称 / 内容 / 相对时间）。
  - 不依赖 Wot UI 组件，纯 view 组合（属于"项目独有的视觉"）。
  - 不在主包 components：只被详情页用。
-->
<template>
  <view class="task-comment-item" :data-testid="'task-comment-item-' + comment.id">
    <view class="task-comment-item__avatar" :class="`task-comment-item__avatar--${comment.actor.avatar.id}`">
      <text class="task-comment-item__avatar-text">{{ avatarLetter }}</text>
    </view>
    <view class="task-comment-item__body">
      <view class="task-comment-item__header">
        <text class="task-comment-item__name">{{ comment.actor.nickname || '成员' }}</text>
        <text class="task-comment-item__time">{{ relativeTime }}</text>
      </view>
      <text class="task-comment-item__text" :user-select="true">{{ comment.text }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { TaskComment } from '../../../types/task'
import { formatRelativeTime } from '../task-detail/task-detail-view'

const props = defineProps<{ comment: TaskComment }>()

/**
 * 头像里显示的字符：优先取昵称首字（最直观），回退到 avatar id 的末两位数字；
 * 中性头像显示一个圆点。空昵称显示默认占位。
 */
const avatarLetter = computed(() => {
  const nickname = (props.comment.actor.nickname || '').trim()
  if (nickname) return nickname.charAt(0)
  const id = props.comment.actor.avatar.id
  if (id === 'person-neutral') return '·'
  const m = /person-(\d{2})/.exec(id)
  return m ? m[1] : '·'
})

const relativeTime = computed(() => formatRelativeTime(props.comment.at))
</script>

<style lang="scss" scoped>
.task-comment-item {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  padding: 4rpx 0;
  &__avatar {
    flex-shrink: 0;
    width: 56rpx;
    height: 56rpx;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: $brand-color-primary;
    color: #fff;
    font-size: 26rpx;
    font-weight: 600;
    letter-spacing: 0;
    margin-top: 4rpx;
  }
  &__avatar--person-neutral {
    background: #74847D;
  }
  &__avatar-text {
    line-height: 1;
  }
  &__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }
  &__header {
    display: flex;
    align-items: baseline;
    gap: 16rpx;
  }
  &__name {
    color: $brand-color-text;
    font-size: 25rpx;
    font-weight: 600;
  }
  &__time {
    color: $brand-color-text-secondary;
    font-size: 21rpx;
  }
  &__text {
    display: block;
    color: $brand-color-text;
    font-size: 28rpx;
    line-height: 1.55;
    word-break: break-word;
    white-space: pre-wrap;
  }
}
</style>
