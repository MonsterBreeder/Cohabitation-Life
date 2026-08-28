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
    <text v-if="!displayValue" class="amount-input__hint" aria-hidden="true">点此输入</text>
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
  // placeholder 改用"请输入金额"——之前"0.00"跟默认 modelValue=0 的显示态（displayValue 空 → 走 placeholder）
  // 重合，用户分不清是占位符还是默认值，还跟下面"请输入金额"验证红字撞色，看起来像输入框出 bug。
  // 改成"请输入金额"后，placeholder 跟验证文案一致（都是"该输入"的语义），不再撞色。
  placeholder: '请输入金额',
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
    // 清空输入时同步清掉上一条格式错误，父页面会改为展示“请输入金额”。
    emit('error', '')
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
  // align-items: center（不再是 baseline）——baseline 在 WeChat 上会因 placeholder
  // 行高 + input 自带 padding 让 ¥ 和 0.00 上下错位一两个像素；改 center 后 ¥、数字、
  // "点此输入"提示三者竖直中线对齐，且 input 高度自适应 padding。
  align-items: center;
  gap: 12rpx;
  padding: 20rpx 0;
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
    flex-shrink: 0;
  }
  &__field {
    // mini-program <input> 在 flex 容器里默认有 min-width: auto，flex:1 会被撑爆；
    // 在 display:block 容器里默认又有 min-height < 字号，导致 56rpx 字号的字符上下被裁。
    // 显式给 0 + 固定 height 才能保证文字竖直方向完整显示（用户反馈"0.00 那块下面显示不完全"）。
    min-width: 0;
    flex: 1;
    width: auto;
    height: 72rpx;
    min-height: 72rpx;
    font-size: 56rpx;
    font-weight: 700;
    line-height: 72rpx;
    font-variant-numeric: tabular-nums;
    background: transparent;
    border: none;
    outline: none;
    padding: 0;
    box-sizing: border-box;
  }
  &__placeholder {
    color: $brand-color-text-secondary;
    font-weight: 500;
    opacity: .6;
  }
  // 右侧辅助"点此输入"提示：占位符 + 文字双重提示，
  // 让"未输入"状态比之前"¥ + 0.00"更直白，不容易误以为是默认值。
  &__hint {
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    font-weight: 500;
    opacity: .55;
    flex-shrink: 0;
  }
}
</style>
