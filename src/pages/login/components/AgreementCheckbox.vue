<template>
  <!-- 协议组件只上报勾选结果，登录动作由父页面决定。 -->
  <view class="agreement-checkbox" data-testid="login-agreement">
    <wd-checkbox
      :model-value="checked"
      :disabled="disabled"
      type="square"
      checked-color="#267A5A"
      custom-class="agreement-checkbox__control"
      custom-label-class="agreement-checkbox__text"
      @change="handleChange"
    >
      已阅读并同意用户协议和隐私政策
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
const emit = defineEmits<{ change: [checked: boolean] }>()

/** 把 Wot UI 的复选框结果转交给登录页，组件自身不保存重复状态。 */
function handleChange(event: CheckboxChangeEvent): void {
  emit('change', event.value)
}
</script>

<style lang="scss" scoped>
/* 协议行保证足够的触摸高度和清晰的辅助文字。 */
.agreement-checkbox { width: 100%; min-height: 52rpx; padding: 8rpx 0; box-sizing: border-box; }
:deep(.agreement-checkbox__control) { align-items: flex-start; }
:deep(.agreement-checkbox__text) { color: $brand-color-text-secondary; font-size: 24rpx; line-height: 1.65; }
</style>
