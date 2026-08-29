<template>
  <view class="crop-avatar-page" data-testid="crop-avatar-page">
    <view v-if="!sourcePath" class="crop-avatar-page__chooser">
      <text class="crop-avatar-page__title">选择一张头像</text><text class="crop-avatar-page__copy">支持 JPG、PNG、WebP，原图不能超过 5 MB。</text>
      <wd-button type="primary" block @click="choose">从相册或相机选择</wd-button>
    </view>
    <wd-img-cropper v-model="cropVisible" :img-src="sourcePath" aspect-ratio="1:1" file-type="png" :quality="0.86" :export-scale="1" @confirm="confirmCrop" @cancel="cancelCrop" />
    <view v-if="uploading" class="crop-avatar-page__loading"><wd-loading /><text>正在检查图片，请不要关闭页面</text></view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { uploadAvatar } from '../../../services/avatar-media'
import type { CustomAvatarPurpose } from '../../../types/household'
import { describeImageSelectionFailure, validateLocalAvatar } from '../../../utils/image-selection'

const sourcePath = ref(''); const cropVisible = ref(false); const uploading = ref(false); const purpose = ref<CustomAvatarPurpose>('profile')
onLoad((query) => { purpose.value = query?.purpose === 'household' ? 'household' : 'profile' })

async function choose(): Promise<void> {
  try {
    const selected = await new Promise<UniApp.ChooseMediaSuccessCallbackResult>((resolve, reject) => uni.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], success: resolve, fail: reject }))
    const file = selected.tempFiles[0]
    const checked = validateLocalAvatar({ path: file.tempFilePath, size: file.size, mimeType: file.fileType === 'image' ? undefined : file.fileType })
    if (!checked.ok) { uni.showToast({ title: checked.message, icon: 'none' }); return }
    sourcePath.value = file.tempFilePath; cropVisible.value = true
  } catch (error) {
    // 头像与凭证入口共用同一套失败说明，避免同一种微信限制在不同页面表现不一致。
    const message = describeImageSelectionFailure(error)
    if (message) uni.showToast({ title: message, icon: 'none' })
  }
}
async function confirmCrop(event: { tempFilePath: string }): Promise<void> {
  uploading.value = true
  try {
    const info = await uni.getFileInfo({ filePath: event.tempFilePath })
    const checked = validateLocalAvatar({ path: event.tempFilePath, size: info.size, mimeType: 'image/png' })
    if (!checked.ok) throw new Error(checked.message)
    const avatar = await uploadAvatar(event.tempFilePath, purpose.value)
    const page = getCurrentPages().at(-1) as any
    const channel = page?.getOpenerEventChannel?.()
    channel?.emit('avatarApproved', { avatar, previewPath: event.tempFilePath })
    uni.navigateBack()
  } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '图片处理失败，请重试', icon: 'none' }) }
  finally { uploading.value = false }
}
function cancelCrop(): void { sourcePath.value = '' }
</script>

<style lang="scss" scoped>
.crop-avatar-page {
  min-height: 100vh;
  padding: 60rpx 32rpx;
  box-sizing: border-box;
  background: $brand-color-background;
  &__chooser, &__loading {
    display: flex;
    min-height: 65vh;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 26rpx;
    text-align: center;
  }
  &__title {
    color: $brand-color-text;
    font-size: 38rpx;
    font-weight: 700;
  }
  &__copy {
    color: $brand-color-text-secondary;
    font-size: 25rpx;
  }
}
</style>
