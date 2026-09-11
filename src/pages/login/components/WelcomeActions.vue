<template>
  <!-- 欢迎页主/次按钮区域：不读 store，只接收受控的 label / action / loading。 -->
  <view class="welcome-actions" data-testid="welcome-actions">
    <wd-button
      v-if="primary.action"
      block
      round
      size="large"
      :loading="primary.loading"
      :disabled="primary.disabled"
      :data-testid="primaryTestId || `welcome-primary-${primary.action}`"
      custom-class="welcome-actions__primary"
      @click="emit('select', primary.action as WelcomeAction)"
    >
      {{ primary.label }}
    </wd-button>
    <view v-else class="welcome-actions__busy">
      <wd-loading color="#267A5A" size="36rpx" />
      <text class="welcome-actions__busy-label">{{ primary.label || '正在处理…' }}</text>
    </view>
    <wd-button
      v-if="secondary.action"
      block
      round
      variant="plain"
      :disabled="secondary.disabled"
      :data-testid="`welcome-secondary-${secondary.action}`"
      custom-class="welcome-actions__secondary"
      @click="emit('select', secondary.action as WelcomeAction)"
    >
      {{ secondary.label }}
    </wd-button>
  </view>
</template>

<script setup lang="ts">
// 组件只接受外部传入的按钮状态和回调；不读 store，避免与页面职责重复。
import type { WelcomeAction, WelcomeButton } from '../welcome-view'

interface Props {
  primary: WelcomeButton
  secondary: WelcomeButton
  /** 主按钮的稳定 testid；外部传入时携带 mode 信息，方便 e2e 区分。 */
  primaryTestId: string
}

defineProps<Props>()
const emit = defineEmits<{ select: [action: Exclude<WelcomeAction, null>] }>()
</script>

<style lang="scss" scoped>
.welcome-actions {
  /* 主按钮 + 次按钮，间距跟随品牌规范。 */
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  width: 100%;

  &__busy {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 96rpx;
  }
  &__busy-label {
    margin-top: 12rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
  }

  :deep(.welcome-actions__primary) {
    height: 96rpx;
    background: $brand-color-action;
    color: #ffffff;
    font-size: 30rpx;
    font-weight: 700;
  }
  :deep(.welcome-actions__primary.is-disabled) {
    background: rgba($brand-color-action, .48);
    color: rgba(255, 255, 255, .9);
  }
  :deep(.welcome-actions__secondary) {
    height: 80rpx;
    border-color: $brand-color-primary;
    background: $brand-color-surface;
    color: $brand-color-action;
    font-size: 28rpx;
  }
}
</style>
