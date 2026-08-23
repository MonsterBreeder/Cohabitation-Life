<template>
  <view class="avatar-picker" data-testid="household-avatar-picker">
    <text class="avatar-picker__title">选择家庭头像</text>
    <text class="avatar-picker__hint">可选预设形象，或上传自己的图片</text>
    <view class="avatar-picker__options">
      <button
        v-for="avatar in avatars"
        :key="avatar.id"
        class="avatar-picker__option"
        :class="{
          'avatar-picker__option--selected': avatar.id === currentId,
          'avatar-picker__option--disabled': disabled,
        }"
        :disabled="disabled"
        :aria-label="`选择${avatar.label}`"
        :data-testid="`household-avatar-${avatar.id}`"
        @click="selectAvatar(avatar.id)"
      >
        <view class="avatar-picker__image-wrap">
          <wd-avatar :src="avatar.src" :alt="avatar.label" size="116rpx" />
          <view v-if="avatar.id === currentId" class="avatar-picker__check" aria-hidden="true">
            <wd-icon name="check" size="24rpx" color="#FFFFFF" />
          </view>
        </view>
        <text class="avatar-picker__label">{{ avatar.label }}</text>
      </button>
      <button
        class="avatar-picker__option"
        :class="{
          'avatar-picker__option--selected': Boolean(customPreview),
          'avatar-picker__option--disabled': disabled,
        }"
        :disabled="disabled"
        aria-label="上传自定义家庭头像"
        data-testid="household-avatar-custom"
        @click="selectCustomAvatar"
      >
        <view class="avatar-picker__image-wrap">
          <wd-avatar v-if="customPreview" :src="customPreview" alt="自定义家庭头像" size="116rpx" />
          <view v-else class="avatar-picker__custom-placeholder"><wd-icon name="camera" size="42rpx" color="#267A5A" /></view>
          <view v-if="customPreview" class="avatar-picker__check" aria-hidden="true"><wd-icon name="check" size="24rpx" color="#FFFFFF" /></view>
        </view>
        <text class="avatar-picker__label">上传图片</text>
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { BuiltinHouseholdAvatarId } from '../../../types/household'

interface Props {
  currentId?: BuiltinHouseholdAvatarId
  customPreview?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), { disabled: false })
const emit = defineEmits<{ select: [id: BuiltinHouseholdAvatarId]; selectCustom: [] }>()

const avatars: Array<{ id: BuiltinHouseholdAvatarId; label: string; src: string }> = [
  { id: 'household-01', label: '晨光相伴', src: '/static/avatars/households/household-01.png' },
  { id: 'household-02', label: '绿意相依', src: '/static/avatars/households/household-02.png' },
  { id: 'household-03', label: '珊瑚时光', src: '/static/avatars/households/household-03.png' },
]

function selectAvatar(id: BuiltinHouseholdAvatarId): void {
  if (!props.disabled) emit('select', id)
}

function selectCustomAvatar(): void {
  if (!props.disabled) emit('selectCustom')
}
</script>

<style lang="scss" scoped>
.avatar-picker {
  padding: 32rpx;
  border: 2rpx solid $brand-color-border;
  border-radius: $brand-radius-card;
  background: $brand-color-surface;
  &__title {
    display: block;
    color: $brand-color-text;
    font-size: 29rpx;
    font-weight: 700;
  }
  &__hint {
    display: block;
    margin-top: 10rpx;
    color: $brand-color-text-secondary;
    font-size: 23rpx;
  }
  &__options {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14rpx;
    margin-top: 28rpx;
  }
  &__option {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: center;
    padding: 20rpx 8rpx 18rpx;
    border: 3rpx solid transparent;
    border-radius: 22rpx;
    background: #f7fbf8;
    line-height: 1;
  }
  &__option--selected {
    border-color: $brand-color-primary;
    background: rgba($brand-color-primary, .08);
  }
  &__option--disabled {
    opacity: .6;
  }
  &__image-wrap {
    position: relative;
  }
  &__custom-placeholder {
    display: flex;
    width: 116rpx;
    height: 116rpx;
    align-items: center;
    justify-content: center;
    border: 2rpx dashed rgba($brand-color-primary, .65);
    border-radius: 50%;
    background: rgba($brand-color-primary, .06);
  }
  &__check {
    position: absolute;
    right: -4rpx;
    bottom: -2rpx;
    display: flex;
    width: 34rpx;
    height: 34rpx;
    align-items: center;
    justify-content: center;
    border: 4rpx solid #fff;
    border-radius: 50%;
    background: $brand-color-action;
  }
  &__label {
    display: block;
    max-width: 100%;
    margin-top: 18rpx;
    overflow: hidden;
    color: $brand-color-text;
    font-size: 23rpx;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 360px) {
    padding: 26rpx 20rpx;

    &__options {
      gap: 8rpx;
    }

    &__option {
      padding-right: 4rpx;
      padding-left: 4rpx;
    }
  }
}
</style>
