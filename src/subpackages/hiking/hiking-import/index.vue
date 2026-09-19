<template>
  <view class="hiking-import">
    <!-- 选择与预览明确分区，文件没有成功显示前不能带回表单。 -->
    <view class="hiking-import__guide">
      <wd-icon name="folder" size="64rpx" color="#267A5A" />
      <text class="hiking-import__title">从微信聊天选择 KML</text>
      <text class="hiking-import__copy">
        文件只在本机解析。确认保存共同徒步前，不会上传路线，也不会生成记录。
      </text>
      <wd-button round :loading="choosing" @click="chooseFile">{{ chooseButtonText }}</wd-button>
      <text class="hiking-import__limit">最大 5 MB · 最多 20,000 个点 · 最多 100 段</text>
    </view>

    <view v-if="error" class="hiking-import__error">
      <wd-icon name="warning" size="36rpx" color="#BA564B" />
      <text>{{ error }}</text>
    </view>
    <view v-if="parsed" class="hiking-import__preview">
      <view class="hiking-import__file-row">
        <view class="hiking-import__file-copy">
          <text class="hiking-import__file-name">{{ selectedName }}</text>
          <text class="hiking-import__file-meta">
            {{ parsed.pointCount }} 个点 · {{ parsed.segmentCount }} 段
          </text>
        </view>
        <text class="hiking-import__status">已解析</text>
      </view>
      <HikingRouteMap :route="parsed.route" @ready="mapReady = true" @error="onMapError" />
      <HikingMetrics :metrics="parsed.metrics" />
      <view class="hiking-import__missing">
        <text>日期、地点和时长不会从 LineString 猜测，缺少时会显示“暂无数据”。</text>
      </view>
      <wd-button block round :disabled="!mapReady" @click="confirm">使用这条路线</wd-button>
      <text v-if="!mapReady" class="hiking-import__map-note">路线成功显示后才能继续</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import HikingMetrics from '../components/HikingMetrics.vue'
import HikingRouteMap from '../components/HikingRouteMap.vue'
import type { HikingKmlParseResult } from '../../../types/hiking'
import { parseSelectedKml } from './hiking-import-view'

interface MessageFile {
  name: string
  path: string
  size: number
}
interface WxFileSystemManager {
  readFile(options: {
    filePath: string
    encoding: 'utf8'
    success(result: { data: string | ArrayBuffer }): void
    fail(error: { errMsg?: string }): void
  }): void
}
interface WxRuntime {
  chooseMessageFile(options: {
    count: number
    type: 'file'
    extension: string[]
    success(result: { tempFiles: MessageFile[] }): void
    fail(error: { errMsg?: string }): void
  }): void
  getFileSystemManager(): WxFileSystemManager
}

interface HikingImportEventChannel {
  emit(event: 'hikingKmlImported', data: { fileName: string; result: HikingKmlParseResult }): void
}

interface HikingImportPage {
  getOpenerEventChannel?: () => HikingImportEventChannel | undefined
}

const choosing = ref(false)
const selectedName = ref('')
const parsed = ref<HikingKmlParseResult | null>(null)
const error = ref('')
const mapReady = ref(false)
const chooseButtonText = computed(() => (selectedName.value ? '重新选择' : '选择 KML 文件'))

function chooseFile(): void {
  if (choosing.value) return
  const runtime = (globalThis as typeof globalThis & { wx?: WxRuntime }).wx
  if (!runtime) {
    error.value = '请在微信小程序中从聊天选择 KML 文件'
    return
  }
  choosing.value = true
  error.value = ''
  parsed.value = null
  mapReady.value = false
  // 只让微信会话文件选择器返回 KML，并在读取前保留原始字节数用于上限校验。
  runtime.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['kml'],
    success: ({ tempFiles }) => {
      const file = tempFiles[0]
      if (!file) {
        choosing.value = false
        return
      }
      selectedName.value = file.name
      runtime.getFileSystemManager().readFile({
        filePath: file.path,
        encoding: 'utf8',
        success: ({ data }) => {
          const outcome = parseSelectedKml(typeof data === 'string' ? data : '', file.name, file.size)
          parsed.value = outcome.result
          error.value = outcome.error
          choosing.value = false
        },
        fail: () => {
          error.value = '文件暂时无法读取，请重新选择'
          choosing.value = false
        },
      })
    },
    fail: (failure) => {
      if (!/cancel/i.test(failure.errMsg || '')) error.value = '暂时无法选择文件，请稍后重试'
      choosing.value = false
    },
  })
}

function onMapError(): void {
  mapReady.value = false
  error.value = '路线地图暂时无法显示，请重试或重新选择文件'
}
function confirm(): void {
  if (!parsed.value || !mapReady.value) return
  // 规范路线只回传给发起页面；导入页本身不上传，也不创建共同记录。
  const page = getCurrentPages().at(-1) as HikingImportPage | undefined
  const channel = page?.getOpenerEventChannel?.()
  channel?.emit('hikingKmlImported', { fileName: selectedName.value, result: parsed.value })
  uni.navigateBack()
}
</script>

<style lang="scss" scoped>
.hiking-import {
  min-height: 100vh;
  padding: 28rpx 28rpx 80rpx;
  box-sizing: border-box;
  background: $brand-color-background;

  // 文件选择区先说明隐私和公开限制，避免用户误以为选择即上传。
  &__guide {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40rpx 30rpx;
    border: 2rpx dashed rgba(38, 122, 90, 0.22);
    border-radius: 30rpx;
    background: #f2faf6;
    text-align: center;
  }
  &__title {
    margin-top: 20rpx;
    color: $brand-color-text;
    font-size: 32rpx;
    font-weight: 800;
  }
  &__copy {
    max-width: 570rpx;
    margin: 12rpx 0 26rpx;
    color: $brand-color-text-secondary;
    font-size: 23rpx;
    line-height: 1.65;
  }
  &__limit {
    margin-top: 16rpx;
    color: $brand-color-text-secondary;
    font-size: 20rpx;
  }
  &__error {
    display: flex;
    align-items: flex-start;
    gap: 12rpx;
    margin-top: 20rpx;
    padding: 20rpx;
    border-radius: 18rpx;
    background: #fff0ed;
    color: #ba564b;
    font-size: 23rpx;
    line-height: 1.5;
  }
  // 预览区只在解析成功后出现，并把地图显示作为继续操作的闸门。
  &__preview {
    display: flex;
    flex-direction: column;
    gap: 20rpx;
    margin-top: 24rpx;
    padding: 24rpx;
    border-radius: 28rpx;
    background: $brand-color-surface;
    box-shadow: 0 8rpx 24rpx rgba(38, 90, 70, 0.05);
  }
  &__file-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
  }
  &__file-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 5rpx;
  }
  &__file-name {
    overflow: hidden;
    color: $brand-color-text;
    font-size: 27rpx;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__file-meta {
    color: $brand-color-text-secondary;
    font-size: 21rpx;
  }
  &__status {
    flex-shrink: 0;
    padding: 7rpx 14rpx;
    border-radius: 999rpx;
    background: #e7f7ef;
    color: $brand-color-action;
    font-size: 20rpx;
    font-weight: 700;
  }
  &__missing {
    padding: 18rpx 20rpx;
    border-radius: 16rpx;
    background: #fff7ef;
    color: $brand-color-text-secondary;
    font-size: 21rpx;
    line-height: 1.55;
  }
  &__map-note {
    color: $brand-color-text-secondary;
    font-size: 20rpx;
    text-align: center;
  }
}
</style>
