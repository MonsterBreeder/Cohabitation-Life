<!--
  金额输入组件（PRD 008 / Plan U5）。
  模式：元输入 → 内部 ×100 存分。
  字号 56rpx / weight 700 / font-variant-numeric: tabular-nums；与 task 模块的"标题"区字号一致。
  type 切换会改金额颜色（支出红 / 收入绿）。
-->
<template>
  <view class="amount-input" :class="toneClass">
    <text class="amount-input__prefix">¥</text>
    <input
      class="amount-input__field"
      :value="displayValue"
      type="digit"
      :placeholder="placeholder"
      placeholder-class="amount-input__placeholder"
      :maxlength="11"
      :disabled="disabled"
      :data-testid="testId"
      @input="onInput"
    />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { validateAmountCents } from '../../../../utils/ledger-validators'

interface Props {
  modelValue: number          // 单位：分
  type?: 'expense' | 'income' // 控制前缀色
  placeholder?: string
  disabled?: boolean
  testId?: string
}
const props = withDefaults(defineProps<Props>(), {
  type: 'expense',
  placeholder: '0.00',
  disabled: false,
  testId: 'amount-input',
})
const emit = defineEmits<{
  (e: 'update:modelValue', cents: number): void
  (e: 'error', message: string): void
}>()

const displayValue = computed(() => {
  if (!props.modelValue || props.modelValue <= 0) return ''
  // 元 = cents / 100；不做小数补零（用户输入"1"就显示"1"，不自动变"1.00"）。
  // 小数位的精度交给 validateAmountCents 校验；前端不替用户做格式化。
  return (props.modelValue / 100).toString()
})

const toneClass = computed(() => (props.type === 'income' ? 'amount-input--income' : 'amount-input--expense'))

function onInput(e: any): void {
  const raw = (e && e.detail && typeof e.detail.value === 'string') ? e.detail.value : ''
  if (raw === '') {
    emit('update:modelValue', 0)
    return
  }
  try {
    const cents = validateAmountCents(raw)
    emit('update:modelValue', cents)
    emit('error', '')
  } catch (err) {
    // 不更新 modelValue，触发 error 提示
    const message = err instanceof Error ? err.message : '金额格式不正确'
    emit('error', message)
  }
}
</script>

<style lang="scss" scoped>
.amount-input {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
  padding: 24rpx 0;
  &--expense {
    color: $brand-color-accent;
  }
  &--income {
    color: $brand-color-primary;
  }
  &__prefix {
    font-size: 56rpx;
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  &__field {
    flex: 1;
    font-size: 56rpx;
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    background: transparent;
    border: none;
    outline: none;
  }
  &__placeholder {
    color: $brand-color-text-secondary;
    font-weight: 500;
    opacity: .4;
  }
}
</style>
