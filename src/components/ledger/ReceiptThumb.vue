<!--
  凭证缩略图组件：用于账本首页列表 + 详情页。
  接收云存储 fileID，调 getTempFileURL 拿临时 URL（缓存 5 分钟）。
  点击触发父级 previewImage 全屏查看。
-->
<template>
  <view class="receipt-thumb" :class="{ 'receipt-thumb--loading': isLoading }" @click.stop="onPreview">
    <image
      v-if="resolvedUrl"
      class="receipt-thumb__image"
      :src="resolvedUrl"
      mode="aspectFill"
      :data-testid="testId"
    />
    <view v-else class="receipt-thumb__placeholder" :data-testid="`${testId}-placeholder`">
      <wd-loading v-if="isLoading" color="#74847D" size="20rpx" />
      <wd-icon v-else name="photo" size="32rpx" color="#74847D" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface Props {
  mediaId: string | null
  size?: number
  testId?: string
}

const props = withDefaults(defineProps<Props>(), { size: 88, testId: 'receipt-thumb' })

// 临时 URL 缓存：mediaId → url，5 分钟内复用
const cache = new Map<string, { url: string; expires: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000

const resolvedUrl = ref<string>('')
const isLoading = ref<boolean>(false)

async function resolveUrl(mediaId: string): Promise<string> {
  if (!mediaId) return ''
  const now = Date.now()
  const cached = cache.get(mediaId)
  if (cached && cached.expires > now) return cached.url
  return new Promise<string>((resolve) => {
    const wxApi = (globalThis as any).wx
    if (!wxApi || !wxApi.cloud || !wxApi.cloud.getTempFileURL) {
      resolve('')
      return
    }
    wxApi.cloud.getTempFileURL({
      fileList: [mediaId],
      success: (res: any) => {
        const list = res && res.fileList
        if (Array.isArray(list) && list.length > 0 && list[0].tempFileURL) {
          const url = list[0].tempFileURL
          cache.set(mediaId, { url, expires: now + CACHE_TTL_MS })
          resolve(url)
        } else {
          resolve('')
        }
      },
      fail: () => resolve(''),
    })
  })
}

watch(
  () => props.mediaId,
  async (id) => {
    if (!id) {
      resolvedUrl.value = ''
      return
    }
    isLoading.value = true
    try {
      const url = await resolveUrl(id)
      resolvedUrl.value = url
    } finally {
      isLoading.value = false
    }
  },
  { immediate: true },
)

function onPreview(): void {
  if (!resolvedUrl.value) return
  uni.previewImage({ urls: [resolvedUrl.value] })
}
</script>

<style lang="scss" scoped>
.receipt-thumb {
  display: flex;
  width: 88rpx;
  height: 88rpx;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 12rpx;
  background: #f1f5f2;
  flex-shrink: 0;
}
.receipt-thumb__image { width: 100%; height: 100%; }
.receipt-thumb__placeholder { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; }
</style>
