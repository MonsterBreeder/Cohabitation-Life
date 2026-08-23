<template>
  <!-- 当前阶段只展示本人，不提前暴露邀请或其他成员操作。 -->
  <button class="member-card" data-testid="member-profile" :disabled="!editable" @click="editable && emit('press')">
    <wd-avatar :src="avatarSrc" :alt="`${nickname}的头像`" size="104rpx" />
    <view class="member-card__content">
      <text class="member-card__label">{{ isSelf ? '我' : '成员' }}</text>
      <text class="member-card__name">{{ nickname }}</text>
    </view>
    <wd-icon v-if="editable" name="arrow-right" size="32rpx" color="#74847d" />
  </button>
</template>

<script setup lang="ts">
interface Props {
  nickname: string
  avatarSrc: string
  isSelf: boolean
  editable?: boolean
}

withDefaults(defineProps<Props>(), { editable: false })
const emit = defineEmits<{ press: [] }>()
</script>

<style lang="scss" scoped>
.member-card {
  display: flex;
  width: 100%;
  align-items: center;
  padding: 28rpx 30rpx;
  border: 2rpx solid $brand-color-border;
  border-radius: $brand-radius-card;
  background: $brand-color-surface;
  text-align: left;
  line-height: 1;
  &::after {
    border: 0;
  }
  &__content {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    margin-left: 24rpx;
  }
  &__label {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
  }
  &__name {
    max-width: 100%;
    margin-top: 12rpx;
    overflow: hidden;
    color: $brand-color-text;
    font-size: 32rpx;
    font-weight: 700;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__tag {
    margin-right: 18rpx;
    padding: 10rpx 16rpx;
    border-radius: 999rpx;
    background: #effbf5;
    color: $brand-color-action;
    font-size: 21rpx;
  }
}
</style>
