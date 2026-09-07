<template>
  <view v-if="photos.length" class="footprint-photo-gallery">
    <image
      v-for="(photo, index) in photos"
      :key="photo.resourceId"
      class="footprint-photo-gallery__image"
      :src="photoUrls[photo.resourceId] || photo.url || ''"
      mode="aspectFill"
      :aria-label="`查看第 ${index + 1} 张足迹照片`"
      @click="preview(index)"
    />
  </view>
</template>

<script setup lang="ts">
import type { FootprintPhoto } from '../../../types/footprint'
interface Props { photos: FootprintPhoto[]; photoUrls: Record<string, string> }
const props = defineProps<Props>()

/** 预览只传已有短期地址，地址失效时由详情页重新加载。 */
function preview(index: number): void {
  const urls = props.photos.map((photo) => props.photoUrls[photo.resourceId] || photo.url || '').filter(Boolean)
  if (urls.length === 0) return
  uni.previewImage({ current: urls[Math.min(index, urls.length - 1)], urls })
}
</script>

<style lang="scss" scoped>
.footprint-photo-gallery {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14rpx;

  &__image { width: 100%; height: 210rpx; border-radius: 18rpx; background: #effbf5; }
}
</style>
