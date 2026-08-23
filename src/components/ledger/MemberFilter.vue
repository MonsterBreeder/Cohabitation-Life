<!--
  成员筛选器：全部 / 我付的。
  横向排列的 chip 形式（不依赖 wd-tabs 避免样式冲突）。
-->
<template>
  <view class="member-filter">
    <view
      v-for="opt in options"
      :key="opt.value"
      class="member-filter__chip"
      :class="{ 'member-filter__chip--active': opt.value === modelValue }"
      :data-testid="`member-filter-${opt.value}`"
      @click="onSelect(opt.value)"
    >
      <text class="member-filter__label">{{ opt.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
type PayerFilter = 'all' | 'me'

interface Props {
  modelValue: PayerFilter
  options: Array<{ value: PayerFilter; label: string }>
  selfMemberKey?: string
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'update:modelValue', value: PayerFilter): void }>()

function onSelect(value: PayerFilter): void {
  if (value === props.modelValue) return
  emit('update:modelValue', value)
}
</script>

<style lang="scss" scoped>
.member-filter {
  display: flex;
  gap: 16rpx;
  &__chip {
    display: flex;
    align-items: center;
    padding: 12rpx 24rpx;
    border: 2rpx solid $brand-color-border;
    border-radius: 999rpx;
    background: $brand-color-surface;
    transition: all .15s ease;
  }
  &__chip--active {
    border-color: $brand-color-primary;
    background: #effbf5;
  }
  &__label {
    color: $brand-color-text;
    font-size: 26rpx;
    font-weight: 500;
    line-height: 1.2;
  }
  &__chip--active &__label {
    color: $brand-color-action;
    font-weight: 600;
  }
}
</style>
