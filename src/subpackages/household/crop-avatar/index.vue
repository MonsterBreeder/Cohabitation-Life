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
// 头像裁剪 + 上传 + 通知发起页：
//  1) 选择图片后用 wd-img-cropper 做 1:1 PNG 裁剪；
//  2) confirmCrop 主动关闭 cropper 后走 uploadAvatar（prepareAvatar + checkAvatar）；
//     这里我们自己接管 cropVisible 而不是依赖 wd-img-cropper 内部 emit('update:modelValue', false)，
//     因为一旦出错用户会卡在"cropper 已关 + chooser 因 sourcePath 非空不显示 + loading 也消失"的三态全空白；
//  3) 成功后通过 eventChannel.emit('avatarApproved', ...) 通知发起页 + navigateBack；
//  4) 旧的上传占位由 uploadAvatar 自动恢复，页面不向用户暴露清理操作；
//  5) 任何错误都先 resetToChooser 再弹 toast，确保用户始终能看到"重新选图"入口。
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { uploadAvatar } from '../../../services/avatar-media'
import type { CustomAvatar, CustomAvatarPurpose } from '../../../types/household'
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

/** 把页面重置回 chooser：清图片源、关闭 cropper、清缓存。用户重新点"从相册或相机选择"即可重试。 */
function resetToChooser(): void {
  sourcePath.value = ''
  cropVisible.value = false
}

/** 真正的上传动作：先校验裁剪结果，再交给头像服务处理。 */
async function uploadOnce(tempFilePath: string): Promise<CustomAvatar> {
  const info = await uni.getFileInfo({ filePath: tempFilePath })
  const checked = validateLocalAvatar({ path: tempFilePath, size: info.size, mimeType: 'image/png' })
  if (!checked.ok) throw new Error(checked.message)
  return await uploadAvatar(tempFilePath, purpose.value)
}

/** 上传成功后的固定收尾：emit 到发起页 + 返回上一页。 */
function completeUpload(avatar: CustomAvatar, previewPath: string): void {
  // 先把 channel 存到局部变量，再用 channel?.emit 可选链调用——如果 getOpenerEventChannel
  // 不存在（navigateTo 没传 events 时部分平台会返回 undefined），emit 应是 no-op，而不是
  // page?.getOpenerEventChannel?.().emit(...) 让 `undefined(...)` 抛 TypeError，
  // 那会让 confirmCrop 走 catch、resetToChooser 且 navigateBack 永远不会执行——用户卡在 chooser。
  const page = getCurrentPages().at(-1) as { getOpenerEventChannel?: () => { emit: (event: string, data: { avatar: CustomAvatar; previewPath: string }) => void } | undefined } | undefined
  const channel = page?.getOpenerEventChannel?.()
  channel?.emit('avatarApproved', { avatar, previewPath })
  uni.navigateBack()
}

async function confirmCrop(event: { tempFilePath: string }): Promise<void> {
  // 主动关闭 cropper 并展示 loading，不依赖 wd-img-cropper 内部 emit('update:modelValue', false)
  // 的时机——emit 触发在 canvasToTempFilePath 的 complete 回调里，跟我们控制不了的成功/失败顺序耦合，
  // 出错时会让用户卡在"cropper 已关 / chooser 因 sourcePath 非空不显示 / loading 也消失"的空白页。
  cropVisible.value = false
  uploading.value = true
  try {
    const avatar = await uploadOnce(event.tempFilePath)
    completeUpload(avatar, event.tempFilePath)
  } catch (error) {
    // 错误时重置回 chooser，避免空白陷阱。
    resetToChooser()
    uni.showToast({ title: error instanceof Error ? error.message : '图片处理失败，请重试', icon: 'none' })
  } finally { uploading.value = false }
}

function cancelCrop(): void { resetToChooser() }
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
