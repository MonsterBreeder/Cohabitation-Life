<!--
  类目选择器（PRD 008 / Plan U5）。
  横向滚动的 chip 列表：选中态用类目色描边。
  末尾 "+ 添加" 按钮可触发 addCategory 弹窗。

  改造：原版用 <wd-icon :name="cat.iconName"> 显示类目图标，但 Wot UI iconfont 里
  fork-spoon/car/house/gamepad/first-aid/shopping-bag 这 6 个字符没字形，导致 6 个
  类目都显示空白（用户反馈"只有教育和其它有图标"）。
  改用"类目首字"（餐/交/居/娱/医/服/教/它）放在 chip 内左侧小色块上，色彩用类目色，
  8 个类目统一可读。
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
      <view class="category-picker__icon" :style="{ background: cat.colorHex }">
        <text class="category-picker__icon-char">{{ firstCharOf(cat.name) }}</text>
      </view>
      <text class="category-picker__label" :class="{ 'category-picker__label--active': cat.id === modelValue }">{{ cat.name }}</text>
    </view>
    <view v-if="allowAdd" class="category-picker__add" data-testid="category-picker-add" @click="$emit('add')">
      <view class="category-picker__add-icon">
        <text class="category-picker__add-icon-char">+</text>
      </view>
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

/** 取类目名称首字；中文名称直接取第一个字符，英文 fallback 取首字母大写。 */
function firstCharOf(name: string): string {
  if (!name) return '?'
  // CJK 字符首字（U+4E00 ~ U+9FFF）
  const first = name.charAt(0)
  if (/[一-鿿]/.test(first)) return first
  return first.toUpperCase()
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
    padding: 8rpx 22rpx 8rpx 8rpx;
    border: 2rpx solid $brand-color-border;
    border-radius: 999rpx;
    background: $brand-color-surface;
    transition: all .15s ease;
    &--active {
      border-color: var(--chip-color, $brand-color-primary);
      background: rgba(67, 200, 154, 0.08);
    }
  }
  // 类目色块：36rpx 圆角矩形（不是圆形）放首字，跟"添加"按钮的 + 号视觉一致
  &__icon {
    display: flex;
    width: 36rpx;
    height: 36rpx;
    align-items: center;
    justify-content: center;
    border-radius: 10rpx;
    flex-shrink: 0;
  }
  &__icon-char {
    color: #FFFFFF;
    font-size: 22rpx;
    font-weight: 700;
    line-height: 1;
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
    padding: 8rpx 22rpx 8rpx 8rpx;
    border: 2rpx dashed $brand-color-border;
    border-radius: 999rpx;
    background: rgba($brand-color-surface, .5);
  }
  &__add-icon {
    display: flex;
    width: 36rpx;
    height: 36rpx;
    align-items: center;
    justify-content: center;
    border-radius: 10rpx;
    background: rgba($brand-color-border, .4);
    flex-shrink: 0;
  }
  &__add-icon-char {
    color: $brand-color-text-secondary;
    font-size: 26rpx;
    font-weight: 400;
    line-height: 1;
  }
  &__add-label {
    color: $brand-color-text-secondary;
    font-size: 26rpx;
    font-weight: 500;
  }
}
</style>
