<template>
  <view class="avatar-picker">
    <button
      v-for="item in items"
      :key="item.id"
      class="avatar-picker__item"
      :class="{ 'avatar-picker__item--active': item.id === modelValue }"
      :aria-label="`选择形象${item.label}`"
      @click="emit('update:modelValue', item.id)"
    >
      <wd-avatar :src="item.src" size="108rpx" />
      <text>{{ item.label }}</text>
    </button>
  </view>
</template>

<script setup lang="ts">
import type { BuiltinProfileAvatarId } from '../../../types/household'

defineProps<{ modelValue: BuiltinProfileAvatarId }>()
const emit = defineEmits<{ 'update:modelValue': [value: BuiltinProfileAvatarId] }>()

const items: Array<{ id: BuiltinProfileAvatarId; label: string; src: string }> = [
  { id: 'person-01', label: '形象一', src: '/static/avatars/people/person-01.png' },
  { id: 'person-02', label: '形象二', src: '/static/avatars/people/person-02.png' },
  { id: 'person-03', label: '形象三', src: '/static/avatars/people/person-03.png' },
  { id: 'person-04', label: '形象四', src: '/static/avatars/people/person-04.png' },
]
</script>

<style lang="scss" scoped>
.avatar-picker { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18rpx; }
.avatar-picker__item { display: flex; flex-direction: column; align-items: center; gap: 12rpx; padding: 18rpx 8rpx; border: 3rpx solid transparent; border-radius: 24rpx; background: #fff; color: $brand-color-text-secondary; font-size: 22rpx; line-height: 1.2; }
.avatar-picker__item::after { border: 0; }
.avatar-picker__item--active { border-color: $brand-color-primary; background: #effbf5; color: $brand-color-text; }
</style>
