<!--
  类目筛选 chips：多选，横向滚动。
  颜色从类目的 colorKey 映射到具体 hex。
-->
<template>
  <scroll-view class="category-filter" scroll-x>
    <view class="category-filter__inner">
      <view
        v-for="cat in categories"
        :key="cat.id"
        class="category-filter__chip"
        :class="{ 'category-filter__chip--active': selectedIds.includes(cat.id) }"
        :data-testid="`category-filter-${cat.id}`"
        :style="{ '--chip-color': cat.colorHex }"
        @click="onToggle(cat.id)"
      >
        <view class="category-filter__dot" :style="{ background: cat.colorHex }" />
        <text class="category-filter__label">{{ cat.name }}</text>
      </view>
    </view>
  </scroll-view>
</template>

<script setup lang="ts">
import type { CategoryView } from '../../../pages/ledger/ledger-home-view'

interface Props {
  categories: CategoryView[]
  selectedIds: string[]
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'update:selectedIds', value: string[]): void }>()

function onToggle(id: string): void {
  const set = new Set(props.selectedIds)
  if (set.has(id)) set.delete(id)
  else set.add(id)
  emit('update:selectedIds', Array.from(set))
}
</script>

<style lang="scss" scoped>
.category-filter {
  white-space: nowrap;
  width: 100%;
}
.category-filter__inner {
  display: inline-flex;
  gap: 12rpx;
  padding: 4rpx 0;
}
.category-filter__chip {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 10rpx 18rpx;
  border: 2rpx solid $brand-color-border;
  border-radius: 999rpx;
  background: $brand-color-surface;
  transition: all .15s ease;
}
.category-filter__chip--active {
  border-color: var(--chip-color, $brand-color-primary);
  background: #effbf5;
}
.category-filter__dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  flex-shrink: 0;
}
.category-filter__label {
  color: $brand-color-text;
  font-size: 24rpx;
  font-weight: 500;
  line-height: 1.2;
}
.category-filter__chip--active .category-filter__label {
  color: $brand-color-action;
  font-weight: 600;
}
</style>
