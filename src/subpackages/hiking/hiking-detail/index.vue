<template>
  <view class="hiking-detail">
    <view v-if="loading" class="hiking-detail__state">
      <wd-loading color="#267A5A" size="42rpx" />
      <text>正在加载徒步详情</text>
    </view>
    <view v-else-if="error && !detail" class="hiking-detail__state">
      <text>{{ error }}</text>
      <wd-button size="small" variant="plain" @click="loadDetail">重新加载</wd-button>
    </view>
    <template v-else-if="detail">
      <!-- 详情始终先展示共同回忆；路线或照片失败不能阻止编辑与删除。 -->
      <view class="hiking-detail__hero">
        <text class="hiking-detail__eyebrow">共同徒步</text>
        <text class="hiking-detail__title">{{ detail.name || '未命名徒步' }}</text>
        <text class="hiking-detail__meta">
          {{ detail.hikedAt || '日期暂无数据' }} · {{ detail.place?.name || '地点暂无数据' }}
        </text>
      </view>

      <view v-if="detail.hasRoute" class="hiking-detail__section">
        <view class="hiking-detail__section-heading">
          <text>路线</text>
          <wd-button v-if="routeError" size="small" variant="plain" @click="loadRoute">重试</wd-button>
        </view>
        <view v-if="routeLoading" class="hiking-detail__route-state">
          <wd-loading color="#267A5A" />
          <text>正在加载徒步路线</text>
        </view>
        <HikingRouteMap v-else-if="route" :route="route" />
        <view v-else class="hiking-detail__route-state">
          <text>{{ routeError || '路线暂时无法显示' }}</text>
        </view>
      </view>

      <view class="hiking-detail__section">
        <text class="hiking-detail__section-title">这次走了多远</text>
        <HikingMetrics :metrics="detail.metrics" />
        <view class="hiking-detail__extra">
          <text>平均速度</text>
          <text>{{ averageSpeedText }}</text>
        </view>
        <view class="hiking-detail__extra">
          <text>最高 / 最低海拔</text>
          <text>{{ altitudeText }}</text>
        </view>
      </view>

      <view class="hiking-detail__section">
        <text class="hiking-detail__section-title">一路记得</text>
        <text class="hiking-detail__memory">{{ detail.memory || '暂无感受' }}</text>
      </view>

      <view v-if="detail.photos.length" class="hiking-detail__section">
        <text class="hiking-detail__section-title">沿途照片</text>
        <view class="hiking-detail__photos">
          <image
            v-for="(photo, index) in detail.photos"
            :key="photo.resourceId"
            class="hiking-detail__photo"
            :src="photoUrls[photo.resourceId]"
            mode="aspectFill"
            @click="previewPhoto(index)"
          />
        </view>
      </view>

      <wd-button block round @click="edit">编辑这次徒步</wd-button>
      <wd-button block type="danger" plain :loading="deleting" @click="remove">删除这次徒步</wd-button>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import HikingMetrics from '../components/HikingMetrics.vue'
import HikingRouteMap from '../components/HikingRouteMap.vue'
import { deleteFootprintEntryInCloud, getFootprintPhotoUrlsInCloud } from '../../../services/footprint-cloud'
import { getHikeInCloud, getHikingRouteInCloud, humaniseHikingError } from '../../../services/hiking-cloud'
import type { HikingEntryDetail, HikingRoute } from '../../../types/hiking'

const entryId = ref('')
const detail = ref<HikingEntryDetail | null>(null)
const route = ref<HikingRoute | null>(null)
const loading = ref(false)
const routeLoading = ref(false)
const deleting = ref(false)
const error = ref('')
const routeError = ref('')
const photoUrls = ref<Record<string, string>>({})

const averageSpeedText = computed(() =>
  detail.value?.metrics.averageSpeedKmh == null
    ? '暂无数据'
    : `${detail.value.metrics.averageSpeedKmh.toFixed(1)} km/h`,
)
const altitudeText = computed(() => {
  const metrics = detail.value?.metrics
  return metrics?.highestAltitudeMeters == null || metrics.lowestAltitudeMeters == null
    ? '暂无数据'
    : `${Math.round(metrics.highestAltitudeMeters)} m / ${Math.round(metrics.lowestAltitudeMeters)} m`
})

async function loadRoute(): Promise<void> {
  if (!detail.value?.routeResourceId || routeLoading.value) return
  routeLoading.value = true
  routeError.value = ''
  try {
    route.value = await getHikingRouteInCloud(detail.value.routeResourceId)
  } catch (failure) {
    routeError.value = humaniseHikingError(failure)
  } finally {
    routeLoading.value = false
  }
}

async function loadDetail(): Promise<void> {
  if (!entryId.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    // 每次从编辑页返回都重读同一条云端记录，两个入口不会各自缓存一份内容。
    const result = await getHikeInCloud(entryId.value)
    if ('status' in result) throw result
    detail.value = result
    route.value = null
    photoUrls.value = {}
    try {
      const photos = await getFootprintPhotoUrlsInCloud(result.photos.map((photo) => photo.resourceId))
      photoUrls.value = Object.fromEntries(photos.map((photo) => [photo.resourceId, photo.url || '']))
    } catch {
      // 照片临时地址失败不能挡住文字、路线、编辑和删除。
    }
    if (result.routeResourceId) await loadRoute()
  } catch (failure) {
    error.value = humaniseHikingError(failure)
  } finally {
    loading.value = false
  }
}

function previewPhoto(index: number): void {
  if (!detail.value) return
  const urls = detail.value.photos.map((photo) => photoUrls.value[photo.resourceId]).filter(Boolean)
  if (urls.length) uni.previewImage({ current: urls[index], urls })
}

function edit(): void {
  if (detail.value) {
    uni.navigateTo({ url: `/subpackages/hiking/hiking-form/index?entryId=${detail.value.id}` })
  }
}

async function remove(): Promise<void> {
  if (!detail.value || deleting.value) return
  const confirmation = await uni.showModal({
    title: '删除这次徒步？',
    content: '删除后双方都会看不到，30 天后路线会被清理。',
    confirmText: '删除',
    confirmColor: '#BA564B',
  })
  if (!confirmation.confirm) return
  deleting.value = true
  try {
    const result = await deleteFootprintEntryInCloud({
      entryId: detail.value.id,
      operationToken: `hikedelete_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`,
    })
    if ('status' in result) throw result
    uni.showToast({ title: '已删除', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 400)
  } catch (failure) {
    error.value = humaniseHikingError(failure)
  } finally {
    deleting.value = false
  }
}

onLoad((options) => {
  entryId.value = typeof options?.entryId === 'string' ? options.entryId : ''
})
onShow(() => void loadDetail())
</script>

<style lang="scss" scoped>
.hiking-detail {
  min-height: 100vh;
  padding: 28rpx 28rpx 80rpx;
  box-sizing: border-box;
  background: $brand-color-background;

  &__state {
    display: flex;
    min-height: 70vh;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    text-align: center;
  }
  // 顶部以共同回忆为主，不把页面做成竞技运动数据面板。
  &__hero {
    display: flex;
    flex-direction: column;
    padding: 34rpx;
    border-radius: 30rpx;
    background: #eaf8f1;
  }
  &__eyebrow {
    color: $brand-color-action;
    font-size: 21rpx;
    font-weight: 700;
    letter-spacing: 4rpx;
  }
  &__title {
    margin-top: 15rpx;
    color: $brand-color-text;
    font-size: 42rpx;
    font-weight: 800;
  }
  &__meta {
    margin-top: 13rpx;
    color: $brand-color-text-secondary;
    font-size: 23rpx;
  }
  &__section {
    display: flex;
    flex-direction: column;
    gap: 18rpx;
    margin: 22rpx 0;
    padding: 26rpx;
    border-radius: 26rpx;
    background: $brand-color-surface;
  }
  &__section-heading {
    display: flex;
    min-height: 56rpx;
    align-items: center;
    justify-content: space-between;
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 800;
  }
  &__section-title {
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 800;
  }
  &__route-state {
    display: flex;
    min-height: 220rpx;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16rpx;
    color: $brand-color-text-secondary;
    font-size: 23rpx;
  }
  &__extra {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16rpx 4rpx 0;
    border-top: 1rpx solid $brand-color-border;
    color: $brand-color-text-secondary;
    font-size: 23rpx;
  }
  &__memory {
    color: $brand-color-text;
    font-size: 26rpx;
    line-height: 1.75;
    white-space: pre-wrap;
  }

  &__photos {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12rpx;
  }

  &__photo {
    width: 100%;
    height: 190rpx;
    border-radius: 18rpx;
    background: #effbf5;
  }
}
</style>
