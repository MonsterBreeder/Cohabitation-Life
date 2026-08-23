<template>
  <!-- 家庭资料是首页核心信息，使用独立业务卡片而不是通用统计卡。 -->
  <button class="household-card" data-testid="household-profile" @click="emit('press')">
    <wd-avatar :src="avatarSrc" :alt="`${name}的家庭头像`" size="144rpx" />
    <view class="household-card__content">
      <text class="household-card__eyebrow">我的家庭</text>
      <text class="household-card__name">{{ name }}</text>
      <text class="household-card__meta">{{ memberCount }} 位成员</text>
    </view>
    <wd-icon name="arrow-right" size="34rpx" color="#74847d" />
  </button>
</template>

<script setup lang="ts">
interface Props {
  name: string
  avatarSrc: string
  memberCount: number
}

defineProps<Props>()
const emit = defineEmits<{ press: [] }>()
</script>

<style lang="scss" scoped>
.household-card {
  display: flex;
  width: 100%;
  align-items: center;
  padding: 36rpx;
  border: 0;
  border-radius: $brand-radius-card;
  background: linear-gradient(135deg, #fff, #effbf5);
  box-shadow: 0 16rpx 40rpx rgba(41, 68, 58, .08);
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
    margin-left: 28rpx;
  }
  &__eyebrow {
    color: $brand-color-action;
    font-size: 23rpx;
    font-weight: 600;
    letter-spacing: 3rpx;
  }
  &__name {
    max-width: 100%;
    margin-top: 16rpx;
    overflow: hidden;
    color: $brand-color-text;
    font-size: 40rpx;
    font-weight: 700;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__meta {
    margin-top: 14rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    line-height: 1.4;
  }
}
</style>
