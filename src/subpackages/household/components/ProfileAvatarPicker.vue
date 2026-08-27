<template>
  <!--
    个人头像选择器。内置 4 个形象 + 第 5 格（无自定义时显示"+ 上传"，有自定义时显示缩略图）。
    modelValue 接受完整 ProfileAvatar；点击第 5 格通过 pickCustom 事件通知父组件走上传流程。
  -->
  <view class="avatar-picker">
    <button
      v-for="item in items"
      :key="item.id"
      class="avatar-picker__item"
      :class="{ 'avatar-picker__item--active': pickerState.activeBuiltinId === item.id }"
      :aria-label="`选择形象${item.label}`"
      @click="emit('update:modelValue', { kind: 'builtin', id: item.id })"
    >
      <wd-avatar :src="item.src" size="108rpx" />
      <text>{{ item.label }}</text>
    </button>
    <button
      class="avatar-picker__item avatar-picker__item--custom"
      :class="{ 'avatar-picker__item--active': pickerState.isCustomSelected }"
      :aria-label="pickerState.customAriaLabel"
      @click="emit('pickCustom')"
    >
      <view v-if="pickerState.hasCustomPreview" class="avatar-picker__custom-thumb">
        <wd-avatar :src="customPreview" size="108rpx" />
      </view>
      <view v-else class="avatar-picker__custom-placeholder">
        <text class="avatar-picker__custom-plus">+</text>
      </view>
      <text>{{ pickerState.customLabel }}</text>
    </button>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BuiltinProfileAvatarId, ProfileAvatar } from '../../../types/household'
import { describeProfilePickerState } from '../edit-view'

// Picker 的 modelValue 接受完整 ProfileAvatar；modelValue 为 null 时不显示任何选中。
// customPreview 是已上传的自定义头像的可显示 URL（来自云函数 getAvatarTemporaryUrl，
// 或 crop-avatar 通过 eventChannel 回传的本地 previewPath），缺省时第 5 格降级为占位。
const props = defineProps<{
  modelValue: ProfileAvatar | null
  customPreview?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ProfileAvatar]
  pickCustom: []
}>()

const items: Array<{ id: BuiltinProfileAvatarId; label: string; src: string }> = [
  { id: 'person-01', label: '形象一', src: '/static/avatars/people/person-01.png' },
  { id: 'person-02', label: '形象二', src: '/static/avatars/people/person-02.png' },
  { id: 'person-03', label: '形象三', src: '/static/avatars/people/person-03.png' },
  { id: 'person-04', label: '形象四', src: '/static/avatars/people/person-04.png' },
]

// 视觉状态派生全部走 describeProfilePickerState，方便单测覆盖；组件只剩纯模板。
const pickerState = computed(() => describeProfilePickerState(props.modelValue, props.customPreview))
</script>

<style lang="scss" scoped>
.avatar-picker {
  display: grid;
  // 5 列等宽：4 个内置 + 1 个"+"或自定义缩略图。375px 视口下每格约 74px，108rpx 头像可容纳。
  grid-template-columns: repeat(5, 1fr);
  gap: 16rpx;
  &__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10rpx;
    padding: 16rpx 4rpx;
    border: 3rpx solid transparent;
    border-radius: 24rpx;
    background: #fff;
    color: $brand-color-text-secondary;
    font-size: 20rpx;
    line-height: 1.2;
  }
  &__item::after {
    border: 0;
  }
  &__item--active {
    border-color: $brand-color-primary;
    background: #effbf5;
    color: $brand-color-text;
  }
  // 自定义格子：占位用淡灰描边、缩略图则和内置一致
  &__custom-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 108rpx;
    height: 108rpx;
    border: 3rpx dashed $brand-color-text-secondary;
    border-radius: 50%;
    color: $brand-color-text-secondary;
  }
  &__custom-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  &__custom-plus {
    font-size: 56rpx;
    line-height: 1;
    font-weight: 300;
  }
}
</style>
