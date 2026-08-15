<template>
  <view class="task-detail-page">
    <wd-toast />

    <view v-if="!detail && !loadError" class="task-detail-page__state" data-testid="task-detail-loading">
      <wd-loading color="#267A5A" size="44rpx" />
      <text class="task-detail-page__state-title">正在读取事项</text>
    </view>

    <view v-else-if="loadError" class="task-detail-page__state" data-testid="task-detail-error">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="task-detail-page__state-title">暂时无法读取</text>
      <text class="task-detail-page__state-copy">{{ loadError }}</text>
      <wd-button block round variant="plain" :loading="isLoading" @click="reload">重新加载</wd-button>
    </view>

    <view v-else-if="detail" class="task-detail-page__content" data-testid="task-detail-card">
      <view class="task-detail-page__header">
        <view class="task-detail-page__type-mark" :class="`task-detail-page__type-mark--${detail.type}`" />
        <view class="task-detail-page__title-block">
          <text class="task-detail-page__title">{{ detail.title }}</text>
          <text class="task-detail-page__meta">{{ typeLabel }} · {{ statusLine }}</text>
          <text class="task-detail-page__meta">截止：{{ dueLabel }}</text>
        </view>
      </view>

      <view v-if="detail.note" class="task-detail-page__note">
        <text class="task-detail-page__note-label">备注</text>
        <text class="task-detail-page__note-text">{{ detail.note }}</text>
      </view>

      <text v-if="storeError" class="task-detail-page__error" data-testid="task-detail-error">{{ storeError }}</text>

      <view class="task-detail-page__actions">
        <wd-button
          v-if="availability.claim"
          block
          type="primary"
          :loading="isClaiming"
          :disabled="isAnyBusy"
          data-testid="task-detail-claim"
          @click="onClaim"
        >
          我来处理
        </wd-button>
        <wd-button
          v-if="availability.complete"
          block
          :type="availability.claim ? 'primary' : 'primary'"
          :loading="isCompleting"
          :disabled="isAnyBusy"
          data-testid="task-detail-complete"
          @click="onComplete"
        >
          完成
        </wd-button>
        <wd-button
          v-if="availability.abandon"
          block
          variant="plain"
          :loading="isAbandoning"
          :disabled="isAnyBusy"
          data-testid="task-detail-abandon"
          @click="onAbandon"
        >
          放弃
        </wd-button>
      </view>

      <view v-if="detail.events.length" class="task-detail-page__events">
        <text class="task-detail-page__events-title">操作记录</text>
        <view
          v-for="(event, idx) in detail.events"
          :key="`${event.kind}-${event.at}-${idx}`"
          class="task-detail-page__event"
          data-testid="task-detail-event"
        >
          <text class="task-detail-page__event-text">{{ describeEventLine(event) }}</text>
          <text class="task-detail-page__event-time">{{ formatTime(event.at) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useTaskStore } from '../../../store/modules/task'
import {
  describeAbandonConfirmMessage,
  describeActions,
  describeDueLabel,
  describeEventLine,
  describeStatusLine,
} from './task-detail-view'
import { todayIso } from '../add-task/add-task-view'
import { TASK_TYPES_DISPLAY } from '../add-task/add-task-view'

const taskStore = useTaskStore()
const taskId = ref('')
const loadError = ref('')
const isLoading = computed(() => taskStore.phase === 'checking')
const isClaiming = computed(() => taskStore.phase === 'claiming')
const isCompleting = computed(() => taskStore.phase === 'completing')
const isAbandoning = computed(() => taskStore.phase === 'abandoning')
const isAnyBusy = computed(() => isClaiming.value || isCompleting.value || isAbandoning.value)
const detail = computed(() => taskStore.detail)
const availability = computed(() => describeActions(detail.value))
const statusLine = computed(() => describeStatusLine(detail.value))
const today = todayIso()
const dueLabel = computed(() => detail.value ? describeDueLabel(detail.value, today) : '')
const typeLabel = computed(() => {
  if (!detail.value) return ''
  const opt = TASK_TYPES_DISPLAY.find((item) => item.value === detail.value!.type)
  return opt ? opt.label : ''
})
const storeError = computed(() => {
  if (isAnyBusy.value) return ''
  return taskStore.errorMessage || ''
})

async function load(id: string): Promise<void> {
  loadError.value = ''
  await taskStore.loadDetail(id)
  if (!taskStore.detail) loadError.value = taskStore.errorMessage || '事项不存在或已被清理'
}

async function reload(): Promise<void> {
  if (taskId.value) await load(taskId.value)
}

async function onClaim(): Promise<void> {
  if (!taskId.value) return
  await taskStore.claim(taskId.value)
}

async function onComplete(): Promise<void> {
  if (!taskId.value) return
  await taskStore.complete(taskId.value)
  // 详情页终止后回到首页
  uni.reLaunch({ url: '/pages/index/index' })
}

async function onAbandon(): Promise<void> {
  if (!taskId.value) return
  // 二次确认（PRD 005 R14）
  const confirmed = await uni.showModal({
    title: '放弃这件事',
    content: describeAbandonConfirmMessage(detail.value),
    confirmText: '继续',
    confirmColor: '#d66b55',
  })
  if (!confirmed.confirm) return
  await taskStore.abandon(taskId.value)
  uni.reLaunch({ url: '/pages/index/index' })
}

function formatTime(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

onLoad((options) => {
  const id = (options as { taskId?: string })?.taskId || ''
  taskId.value = id
  if (id) void load(id)
})

onShow(() => {
  if (taskId.value && !detail.value && !isLoading.value) {
    void load(taskId.value)
  }
})
</script>

<style lang="scss" scoped>
.task-detail-page { min-height: 100vh; padding: 48rpx 32rpx 80rpx; box-sizing: border-box; background: $brand-color-background; }
.task-detail-page__state { display: flex; min-height: 60vh; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.task-detail-page__state-title { margin-top: 24rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 700; }
.task-detail-page__state-copy { margin-top: 12rpx; padding: 0 80rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.6; }
.task-detail-page__content { display: flex; flex-direction: column; }
.task-detail-page__header { display: flex; align-items: center; padding: 32rpx 28rpx; border: 2rpx solid $brand-color-border; border-radius: 22rpx; background: $brand-color-surface; }
.task-detail-page__type-mark { width: 14rpx; align-self: stretch; margin-right: 24rpx; border-radius: 8rpx; }
.task-detail-page__type-mark--low_stock { background: #d99833; }
.task-detail-page__type-mark--to_handle { background: #498469; }
.task-detail-page__type-mark--expiring { background: #c66b68; }
.task-detail-page__title-block { display: flex; flex: 1; flex-direction: column; gap: 8rpx; }
.task-detail-page__title { color: $brand-color-text; font-size: 36rpx; font-weight: 700; line-height: 1.3; }
.task-detail-page__meta { color: $brand-color-text-secondary; font-size: 25rpx; }
.task-detail-page__note { margin-top: 24rpx; padding: 24rpx 28rpx; border-radius: 18rpx; background: $brand-color-surface; }
.task-detail-page__note-label { display: block; color: $brand-color-text-secondary; font-size: 23rpx; }
.task-detail-page__note-text { display: block; margin-top: 8rpx; color: $brand-color-text; font-size: 28rpx; line-height: 1.6; }
.task-detail-page__error { display: block; margin: 20rpx 0; color: #c5684d; font-size: 25rpx; text-align: center; }
.task-detail-page__actions { display: flex; flex-direction: column; gap: 16rpx; margin-top: 32rpx; }
.task-detail-page__events { margin-top: 40rpx; padding: 24rpx 28rpx; border-radius: 18rpx; background: $brand-color-surface; }
.task-detail-page__events-title { display: block; color: $brand-color-text-secondary; font-size: 23rpx; }
.task-detail-page__event { display: flex; justify-content: space-between; align-items: center; margin-top: 16rpx; padding-bottom: 16rpx; border-bottom: 1rpx solid $brand-color-border; }
.task-detail-page__event:last-child { border-bottom: 0; padding-bottom: 0; }
.task-detail-page__event-text { color: $brand-color-text; font-size: 26rpx; }
.task-detail-page__event-time { color: $brand-color-text-secondary; font-size: 22rpx; }
</style>
