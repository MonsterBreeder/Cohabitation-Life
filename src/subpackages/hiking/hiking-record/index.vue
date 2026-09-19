<template>
  <view class="hiking-record">
    <view class="hiking-record__header">
      <view class="hiking-record__header-mark">
        <wd-icon name="location" size="34rpx" color="#FFFFFF" />
      </view>
      <view class="hiking-record__header-copy">
        <text class="hiking-record__eyebrow">现场记录</text>
        <text class="hiking-record__title">把今天走过的路留下来</text>
      </view>
    </view>

    <view class="hiking-record__map-shell">
      <HikingLiveMap :segments="tracker.segments" />
      <view v-if="tracker.status === 'recording'" class="hiking-record__live">
        <view class="hiking-record__live-dot" />
        <text>记录中</text>
      </view>
    </view>

    <view class="hiking-record__metrics">
      <view class="hiking-record__metric hiking-record__metric--primary">
        <wd-icon name="mind-mapping" size="32rpx" color="#267A5A" />
        <text class="hiking-record__metric-value">{{ distanceText }}</text>
        <text class="hiking-record__metric-label">公里</text>
      </view>
      <view class="hiking-record__metric">
        <wd-icon name="clock-circle" size="32rpx" color="#BA564B" />
        <text class="hiking-record__metric-value">{{ durationText }}</text>
        <text class="hiking-record__metric-label">有效时长</text>
      </view>
      <view class="hiking-record__metric">
        <wd-icon name="pushpin" size="32rpx" color="#D49A27" />
        <text class="hiking-record__metric-value">{{ pointCount }}</text>
        <text class="hiking-record__metric-label">有效点</text>
      </view>
    </view>

    <view class="hiking-record__status" :class="`hiking-record__status--${tracker.signal}`">
      <wd-icon :name="statusIcon" size="34rpx" color="#267A5A" />
      <text>{{ statusText }}</text>
    </view>

    <view v-if="errorMessage" class="hiking-record__error">
      <wd-icon name="close-circle" size="36rpx" color="#BA564B" />
      <view class="hiking-record__error-copy">
        <text>{{ errorMessage }}</text>
        <view class="hiking-record__error-actions">
          <text @click="openSettings">去授权</text>
          <text @click="goManual">改为补录</text>
        </view>
      </view>
    </view>

    <view class="hiking-record__controls" :class="{ 'hiking-record__controls--split': splitControls }">
      <wd-button
        v-if="tracker.status === 'idle'"
        block
        size="large"
        icon="play-circle"
        :loading="starting"
        @click="start"
      >
        开始徒步
      </wd-button>
      <template v-else-if="tracker.status !== 'ended'">
        <wd-button
          v-if="tracker.status === 'recording'"
          block
          size="large"
          type="primary"
          variant="plain"
          icon="pause-circle"
          @click="pause"
        >
          暂停
        </wd-button>
        <wd-button
          v-else
          block
          size="large"
          type="primary"
          variant="base"
          icon="play-circle"
          :loading="starting"
          @click="start"
        >
          继续记录
        </wd-button>
        <wd-button block size="large" type="warning" variant="plain" icon="stop" @click="confirmFinish">
          结束并整理
        </wd-button>
      </template>
      <wd-button v-else block size="large" icon="edit" @click="openForm">继续整理并保存</wd-button>
    </view>

    <view v-if="canAbort" class="hiking-record__abort">
      <wd-button
        block
        size="large"
        type="danger"
        variant="base"
        icon="close-circle"
        custom-style="background: #ba564b; color: #ffffff"
        @click="confirmAbort"
      >
        中止并放弃本次记录
      </wd-button>
    </view>

    <view class="hiking-record__privacy">
      <wd-icon name="lock" size="30rpx" color="#74847D" />
      <text>保存前路线只留在这台手机，不会实时共享给另一位成员。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { onBackPress, onHide, onUnload } from '@dcloudio/uni-app'
import HikingLiveMap from '../components/HikingLiveMap.vue'
import {
  canAbortRecording,
  formatRecordingDuration,
  recordingStatusIcon,
  recordingStatusText,
} from './hiking-record-view'
import { useHikingRecorder } from './useHikingRecorder'

const {
  tracker,
  activeSeconds,
  route,
  metrics,
  starting,
  errorMessage,
  begin,
  pause,
  interrupt,
  finish,
  discard,
  dispose,
} = useHikingRecorder()
const leaving = { allowed: false }

const durationText = computed(() => formatRecordingDuration(activeSeconds.value))
const distanceText = computed(() => ((metrics.value.distanceMeters ?? 0) / 1000).toFixed(2))
const pointCount = computed(() =>
  tracker.value.segments.reduce((total, segment) => total + segment.points.length, 0),
)
const statusText = computed(() => recordingStatusText(tracker.value))
const statusIcon = computed(() => recordingStatusIcon(tracker.value))
const canAbort = computed(() => canAbortRecording(tracker.value))
const splitControls = computed(() => tracker.value.status !== 'idle' && tracker.value.status !== 'ended')

/** 只有用户主动点击才请求连续定位，进入页面和恢复草稿都不会自动启动。 */
async function start(): Promise<void> {
  await begin()
}

function openSettings(): void {
  uni.openSetting({})
}

function goManual(): void {
  interrupt()
  leaving.allowed = true
  uni.redirectTo({ url: '/subpackages/hiking/hiking-form/index' })
}

function openForm(): void {
  leaving.allowed = true
  uni.redirectTo({ url: '/subpackages/hiking/hiking-form/index?tracking=1' })
}

function confirmFinish(): void {
  const routeWarning = route.value ? '' : '当前还没有形成有效路线，结束后可以选择地点并补充记录。'
  uni.showModal({
    title: '结束这次徒步？',
    content: routeWarning || '结束后可以补充名称、地点、照片和感受。',
    confirmText: '结束',
    success: (result) => {
      if (!result.confirm) return
      finish()
      openForm()
    },
  })
}

/** 页面始终提供明确的中止入口；二次确认后只删除本机草稿，不会产生共同记录。 */
function confirmAbort(): void {
  uni.showModal({
    title: '中止并放弃这次记录？',
    content: '本机保存的路线和时间会被清除，且无法恢复。',
    confirmText: '确认中止',
    confirmColor: '#BA564B',
    success: (result) => {
      if (!result.confirm) return
      discard()
      leaving.allowed = true
      uni.navigateBack()
    },
  })
}

function requestLeave(): void {
  uni.showActionSheet({
    itemList: ['继续记录', '暂存并退出', '放弃本次记录'],
    success: (result) => {
      if (result.tapIndex === 0) return
      if (result.tapIndex === 1) {
        interrupt()
        leaving.allowed = true
        uni.navigateBack()
        return
      }
      confirmAbort()
    },
  })
}

onBackPress(() => {
  if (leaving.allowed || tracker.value.status === 'idle') return false
  requestLeave()
  return true
})
onHide(() => {
  if (!leaving.allowed) interrupt()
})
onUnload(() => {
  dispose()
})
</script>

<style lang="scss" scoped>
.hiking-record {
  min-height: 100vh;
  padding: 28rpx 28rpx 64rpx;
  box-sizing: border-box;
  background: $brand-color-background;

  &__header {
    display: flex;
    align-items: center;
    gap: 18rpx;
    padding: 10rpx 4rpx 24rpx;
  }

  &__header-mark {
    display: flex;
    width: 68rpx;
    height: 68rpx;
    align-items: center;
    justify-content: center;
    border-radius: 22rpx 22rpx 22rpx 6rpx;
    background: $brand-color-action;
    box-shadow: 0 10rpx 24rpx rgba(38, 122, 90, 0.22);
  }

  &__header-copy {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }

  &__eyebrow {
    color: $brand-color-action;
    font-size: 21rpx;
    font-weight: 700;
    letter-spacing: 4rpx;
  }

  &__title {
    color: $brand-color-text;
    font-size: 34rpx;
    font-weight: 800;
  }

  &__map-shell {
    position: relative;
    overflow: hidden;
    min-height: 420rpx;
    border-radius: 34rpx;
    background: #eaf6f0;
    box-shadow: 0 16rpx 38rpx rgba(38, 90, 70, 0.08);
  }

  &__live {
    position: absolute;
    top: 20rpx;
    right: 20rpx;
    display: flex;
    align-items: center;
    gap: 8rpx;
    padding: 9rpx 16rpx;
    border-radius: 999rpx;
    background: rgba(255, 255, 255, 0.92);
    color: $brand-color-action;
    font-size: 20rpx;
    font-weight: 700;
  }

  &__live-dot {
    width: 12rpx;
    height: 12rpx;
    border-radius: 50%;
    background: $brand-color-primary;
    animation: hiking-record-blink 1.2s ease-in-out infinite;
  }

  &__metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12rpx;
    margin-top: 20rpx;
  }

  &__metric {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
    padding: 22rpx 8rpx;
    border-radius: 24rpx;
    background: $brand-color-surface;
  }

  &__metric--primary {
    background: #eef9f4;
  }

  &__metric-value {
    color: $brand-color-text;
    font-size: 30rpx;
    font-weight: 800;
  }

  &__metric-label {
    color: $brand-color-text-secondary;
    font-size: 19rpx;
  }

  &__status,
  &__error {
    display: flex;
    align-items: flex-start;
    gap: 12rpx;
    margin-top: 18rpx;
    padding: 20rpx 22rpx;
    border-radius: 20rpx;
    background: rgba(255, 255, 255, 0.8);
    color: $brand-color-text-secondary;
    font-size: 22rpx;
    line-height: 1.5;
  }

  &__status--good {
    color: $brand-color-action;
  }

  &__error {
    background: #fff0ec;
    color: #8f4138;
  }

  &__error-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 12rpx;
  }

  &__error-actions {
    display: flex;
    gap: 30rpx;
    color: $brand-color-action;
    font-weight: 700;
  }

  &__controls {
    margin-top: 28rpx;
  }

  &__controls--split {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16rpx;
  }

  &__abort {
    margin-top: 18rpx;
  }

  &__privacy {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    gap: 10rpx;
    margin-top: 24rpx;
    padding: 0 20rpx;
    color: $brand-color-text-secondary;
    font-size: 20rpx;
    line-height: 1.5;
  }

  @keyframes hiking-record-blink {
    50% {
      opacity: 0.35;
    }
  }
}
</style>
