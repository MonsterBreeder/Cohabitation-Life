<!-- 餐饮餐次选择器：只负责三项展示与值回传，显示时机由记账页决定。 -->
<template>
  <view class="meal-period-picker" data-testid="ledger-add-meal-period">
    <wd-radio-group
      :model-value="modelValue ?? ''"
      type="button"
      direction="horizontal"
      :disabled="disabled"
      checked-color="#267A5A"
      @update:model-value="onUpdate"
    >
      <wd-radio
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :data-testid="`ledger-add-meal-${option.value}`"
      >
        {{ option.label }}
      </wd-radio>
    </wd-radio-group>
  </view>
</template>

<script setup lang="ts">
import { MEAL_PERIOD_OPTIONS } from '../ledger-add-view'
import type { LedgerMealPeriod } from '../../../../types/ledger'

interface Props {
  modelValue: LedgerMealPeriod | null
  disabled?: boolean
}

defineProps<Props>()
const emit = defineEmits<{ (event: 'update:modelValue', value: LedgerMealPeriod): void }>()
const options = MEAL_PERIOD_OPTIONS

/** Wot UI 会回传基础值类型；这里收窄到固定白名单，避免异常值进入表单。 */
function onUpdate(value: string | number | boolean): void {
  if (value === 'breakfast' || value === 'lunch' || value === 'dinner') {
    emit('update:modelValue', value)
  }
}
</script>

<style lang="scss" scoped>
.meal-period-picker {
  width: 100%;

  :deep(.wd-radio-group) {
    display: flex;
    gap: 16rpx;
  }
}
</style>
