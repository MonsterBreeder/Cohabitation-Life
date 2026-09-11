<template>
  <!-- 欢迎页协议组件：勾选 + 两个可点击的正文入口，不直接控制提交。 -->
  <view class="login-agreement" data-testid="login-agreement">
    <wd-checkbox
      :model-value="checked"
      :disabled="disabled"
      type="square"
      checked-color="#267A5A"
      custom-class="login-agreement__control"
      custom-label-class="login-agreement__text"
      @change="handleChange"
    >
      <text class="login-agreement__required" aria-label="必填">*</text>
      <text>已阅读并同意</text>
      <text class="login-agreement__link" data-testid="login-agreement-link" @click.stop="emit('open-agreement', 'agreement')">《用户协议》</text>
      <text>和</text>
      <text class="login-agreement__link" data-testid="login-agreement-privacy-link" @click.stop="emit('open-agreement', 'privacy')">《隐私政策》</text>
    </wd-checkbox>
  </view>
</template>

<script setup lang="ts">
// 组件输入保持只读，避免子组件直接修改页面状态。
interface Props {
  checked: boolean
  disabled?: boolean
}

interface CheckboxChangeEvent { value: boolean }

defineProps<Props>()
const emit = defineEmits<{
  change: [checked: boolean]
  'open-agreement': [kind: 'agreement' | 'privacy']
}>()

/** 把 Wot UI 复选框结果转交给欢迎页；正文链接也通过事件通知父页面跳转。 */
function handleChange(event: CheckboxChangeEvent): void {
  emit('change', event.value)
}
</script>

<style lang="scss" scoped>
.login-agreement {
  /* 协议行保证足够的触摸高度、清晰文字和可点击的链接。 */
  width: 100%;
  min-height: 52rpx;
  padding: 8rpx 0;
  box-sizing: border-box;

  :deep(.login-agreement__control) {
    align-items: flex-start;
  }

  :deep(.login-agreement__text) {
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    line-height: 1.65;
  }

  &__required {
    /* 必填星号：用品牌强调色，比灰字更显眼；与文字等高避免撑高行 */
    color: #ba564b;
    font-size: 24rpx;
    line-height: 1.65;
    margin-right: 4rpx;
  }

  &__link {
    color: $brand-color-action;
    font-size: 24rpx;
    line-height: 1.65;
    text-decoration: underline;
  }
}
</style>
