<!--
  凭证图上传组件（PRD 008 / Plan U5）。
  流程：点击 → uni.chooseImage → 显示本地预览 → 保存时调 uploadReceipt 拿 fileID。
  也支持传入已上传的 fileID（编辑模式）。
-->
<template>
  <view class="receipt-uploader">
    <view
      v-if="!localPath && !modelValue"
      class="receipt-uploader__trigger"
      :class="{ 'receipt-uploader__trigger--disabled': disabled }"
      :data-testid="testId"
      @click="onChoose"
    >
      <wd-icon name="photo" size="44rpx" color="#74847D" />
      <text class="receipt-uploader__hint">添加凭证（可选）</text>
      <text class="receipt-uploader__sub">JPG / PNG，≤ 5MB</text>
    </view>
    <view v-else class="receipt-uploader__preview" :data-testid="`${testId}-preview`">
      <image class="receipt-uploader__image" :src="displayUrl" mode="aspectFill" @click="onPreview" />
      <view v-if="!disabled" class="receipt-uploader__remove" :data-testid="`${testId}-remove`" @click.stop="onRemove">
        <wd-icon name="close" size="20rpx" color="#FFFFFF" />
      </view>
      <view v-if="isUploading" class="receipt-uploader__overlay">
        <wd-loading color="#FFFFFF" size="32rpx" />
        <text class="receipt-uploader__overlay-text">上传中…</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { deleteReceiptFile, generateReceiptTempId, uploadReceipt } from './ledger-cloud-uploader'

interface Props {
  modelValue: string | null         // 已上传的 fileID（编辑模式）
  householdId: string
  disabled?: boolean
  testId?: string
}
const props = withDefaults(defineProps<Props>(), { disabled: false, testId: 'receipt-uploader' })
const emit = defineEmits<{
  (e: 'update:modelValue', fileID: string | null): void
  (e: 'localPath', localPath: string | null): void
  (e: 'error', message: string): void
}>()

const localPath = ref<string | null>(null)
const isUploading = ref(false)
const tempId = ref<string>('')

const displayUrl = computed(() => localPath.value || '')

function onChoose(): void {
  if (props.disabled) return
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res: any) => {
      const path = res.tempFilePaths && res.tempFilePaths[0]
      if (!path) return
      // 大小校验（前端粗略：5MB = 5 * 1024 * 1024）
      if (res.tempFiles && res.tempFiles[0] && res.tempFiles[0].size > 5 * 1024 * 1024) {
        emit('error', '凭证图过大，请选择 5MB 以内的图片')
        return
      }
      localPath.value = path
      emit('localPath', path)
      // 不立即上传；保存时由父级统一调 uploadReceipt 拿 fileID
      tempId.value = generateReceiptTempId()
    },
    fail: () => undefined,
  })
}

function onRemove(): void {
  if (props.disabled) return
  if (props.modelValue) {
    // best-effort 删云存储；不阻塞 UI
    void deleteReceiptFile(props.modelValue)
  }
  localPath.value = null
  emit('localPath', null)
  emit('update:modelValue', null)
  tempId.value = ''
}

function onPreview(): void {
  if (!displayUrl.value) return
  uni.previewImage({ urls: [displayUrl.value] })
}

/** 暴露：触发上传。返回 fileID 或 null。 */
async function uploadNow(): Promise<string | null> {
  if (!localPath.value) return props.modelValue || null
  if (!tempId.value) tempId.value = generateReceiptTempId()
  isUploading.value = true
  try {
    const result = await uploadReceipt({
      householdId: props.householdId,
      entryTempId: tempId.value,
      localPath: localPath.value,
    })
    emit('update:modelValue', result.fileID)
    return result.fileID
  } catch (err) {
    const message = err instanceof Error ? err.message : '上传失败'
    emit('error', message)
    return null
  } finally {
    isUploading.value = false
  }
}

defineExpose({ uploadNow, isUploading })
</script>

<style lang="scss" scoped>
.receipt-uploader {
  width: 100%;
}
.receipt-uploader__trigger {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  height: 220rpx;
  border: 2rpx dashed $brand-color-border;
  border-radius: $brand-radius-card;
  background: rgba($brand-color-surface, .5);
  transition: all .15s ease;
}
.receipt-uploader__trigger:active {
  background: rgba($brand-color-primary, .06);
}
.receipt-uploader__trigger--disabled {
  opacity: .5;
  pointer-events: none;
}
.receipt-uploader__hint { color: $brand-color-text; font-size: 26rpx; font-weight: 500; }
.receipt-uploader__sub { color: $brand-color-text-secondary; font-size: 22rpx; }
.receipt-uploader__preview {
  position: relative;
  width: 100%;
  height: 360rpx;
  border-radius: $brand-radius-card;
  overflow: hidden;
  background: $brand-color-surface;
}
.receipt-uploader__image { width: 100%; height: 100%; }
.receipt-uploader__remove {
  position: absolute;
  top: 16rpx;
  right: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
}
.receipt-uploader__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  background: rgba(0, 0, 0, 0.45);
}
.receipt-uploader__overlay-text { color: #FFFFFF; font-size: 24rpx; }
</style>
