<template>
  <view class="footprint-page">
    <wd-toast />

    <view v-if="checkingHome && !household" class="footprint-page__state">
      <wd-loading color="#267A5A" size="42rpx" />
      <text class="footprint-page__state-title">正在加载足迹</text>
    </view>
    <view v-else-if="pageError" class="footprint-page__state">
      <text class="footprint-page__state-copy">{{ pageError }}</text>
      <wd-button variant="plain" @click="loadPage">重新加载</wd-button>
    </view>
    <view v-else-if="!household" class="footprint-page__state">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="footprint-page__state-title">需要先有家</text>
      <text class="footprint-page__state-copy">足迹属于这个家，先创建或加入一个家吧。</text>
    </view>

    <view
      v-else-if="phase === 'loading' && !summary"
      class="footprint-page__state"
      data-testid="footprint-loading"
    >
      <wd-loading color="#267A5A" size="42rpx" />
      <text class="footprint-page__state-title">正在加载足迹</text>
    </view>

    <view v-else class="footprint-page__content">
      <view class="footprint-page__hero">
        <!-- 顶部合并足迹数量与主操作，让用户进入页面后先看到共同记忆的规模。 -->
        <view class="footprint-page__hero-copy">
          <view class="footprint-page__eyebrow-row">
            <view class="footprint-page__eyebrow-dot" />
            <text class="footprint-page__eyebrow">我们的足迹</text>
          </view>
          <view class="footprint-page__count-row">
            <text class="footprint-page__count">{{ summary?.placeCount || 0 }}</text>
            <text class="footprint-page__count-unit">个共同去过的地方</text>
          </view>
          <text class="footprint-page__hero-note">把一起走过的地方，慢慢留在地图上</text>
        </view>
        <wd-button size="small" round icon="add" @click="goAdd">新增足迹</wd-button>
        <!-- 路线装饰只用于营造旅行手账感，不承载点击或业务信息。 -->
        <view class="footprint-page__hero-route">
          <view class="footprint-page__route-dot footprint-page__route-dot--start" />
          <view class="footprint-page__route-line" />
          <view class="footprint-page__route-dot footprint-page__route-dot--end" />
        </view>
      </view>

      <!-- 地图与列表是同一份足迹的两种视角，切换器紧贴内容区域。 -->
      <view class="footprint-page__switcher">
        <wd-segmented
          v-model:value="modeLabel"
          :options="modeOptions"
          size="large"
          :vibrate-short="true"
          @change="onModeChange"
        />
      </view>

      <!-- 未去过的地点也能导航，独立于新增足迹，避免为导航伪造游玩记录。 -->
      <view class="footprint-page__navigation">
        <view class="footprint-page__navigation-mark"><text>↗</text></view>
        <view class="footprint-page__navigation-copy">
          <text class="footprint-page__navigation-title">准备去一个新地方？</text>
          <text class="footprint-page__navigation-hint">选择目的地后打开微信地图，不会保存为足迹</text>
        </view>
        <FootprintNavigationButton />
      </view>

      <!-- 空记录卡片只用于列表；地图模式不能因零记录而隐藏地图。 -->
      <view
        v-if="mode === 'list' && entries.length === 0 && !mapError && !listError"
        class="footprint-page__empty"
      >
        <wd-icon name="location" size="76rpx" color="#43C89A" />
        <text class="footprint-page__empty-title">还没有共同足迹</text>
        <text class="footprint-page__empty-copy">去记录第一个一起玩过的地方吧。</text>
        <wd-button round @click="goAdd">记录第一个地方</wd-button>
      </view>

      <template v-else-if="mode === 'map'">
        <view v-if="mapError" class="footprint-page__panel-error">
          <text>地图暂时无法显示，你仍可以查看时间列表。</text>
          <wd-button size="small" variant="plain" @click="reload">重试地图</wd-button>
        </view>
        <view v-if="!mapError || markerResult.markers.length > 0" class="footprint-page__map-shell">
          <view class="footprint-page__map-heading">
            <view class="footprint-page__section-copy">
              <text class="footprint-page__section-title">足迹地图</text>
              <text class="footprint-page__section-note">点亮我们一起去过的每一站</text>
            </view>
            <text class="footprint-page__map-badge">
              {{ summary?.placeCount || 0 }} 处 · {{ hikes.length }} 次徒步
            </text>
          </view>
          <map
            id="footprint-map"
            class="footprint-page__map"
            :latitude="mapCenter.latitude"
            :longitude="mapCenter.longitude"
            :markers="visibleMarkers"
            :include-points="includePoints"
            :show-location="false"
            @markertap="onMarkerTap"
            @callouttap="onMarkerTap"
            @error="onMapError"
          />
          <!-- 首次记录引导放在地图下方，始终保留完整的地图拖动与缩放区域。 -->
          <view
            v-if="summary?.placeCount === 0 && hikes.length === 0 && !mapError && !listError"
            class="footprint-page__map-guide"
          >
            <view class="footprint-page__guide-copy">
              <text class="footprint-page__guide-title">从第一站开始</text>
              <text class="footprint-page__guide-note">记录一个一起玩过的地方吧</text>
            </view>
            <wd-button size="small" round @click="goAdd">记录第一个地方</wd-button>
          </view>
        </view>
        <view v-if="selectedPlace" class="footprint-page__place-card">
          <view class="footprint-page__place-copy">
            <text class="footprint-page__place-name">{{ selectedPlace.place.name }}</text>
            <text class="footprint-page__place-meta">
              去过 {{ selectedPlace.visitCount }} 次 · 最近
              {{ formatFootprintVisitDate(selectedPlace.latestEntry.visitedAt) }}
            </text>
          </view>
          <!-- 操作另起一行，长地点名称和两个按钮在窄屏仍可完整显示。 -->
          <view class="footprint-page__place-actions">
            <FootprintNavigationButton :place="selectedPlace.place" />
            <wd-button size="small" variant="plain" @click="openPlaceHistory(selectedPlace.placeKey)">
              查看回忆
            </wd-button>
          </view>
        </view>
      </template>

      <template v-else>
        <view v-if="summary?.placeCount" class="footprint-page__list-heading">
          <view class="footprint-page__section-copy">
            <text class="footprint-page__section-title">回忆清单</text>
            <text class="footprint-page__section-note">按时间翻看我们一起留下的故事</text>
          </view>
        </view>
        <view v-if="filterPlaceKey" class="footprint-page__filter">
          <text>{{ selectedPlace?.place.name || '这个地点' }}的全部回忆</text>
          <wd-button size="small" variant="plain" @click="clearPlaceHistory">查看全部地点</wd-button>
        </view>
        <view v-if="listError" class="footprint-page__panel-error">
          <text>{{ listError }}</text>
          <wd-button size="small" variant="plain" @click="reload">重新加载</wd-button>
        </view>
        <view v-if="pending.entries && entries.length === 0" class="footprint-page__panel-error">
          <wd-loading color="#267A5A" />
          <text>正在加载足迹</text>
        </view>
        <FootprintTimeline v-else :entries="displayEntries" :photo-urls="photoUrls" @press="goDetail" />
        <wd-button v-if="entriesCursor" block variant="plain" :loading="pending.entries" @click="loadMore">
          加载更多
        </wd-button>
      </template>
    </view>

    <wd-popup
      v-model="historyNoticeOpen"
      position="center"
      custom-style="border-radius: 24rpx; width: 620rpx;"
    >
      <view class="footprint-page__notice">
        <wd-icon name="info-circle" size="64rpx" color="#267A5A" />
        <text class="footprint-page__notice-title">这里还有以前的足迹</text>
        <text class="footprint-page__notice-copy">
          你将看到这个家庭此前保存的足迹，也可以一起修改和整理。
        </text>
        <wd-button block round @click="confirmHistoryNotice">我知道了</wd-button>
      </view>
    </wd-popup>

    <!-- 地图页保留原有顶部新增按钮，同时提供跨业务公共入口。 -->
    <GlobalQuickAdd
      :visible="Boolean(household) && !checkingHome && !pageError"
      :blocked="historyNoticeOpen"
      with-tab-bar
    />
    <AppTabBar active="footprint" />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { onLoad, onReady, onShow } from '@dcloudio/uni-app'
import AppTabBar from '../../components/AppTabBar.vue'
import FootprintNavigationButton from '../../components/FootprintNavigationButton.vue'
import GlobalQuickAdd from '../../components/GlobalQuickAdd.vue'
import FootprintTimeline from './components/FootprintTimeline.vue'
import { useAuthStore } from '../../store/modules/auth'
import { useHouseholdStore } from '../../store/modules/household'
import { useFootprintStore } from '../../store/modules/footprint'
import { buildFootprintMarkers, formatFootprintVisitDate, type FootprintViewMode } from './footprint-view'

const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const footprintStore = useFootprintStore()
const { household } = storeToRefs(householdStore)
const {
  summary,
  places,
  entries,
  hikes,
  entriesCursor,
  phase,
  pending,
  mapError,
  listError,
  showPreJoinHistoryNotice,
} = storeToRefs(footprintStore)

const mode = ref<FootprintViewMode>('map')
const checkingHome = ref(false)
const pageError = ref('')
const modeOptions = ['地图', '列表']
const modeLabel = ref('地图')
const selectedPlaceKey = ref('')
const filterPlaceKey = ref('')
const photoUrls = ref<Record<string, string>>({})
const historyNoticeOpen = ref(false)
const initialPlaceKey = ref('')
const markerResult = computed(() => buildFootprintMarkers(places.value, hikes.value))
const visibleMarkers = computed(() =>
  markerResult.value.markers.length > 50 ? [] : markerResult.value.markers,
)
const includePoints = computed(() =>
  markerResult.value.markers.map((item) => ({ latitude: item.latitude, longitude: item.longitude })),
)
const mapCenter = computed(() => markerResult.value.markers[0] || { latitude: 23.1291, longitude: 113.2644 })
const selectedPlace = computed(
  () => places.value.find((item) => item.placeKey === selectedPlaceKey.value) || null,
)
const displayEntries = computed(() =>
  filterPlaceKey.value
    ? entries.value.filter((entry) => entry.entryKind !== 'hike' && entry.placeKey === filterPlaceKey.value)
    : entries.value,
)

watch(
  showPreJoinHistoryNotice,
  (value) => {
    historyNoticeOpen.value = value
  },
  { immediate: true },
)
watch(
  [places, hikes, mode],
  () => {
    void syncMarkerCluster()
  },
  { deep: true },
)

/** 50 个以上地点交给微信地图原生聚合，避免大量重叠标记拖慢页面。 */
async function syncMarkerCluster(): Promise<void> {
  if (markerResult.value.markers.length <= 50 || mode.value !== 'map') return
  await nextTick()
  const context = uni.createMapContext('footprint-map')
  context.initMarkerCluster({
    enableDefaultStyle: true,
    zoomOnClick: true,
    gridSize: 60,
    success: () => context.addMarkers({ markers: markerResult.value.markers, clear: true, fail: onMapError }),
    fail: onMapError,
  })
}

async function hydrateCovers(): Promise<void> {
  const version = footprintStore.contextVersion
  const covers = entries.value
    .map((entry) => entry.coverPhoto)
    .filter((photo): photo is NonNullable<typeof photo> => Boolean(photo))
  const loaded = await footprintStore.hydratePhotoUrls(covers)
  if (version === footprintStore.contextVersion) photoUrls.value = { ...photoUrls.value, ...loaded }
}

async function loadPage(): Promise<void> {
  if (checkingHome.value) return
  checkingHome.value = true
  pageError.value = ''
  try {
    if (!authStore.hasCompletedLogin) {
      footprintStore.resetFootprintStore()
      uni.reLaunch({ url: '/pages/login/index' })
      return
    }
    await authStore.restore()
    const route = authStore.consumeNavigationIntent()
    if (authStore.errorMessage) {
      pageError.value = authStore.errorMessage
      return
    }
    if (route && route.url !== '/pages/index/index') {
      footprintStore.resetFootprintStore()
      uni.reLaunch({ url: route.url })
      return
    }
    const result = await householdStore.loadCurrent({ preserveExisting: true })
    if (result?.status === 'NO_HOME') {
      footprintStore.resetFootprintStore()
      photoUrls.value = {}
      uni.reLaunch({ url: '/subpackages/household/create-home/index' })
      return
    }
    if (result?.status !== 'HOME') {
      pageError.value = '暂时无法确认家庭信息，请重试'
      return
    }
    if (footprintStore.householdId !== result.household.id) {
      photoUrls.value = {}
      selectedPlaceKey.value = ''
      filterPlaceKey.value = ''
    }
    footprintStore.setHouseholdContext(result.household.id)
    footprintStore.listPlaceKey = filterPlaceKey.value
    await footprintStore.loadOverview(true)
    if (initialPlaceKey.value) {
      await openPlaceHistory(initialPlaceKey.value)
      initialPlaceKey.value = ''
    }
    await hydrateCovers()
    historyNoticeOpen.value = footprintStore.showPreJoinHistoryNotice
    if (footprintStore.mapError && !footprintStore.listError) {
      mode.value = 'list'
      modeLabel.value = '列表'
    }
  } finally {
    checkingHome.value = false
  }
}

function goAdd(): void {
  uni.navigateTo({ url: '/subpackages/footprint/footprint-form/index' })
}
function goDetail(entryId: string): void {
  const entry = entries.value.find((item) => item.id === entryId)
  const url =
    entry?.entryKind === 'hike'
      ? `/subpackages/hiking/hiking-detail/index?entryId=${entryId}`
      : `/subpackages/footprint/footprint-detail/index?entryId=${entryId}`
  uni.navigateTo({ url })
}
async function openPlaceHistory(placeKey: string): Promise<void> {
  filterPlaceKey.value = placeKey
  mode.value = 'list'
  modeLabel.value = '列表'
  await footprintStore.loadEntries(placeKey)
  await hydrateCovers()
}
async function clearPlaceHistory(): Promise<void> {
  filterPlaceKey.value = ''
  await footprintStore.loadEntries()
  await hydrateCovers()
}
async function selectMode(value: FootprintViewMode): Promise<void> {
  mode.value = value
  modeLabel.value = value === 'map' ? '地图' : '列表'
  if (value === 'map' && filterPlaceKey.value) await clearPlaceHistory()
}
function onModeChange(option: { value?: string } | string): void {
  const value = typeof option === 'string' ? option : option.value
  void selectMode(value === '列表' ? 'list' : 'map')
}
function onMarkerTap(event: { detail: { markerId: number } }): void {
  const target = markerResult.value.markerTargets[event.detail.markerId]
  if (target?.kind === 'hike') {
    uni.navigateTo({ url: `/subpackages/hiking/hiking-detail/index?entryId=${target.entryId}` })
    return
  }
  selectedPlaceKey.value = target?.kind === 'place' ? target.placeKey : ''
}
function onMapError(): void {
  footprintStore.mapError = '地图暂时无法显示'
  mode.value = 'list'
  modeLabel.value = '列表'
}
async function loadMore(): Promise<void> {
  await footprintStore.loadMoreEntries()
  await hydrateCovers()
}
async function reload(): Promise<void> {
  await footprintStore.loadOverview(true)
  await hydrateCovers()
}
async function confirmHistoryNotice(): Promise<void> {
  await footprintStore.acknowledgeHistoryNotice()
  historyNoticeOpen.value = footprintStore.showPreJoinHistoryNotice
}

onShow(() => {
  void loadPage()
})
onLoad((options) => {
  initialPlaceKey.value = typeof options?.placeKey === 'string' ? options.placeKey : ''
})
onReady(() => {
  void syncMarkerCluster()
})
</script>

<style lang="scss" scoped>
.footprint-page {
  min-height: 100vh;
  padding: 22rpx 28rpx 180rpx;
  box-sizing: border-box;
  background: $brand-color-background;

  &__state {
    display: flex;
    min-height: 70vh;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  &__state-title {
    margin-top: 24rpx;
    color: $brand-color-text;
    font-size: 34rpx;
    font-weight: 700;
  }
  &__state-copy {
    margin: 14rpx 0 30rpx;
    color: $brand-color-text-secondary;
    font-size: 26rpx;
  }
  // 页面内容以轻微上浮进入，强化从顶部概览到地图主体的阅读顺序。
  &__content {
    display: flex;
    flex-direction: column;
    gap: 20rpx;
    animation: footprint-rise 0.32s ease-out both;
  }

  // 顶部概览使用浅绿色纸张感，不额外引入图片或外部字体。
  &__hero {
    position: relative;
    display: flex;
    min-height: 190rpx;
    align-items: flex-start;
    justify-content: space-between;
    gap: 20rpx;
    overflow: hidden;
    padding: 30rpx 26rpx;
    border: 1rpx solid rgba(38, 122, 90, 0.14);
    border-radius: 30rpx;
    background: #effbf5;
  }
  &__hero-copy {
    position: relative;
    z-index: 1;
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
  }
  &__eyebrow-row {
    display: flex;
    align-items: center;
    gap: 10rpx;
  }
  &__eyebrow-dot {
    width: 12rpx;
    height: 12rpx;
    border-radius: 50%;
    background: $brand-color-primary;
  }
  &__eyebrow {
    color: $brand-color-primary;
    font-size: 22rpx;
    font-weight: 600;
    letter-spacing: 3rpx;
  }
  &__count-row {
    display: flex;
    align-items: baseline;
    gap: 12rpx;
    margin-top: 14rpx;
  }
  &__count {
    color: $brand-color-text;
    font-size: 58rpx;
    font-weight: 700;
    line-height: 1;
  }
  &__count-unit {
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 600;
  }
  &__hero-note {
    margin-top: 18rpx;
    color: $brand-color-text-secondary;
    font-size: 22rpx;
    line-height: 1.5;
  }
  &__hero-route {
    position: absolute;
    right: 28rpx;
    bottom: 18rpx;
    display: flex;
    width: 150rpx;
    align-items: center;
    opacity: 0.36;
    pointer-events: none;
    transform: rotate(-8deg);
  }
  &__route-line {
    flex: 1;
    height: 0;
    border-top: 2rpx dashed $brand-color-primary;
  }
  &__route-dot {
    width: 12rpx;
    height: 12rpx;
    border: 3rpx solid $brand-color-primary;
    border-radius: 50%;
    background: #effbf5;
    &--end {
      width: 18rpx;
      height: 18rpx;
      background: $brand-color-primary;
    }
  }

  // 模式切换器用单独底板收边，避免与顶部卡片和地图粘连。
  &__switcher {
    padding: 6rpx;
    border: 1rpx solid rgba(38, 122, 90, 0.08);
    border-radius: 18rpx;
    background: rgba(255, 255, 255, 0.74);
  }

  // 导航是独立的出发动作，弱于新增足迹，但比说明文字更容易识别。
  &__navigation {
    display: flex;
    align-items: center;
    gap: 16rpx;
    padding: 22rpx;
    border: 1rpx solid rgba(38, 122, 90, 0.1);
    border-radius: 24rpx;
    background: $brand-color-surface;
    box-shadow: 0 8rpx 24rpx rgba(38, 90, 70, 0.05);
  }
  &__navigation-mark {
    display: flex;
    width: 56rpx;
    height: 56rpx;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 18rpx;
    background: #e2f7ed;
    color: $brand-color-primary;
    font-size: 30rpx;
    font-weight: 700;
  }
  &__navigation-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 5rpx;
  }
  &__navigation-title {
    color: $brand-color-text;
    font-size: 25rpx;
    font-weight: 700;
  }
  &__navigation-hint {
    color: $brand-color-text-secondary;
    font-size: 20rpx;
    line-height: 1.45;
  }

  // 地图作为页面主视觉，标题、地图和首次引导统一收进同一块内容区域。
  &__map-shell {
    overflow: hidden;
    border: 1rpx solid rgba(38, 122, 90, 0.1);
    border-radius: 30rpx;
    background: $brand-color-surface;
  }
  &__map-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18rpx;
    padding: 24rpx 24rpx 20rpx;
  }
  &__section-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 6rpx;
  }
  &__section-title {
    color: $brand-color-text;
    font-size: 29rpx;
    font-weight: 700;
  }
  &__section-note {
    color: $brand-color-text-secondary;
    font-size: 21rpx;
    line-height: 1.45;
  }
  &__map-badge {
    flex: 0 0 auto;
    padding: 8rpx 15rpx;
    border-radius: 999rpx;
    background: #e7f7ef;
    color: $brand-color-primary;
    font-size: 21rpx;
    font-weight: 600;
  }
  &__map {
    width: 100%;
    height: 620rpx;
    overflow: hidden;
  }
  &__map-guide {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 18rpx;
    padding: 22rpx 24rpx 24rpx;
    border-top: 1rpx solid rgba(38, 122, 90, 0.08);
  }
  &__guide-copy {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }
  &__guide-title {
    color: $brand-color-text;
    font-size: 25rpx;
    font-weight: 700;
  }
  &__guide-note {
    color: $brand-color-text-secondary;
    font-size: 21rpx;
  }

  // 选中地点单独突出，避免与地图内标记和首次引导混淆。
  &__place-card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 18rpx;
    padding: 24rpx;
    border-left: 7rpx solid $brand-color-primary;
    border-radius: 22rpx;
    background: $brand-color-surface;
    box-shadow: 0 8rpx 24rpx rgba(38, 90, 70, 0.05);
  }
  &__place-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 18rpx;
  }
  &__list-heading {
    padding: 12rpx 4rpx 4rpx;
  }
  &__filter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
    padding: 18rpx 22rpx;
    border-radius: 18rpx;
    background: #effbf5;
    color: $brand-color-text;
    font-size: 25rpx;
  }
  &__place-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 8rpx;
  }
  &__place-name {
    color: $brand-color-text;
    font-size: 30rpx;
    font-weight: 700;
  }
  &__place-meta {
    color: $brand-color-text-secondary;
    font-size: 23rpx;
  }
  &__empty,
  &__panel-error {
    display: flex;
    min-height: 380rpx;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 22rpx;
    padding: 40rpx;
    border: 1rpx solid rgba(38, 122, 90, 0.08);
    border-radius: 30rpx;
    background: $brand-color-surface;
    color: $brand-color-text-secondary;
    text-align: center;
  }
  &__empty-title {
    color: $brand-color-text;
    font-size: 32rpx;
    font-weight: 700;
  }
  &__empty-copy {
    color: $brand-color-text-secondary;
    font-size: 25rpx;
  }
  &__notice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 22rpx;
    padding: 48rpx 38rpx 38rpx;
    text-align: center;
  }
  &__notice-title {
    color: $brand-color-text;
    font-size: 34rpx;
    font-weight: 700;
  }
  &__notice-copy {
    color: $brand-color-text-secondary;
    font-size: 26rpx;
    line-height: 1.7;
  }

  // 动画放在页面区块内，确保样式仍遵循项目的单一 BEM 区块约束。
  @keyframes footprint-rise {
    from {
      opacity: 0;
      transform: translateY(10rpx);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
}
</style>
