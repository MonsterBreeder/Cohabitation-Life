<!--
  类目选择器（PRD 008 / Plan U5）。
  横向滚动的 chip 列表：选中态用类目色描边。
  末尾 "+ 添加" 按钮可触发 addCategory 弹窗。
-->
<template>
  <view class="category-picker">
    <view
      v-for="cat in categories"
      :key="cat.id"
      class="category-picker__chip"
      :class="{ 'category-picker__chip--active': cat.id === modelValue }"
      :style="{ '--chip-color': cat.colorHex }"
      :data-testid="`category-picker-${cat.id}`"
      @click="onSelect(cat.id)"
    >
      <wd-icon :name="cat.iconName" size="28rpx" :color="cat.id === modelValue ? 'var(--chip-color, #43C89A)' : '#74847D'" />
      <text class="category-picker__label" :class="{ 'category-picker__label--active': cat.id === modelValue }">{{ cat.name }}</text>
    </view>
    <view v-if="allowAdd" class="category-picker__add" data-testid="category-picker-add" @click="$emit('add')">
      <wd-icon name="plus" size="28rpx" color="#74847D" />
      <text class="category-picker__add-label">添加</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { CategoryView } from '../../../../pages/ledger/ledger-home-view'

interface Props {
  categories: CategoryView[]
  modelValue: string | null
  allowAdd?: boolean
  testId?: string
}
const props = withDefaults(defineProps<Props>(), {
  allowAdd: true,
  testId: 'category-picker',
})
const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void
  (e: 'add'): void
}>()

function onSelect(id: string): void {
  if (id === props.modelValue) return
  emit('update:modelValue', id)
}
</script>

<style lang="scss" scoped>
.category-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  padding: 4rpx 0;
  width: 100%;
  &__chip {
    display: inline-flex;
    align-items: center;
    gap: 8rpx;
    padding: 14rpx 22rpx;
    border: 2rpx solid $brand-color-border;
    border-radius: 999rpx;
    background: $brand-color-surface;
    transition: all .15s ease;
    &--active {
      border-color: var(--chip-color, $brand-color-primary);
      background: rgba(67, 200, 154, 0.08);
    }
  }
  &__label {
    color: $brand-color-text;
    font-size: 26rpx;
    font-weight: 500;
    line-height: 1.2;
    &--active {
      color: $brand-color-action;
      font-weight: 600;
    }
  }
  &__add {
    display: inline-flex;
    align-items: center;
    gap: 6rpx;
    padding: 14rpx 22rpx;
    border: 2rpx dashed $brand-color-border;
    border-radius: 999rpx;
    background: rgba($brand-color-surface, .5);
    &-label {
      color: $brand-color-text-secondary;
      font-size: 26rpx;
      font-weight: 500;
    }
  }
}
</style>
