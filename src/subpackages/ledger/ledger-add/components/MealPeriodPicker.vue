<!-- 餐饮餐次选择器：只负责三项展示与值回传，显示时机由记账页决定。 -->
<template>
  <view class="meal-period-picker" data-testid="ledger-add-meal-period">
    <!-- Wot UI 单选按钮在当前微信小程序编译后丢失子选项，这里使用业务芯片保证三个餐次稳定显示。 -->
    <view class="meal-period-picker__options">
      <view
        v-for="option in options"
        :key="option.value"
        class="meal-period-picker__option"
        :class="{
          'meal-period-picker__option--active': modelValue === option.value,
          'meal-period-picker__option--disabled': disabled,
        }"
        :data-testid="`ledger-add-meal-${option.value}`"
        @click="onSelect(option.value)"
      >
        <text class="meal-period-picker__label">{{ option.label }}</text>
      </view>
    </view>
    <text class="meal-period-picker__hint">再次点击已选餐次可取消</text>
  </view>
</template>

<script setup lang="ts">
import { MEAL_PERIOD_OPTIONS, toggleMealPeriod } from '../ledger-add-view'
import type { LedgerMealPeriod } from '../../../../types/ledger'

interface Props {
  modelValue: LedgerMealPeriod | null
  disabled?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ (event: 'update:modelValue', value: LedgerMealPeriod | null): void }>()
const options = MEAL_PERIOD_OPTIONS

/** 保存中禁止更改；再次点击当前项时回传空值，保持餐次可选。 */
function onSelect(value: LedgerMealPeriod): void {
  if (props.disabled) return
  emit('update:modelValue', toggleMealPeriod(props.modelValue, value))
}
</script>

<style lang="scss" scoped>
.meal-period-picker {
  width: 100%;

  &__options {
    display: flex;
    gap: 16rpx;
  }

  &__option {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 72rpx;
    color: $brand-color-text;
    background: $brand-color-surface;
    border: 2rpx solid $brand-color-border;
    border-radius: $brand-radius-button;

    &--active {
      color: $brand-color-action;
      background: #effbf5;
      border-color: $brand-color-primary;
    }

    &--disabled {
      opacity: $uni-opacity-disabled;
    }
  }

  &__label {
    font-size: 28rpx;
    font-weight: 500;
  }

  &__hint {
    display: block;
    margin-top: 12rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
  }
}
</style>
