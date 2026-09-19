<template>
  <view class="hiking-home">
    <view class="hiking-home__hero">
      <view class="hiking-home__mountains" aria-hidden="true">
        <view class="hiking-home__mountain" />
        <view class="hiking-home__mountain hiking-home__mountain--small" />
      </view>
      <view class="hiking-home__hero-topline">
        <text class="hiking-home__eyebrow">共同徒步</text>
        <view class="hiking-home__memory-tag">
          <wd-icon name="heart" size="24rpx" color="#BA564B" />
          <text>两个人的路线</text>
        </view>
      </view>
      <text class="hiking-home__title">今天，想一起走到哪里？</text>
      <text class="hiking-home__copy">现场记录脚下的路线，结束后再一起补上照片和感受。</text>
    </view>

    <view v-if="checkingHome" class="hiking-home__state">
      <wd-loading color="#267A5A" size="42rpx" />
      <text>正在加载徒步记录</text>
    </view>
    <view v-else-if="pageError" class="hiking-home__state">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text>{{ pageError }}</text>
      <wd-button size="small" variant="plain" @click="loadRecords">重新加载</wd-button>
    </view>

    <template v-else>
      <view class="hiking-home__start" @click="goRecord">
        <view class="hiking-home__start-icon">
          <wd-icon :name="recordingEntry.icon" size="58rpx" color="#267A5A" />
        </view>
        <view class="hiking-home__start-copy">
          <text class="hiking-home__start-kicker">{{ recordingEntry.kicker }}</text>
          <text class="hiking-home__start-title">{{ recordingEntry.title }}</text>
          <text class="hiking-home__start-note">{{ recordingEntry.note }}</text>
        </view>
        <view class="hiking-home__start-arrow">
          <wd-icon name="arrow-right" size="36rpx" color="#FFFFFF" />
        </view>
      </view>

      <view class="hiking-home__actions">
        <view class="hiking-home__action" @click="goManual">
          <view class="hiking-home__action-icon"><wd-icon name="edit" size="42rpx" color="#267A5A" /></view>
          <view class="hiking-home__action-copy">
            <text class="hiking-home__action-title">补录徒步</text>
            <text class="hiking-home__action-note">补上以前走过的路</text>
          </view>
        </view>
        <view class="hiking-home__action hiking-home__action--kml" @click="goImport">
          <view class="hiking-home__action-icon"><wd-icon name="folder" size="42rpx" color="#BA564B" /></view>
          <view class="hiking-home__action-copy">
            <text class="hiking-home__action-title">导入 KML</text>
            <text class="hiking-home__action-note">带回其他应用的路线</text>
          </view>
        </view>
      </view>

      <view class="hiking-home__records-heading">
        <text class="hiking-home__records-title">我们的徒步</text>
        <text class="hiking-home__records-count">{{ records.length }} 条</text>
      </view>
      <view v-if="loading" class="hiking-home__state">
        <wd-loading color="#267A5A" size="42rpx" />
        <text>正在加载徒步记录</text>
      </view>
      <view v-else-if="error" class="hiking-home__state">
        <text>{{ error }}</text>
        <wd-button size="small" variant="plain" @click="loadRecords">重新加载</wd-button>
      </view>
      <view v-else-if="records.length === 0" class="hiking-home__empty">
        <view class="hiking-home__empty-icon"><wd-icon name="pushpin" size="60rpx" color="#43C89A" /></view>
        <text class="hiking-home__empty-title">还没有共同徒步</text>
        <text class="hiking-home__empty-copy">从一次现场记录开始，留下你们的第一条路线。</text>
      </view>
      <view v-else class="hiking-home__list">
        <view
          v-for="record in records"
          :key="record.id"
          class="hiking-home__record"
          @click="goDetail(record.id)"
        >
          <view class="hiking-home__record-mark">
            <wd-icon name="location" size="38rpx" color="#267A5A" />
          </view>
          <view class="hiking-home__record-copy">
            <text class="hiking-home__record-title">{{ record.name || '未命名徒步' }}</text>
            <text class="hiking-home__record-meta">
              {{ hikingDateText(record) }} · {{ hikingPlaceText(record) }}
            </text>
          </view>
          <view class="hiking-home__record-result">
            <text>{{ hikingDistanceText(record) }}</text>
            <text>{{ record.hasRoute ? '有路线' : '无路线' }}</text>
          </view>
        </view>
        <wd-button
          v-if="cursor"
          block
          variant="plain"
          :loading="loading"
          @click="hikingStore.loadMoreRecords()"
        >
          加载更多
        </wd-button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'
import { onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '../../../store/modules/auth'
import { useHouseholdStore } from '../../../store/modules/household'
import { useHikingStore } from '../../../store/modules/hiking'
import type { HikingTrackerState } from '../../../types/hiking'
import {
  hikingDateText,
  hikingDistanceText,
  hikingPlaceText,
  hikingRecordingEntryText,
} from './hiking-home-view'
import { loadHikingRecordingDraft } from '../hiking-record/hiking-record-draft'

const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const hikingStore = useHikingStore()
const { records, cursor, phase, errorMessage } = storeToRefs(hikingStore)
const loading = computed(() => phase.value === 'loading')
const error = computed(() => errorMessage.value)
const checkingHome = shallowRef(true)
const pageError = shallowRef('')
const recordingDraft = shallowRef<HikingTrackerState | null>(null)
const recordingEntry = computed(() => hikingRecordingEntryText(recordingDraft.value))

/** 直接进入分包时也重新确认当前家庭，不能沿用可能过期的本机家庭编号。 */
async function loadRecords(): Promise<void> {
  checkingHome.value = true
  pageError.value = ''
  try {
    if (!authStore.hasCompletedLogin) {
      hikingStore.setHouseholdContext('')
      uni.reLaunch({ url: '/pages/login/index' })
      return
    }
    await authStore.restore()
    const result = await householdStore.loadCurrent({ preserveExisting: true })
    if (result?.status === 'NO_HOME') {
      hikingStore.setHouseholdContext('')
      uni.reLaunch({ url: '/subpackages/household/create-home/index' })
      return
    }
    if (result?.status !== 'HOME') {
      pageError.value = '暂时无法确认家庭信息，请重试'
      return
    }
    hikingStore.setHouseholdContext(result.household.id)
    await hikingStore.loadRecords()
  } finally {
    checkingHome.value = false
  }
}
function goManual(): void {
  uni.navigateTo({ url: '/subpackages/hiking/hiking-form/index' })
}
function goRecord(): void {
  uni.navigateTo({ url: '/subpackages/hiking/hiking-record/index' })
}
function goImport(): void {
  uni.navigateTo({ url: '/subpackages/hiking/hiking-form/index?import=1' })
}
function goDetail(entryId: string): void {
  uni.navigateTo({ url: `/subpackages/hiking/hiking-detail/index?entryId=${entryId}` })
}
onShow(() => {
  recordingDraft.value = loadHikingRecordingDraft()
  void loadRecords()
})
</script>

<style lang="scss" scoped>
.hiking-home {
  min-height: 100vh;
  padding: 28rpx 28rpx 80rpx;
  box-sizing: border-box;
  background: $brand-color-background;

  &__hero {
    position: relative;
    min-height: 260rpx;
    overflow: hidden;
    padding: 36rpx 34rpx;
    border-radius: 34rpx;
    background: #eaf8f1;
  }
  &__eyebrow {
    color: $brand-color-action;
    font-size: 22rpx;
    font-weight: 700;
    letter-spacing: 4rpx;
  }
  &__hero-topline {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__memory-tag {
    display: flex;
    align-items: center;
    gap: 7rpx;
    padding: 8rpx 14rpx;
    border-radius: 999rpx;
    background: rgba(255, 255, 255, 0.66);
    color: #8f5148;
    font-size: 19rpx;
  }
  &__title {
    display: block;
    max-width: 540rpx;
    margin-top: 16rpx;
    color: $brand-color-text;
    font-size: 40rpx;
    font-weight: 800;
    line-height: 1.35;
  }
  &__copy {
    display: block;
    max-width: 560rpx;
    margin-top: 18rpx;
    color: $brand-color-text-secondary;
    font-size: 23rpx;
    line-height: 1.65;
  }
  &__mountains {
    position: absolute;
    right: -30rpx;
    bottom: -30rpx;
    width: 260rpx;
    height: 150rpx;
    opacity: 0.13;
  }
  &__mountain {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 210rpx;
    height: 150rpx;
    background: $brand-color-action;
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
  }
  &__mountain--small {
    right: 150rpx;
    width: 120rpx;
    height: 90rpx;
  }
  &__start {
    display: flex;
    min-height: 154rpx;
    align-items: center;
    gap: 18rpx;
    margin-top: 22rpx;
    padding: 24rpx 22rpx;
    border-radius: 30rpx;
    background: $brand-color-action;
    box-shadow: 0 16rpx 34rpx rgba(38, 122, 90, 0.2);
    transition: transform 0.12s ease;
  }
  &__start:active {
    transform: scale(0.985);
  }
  &__start-icon {
    display: flex;
    width: 92rpx;
    height: 92rpx;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 28rpx 28rpx 28rpx 8rpx;
    background: #ffffff;
  }
  &__start-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 5rpx;
  }
  &__start-kicker {
    color: rgba(255, 255, 255, 0.7);
    font-size: 19rpx;
    letter-spacing: 2rpx;
  }
  &__start-title {
    color: #ffffff;
    font-size: 32rpx;
    font-weight: 800;
  }
  &__start-note {
    color: rgba(255, 255, 255, 0.78);
    font-size: 20rpx;
  }
  &__start-arrow {
    display: flex;
    width: 54rpx;
    height: 54rpx;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
  }
  &__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16rpx;
    margin-top: 18rpx;
  }
  &__action {
    display: flex;
    min-height: 168rpx;
    flex-direction: column;
    align-items: flex-start;
    gap: 14rpx;
    padding: 22rpx;
    border: 1rpx solid rgba(38, 122, 90, 0.1);
    border-radius: 26rpx;
    background: $brand-color-surface;
    box-shadow: 0 8rpx 22rpx rgba(38, 90, 70, 0.05);
    transition: transform 0.12s ease;
  }
  &__action:active {
    transform: scale(0.985);
  }
  &__action--kml {
    border-color: rgba(255, 143, 121, 0.18);
  }
  &__action-icon {
    display: flex;
    width: 66rpx;
    height: 66rpx;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 22rpx;
    background: #edf8f3;
  }
  &__action--kml &__action-icon {
    background: #fff2ee;
  }
  &__action-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 7rpx;
  }
  &__action-title {
    color: $brand-color-text;
    font-size: 29rpx;
    font-weight: 800;
  }
  &__action-note {
    color: $brand-color-text-secondary;
    font-size: 20rpx;
    line-height: 1.4;
  }
  &__records-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 42rpx 4rpx 18rpx;
  }
  &__records-title {
    color: $brand-color-text;
    font-size: 32rpx;
    font-weight: 800;
  }
  &__records-count {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
  }
  &__state {
    display: flex;
    min-height: 260rpx;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 18rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
  }
  &__empty {
    display: flex;
    min-height: 290rpx;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 2rpx dashed $brand-color-border;
    border-radius: 28rpx;
    background: rgba(255, 255, 255, 0.62);
    text-align: center;
  }
  &__empty-title {
    margin-top: 20rpx;
    color: $brand-color-text;
    font-size: 29rpx;
    font-weight: 800;
  }
  &__empty-icon {
    display: flex;
    width: 104rpx;
    height: 104rpx;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #eef9f4;
  }
  &__empty-copy {
    margin-top: 10rpx;
    color: $brand-color-text-secondary;
    font-size: 23rpx;
  }
  &__list {
    display: flex;
    flex-direction: column;
    gap: 14rpx;
  }
  &__record {
    display: flex;
    min-height: 108rpx;
    align-items: center;
    gap: 16rpx;
    padding: 20rpx 22rpx;
    border-radius: 22rpx;
    background: $brand-color-surface;
  }
  &__record-mark {
    display: flex;
    width: 66rpx;
    height: 66rpx;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 20rpx;
    background: #edf8f3;
  }
  &__record-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 7rpx;
  }
  &__record-title {
    overflow: hidden;
    color: $brand-color-text;
    font-size: 27rpx;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__record-meta {
    overflow: hidden;
    color: $brand-color-text-secondary;
    font-size: 21rpx;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__record-result {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    align-items: flex-end;
    gap: 7rpx;
    color: $brand-color-action;
    font-size: 21rpx;
    font-weight: 700;
  }
}
</style>
