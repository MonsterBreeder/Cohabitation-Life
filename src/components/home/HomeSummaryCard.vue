<!--
  家庭资料卡（首页核心信息）。
  头像加载策略：
  - 内置头像直接传 src，立即可见
  - 自定义头像：custom avatar URL 是云端异步签发，父组件先传空 src + avatarLoading=true，
    头像占位显示浅绿加载圈，避免出现"默认头像 → 自定义头像"的闪屏
-->
<template>
  <button class="household-card" data-testid="household-profile" @click="emit('press')">
    <view class="household-card__avatar">
      <wd-avatar
        v-if="!avatarLoading"
        :src="avatarSrc"
        :alt="`${name}的家庭头像`"
        size="144rpx"
      />
      <view v-else class="household-card__avatar-placeholder" aria-label="家庭头像加载中">
        <wd-loading color="#43C89A" size="36rpx" />
      </view>
    </view>
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
  /** 当 avatarLoading=true 时本字段可为空串 */
  avatarSrc: string
  memberCount: number
  /** 自定义头像 URL 还在云端异步签发时为 true；此时显示占位加载圈 */
  avatarLoading?: boolean
}

withDefaults(defineProps<Props>(), { avatarLoading: false })
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
  // 头像占位框：固定 144rpx 与内置头像同尺寸，加载中只显示浅绿圈，避免布局抖动
  &__avatar {
    width: 144rpx;
    height: 144rpx;
    flex-shrink: 0;
  }
  &__avatar-placeholder {
    display: flex;
    width: 144rpx;
    height: 144rpx;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #effbf5;
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
