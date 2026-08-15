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
      <!-- 头部：左侧色带 + 大标题 + chip 行 -->
      <view class="task-detail-page__header">
        <view class="task-detail-page__type-mark" :class="`task-detail-page__type-mark--${detail.type}`" />
        <view class="task-detail-page__title-block">
          <text class="task-detail-page__title">{{ detail.title }}</text>
          <view class="task-detail-page__chips">
            <text class="task-detail-page__chip task-detail-page__chip--type">
              {{ typeLabel }}
            </text>
            <text class="task-detail-page__chip task-detail-page__chip--status" :data-status="detail.status">
              {{ statusLine }}
            </text>
            <text v-if="dueLabel" class="task-detail-page__chip task-detail-page__chip--due">
              截止 {{ dueLabel }}
            </text>
          </view>
        </view>
      </view>

      <!-- 备注：薄卡片 -->
      <view v-if="detail.note" class="task-detail-page__note">
        <text class="task-detail-page__note-label">备注</text>
        <text class="task-detail-page__note-text">{{ detail.note }}</text>
      </view>

      <text v-if="storeError" class="task-detail-page__error" data-testid="task-detail-error">{{ storeError }}</text>

      <!-- 操作按钮：主操作大圆角渐变绿，放弃细描边珊瑚 -->
      <view class="task-detail-page__actions">
        <button
          v-if="availability.claim"
          class="task-detail-page__btn task-detail-page__btn--primary"
          :disabled="isAnyBusy"
          :data-loading="isClaiming"
          data-testid="task-detail-claim"
          @click="onClaim"
        >
          <wd-loading v-if="isClaiming" size="32rpx" color="#ffffff" />
          <text v-else class="task-detail-page__btn-text">我来处理</text>
        </button>
        <button
          v-if="availability.complete"
          class="task-detail-page__btn task-detail-page__btn--primary"
          :disabled="isAnyBusy"
          :data-loading="isCompleting"
          data-testid="task-detail-complete"
          @click="onComplete"
        >
          <wd-loading v-if="isCompleting" size="32rpx" color="#ffffff" />
          <text v-else class="task-detail-page__btn-text">完成</text>
        </button>
        <button
          v-if="availability.abandon"
          class="task-detail-page__btn task-detail-page__btn--ghost"
          :disabled="isAnyBusy"
          :data-loading="isAbandoning"
          data-testid="task-detail-abandon"
          @click="onAbandon"
        >
          <wd-loading v-if="isAbandoning" size="32rpx" color="#E78A7B" />
          <text v-else class="task-detail-page__btn-text task-detail-page__btn-text--ghost">放弃</text>
        </button>
      </view>

      <!-- 事件流：左侧色点（按 kind 区分），中间描述，右侧时间 -->
      <view v-if="detail.events.length" class="task-detail-page__events">
        <text class="task-detail-page__events-title">操作记录</text>
        <view
          v-for="(event, idx) in detail.events"
          :key="`${event.kind}-${event.at}-${idx}`"
          class="task-detail-page__event"
          data-testid="task-detail-event"
        >
          <view class="task-detail-page__event-row">
            <view class="task-detail-page__event-dot" :class="`task-detail-page__event-dot--${event.kind}`" />
            <text class="task-detail-page__event-text">{{ describeEventLine(event) }}</text>
          </view>
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
// TASK_TYPES_DISPLAY 来自主包 task-shared：分包可引用主包，反向引用会在主包编译时丢失路径。
import { TASK_TYPES_DISPLAY } from '../../../components/task/task-shared'

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
/* 整体：暖白底色 + 大留白，呼应 add-task 的亲密气质。 */
.task-detail-page { min-height: 100vh; padding: 64rpx 40rpx 120rpx; box-sizing: border-box; background: $brand-color-background; }
.task-detail-page__state { display: flex; min-height: 60vh; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.task-detail-page__state-title { margin-top: 24rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 600; }
.task-detail-page__state-copy { margin-top: 12rpx; padding: 0 80rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.6; }

/* 内容容器：列布局，区块间留白。 */
.task-detail-page__content { display: flex; flex-direction: column; gap: 32rpx; }

/* 头部：左色带 + 大标题 + chip 行（与 add-task 类型色同体系）。 */
.task-detail-page__header {
  display: flex; align-items: stretch;
  padding: 32rpx 28rpx;
  border-radius: 24rpx;
  background: $brand-color-surface;
}
.task-detail-page__type-mark { width: 10rpx; align-self: stretch; margin-right: 24rpx; border-radius: 6rpx; }
.task-detail-page__type-mark--low_stock { background: #E8B647; }
.task-detail-page__type-mark--to_handle { background: #5BBE93; }
.task-detail-page__type-mark--expiring { background: #E78A7B; }
.task-detail-page__title-block { display: flex; flex: 1; flex-direction: column; gap: 18rpx; }
.task-detail-page__title { color: $brand-color-text; font-size: 40rpx; font-weight: 500; line-height: 1.35; letter-spacing: .5rpx; }

/* chip：圆角胶囊，颜色按状态弱提示。 */
.task-detail-page__chips { display: flex; flex-wrap: wrap; gap: 12rpx; }
.task-detail-page__chip {
  display: inline-flex; align-items: center;
  height: 44rpx;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: #f1efeb;
  color: $brand-color-text;
  font-size: 22rpx;
  font-weight: 500;
  letter-spacing: .5rpx;
}
.task-detail-page__chip--type { background: #effbf5; color: $brand-color-action; }
.task-detail-page__chip--status[data-status='claimed'] { background: #e7f0eb; color: $brand-color-action; }
.task-detail-page__chip--status[data-status='pending'] { background: #f1efeb; color: $brand-color-text; }
.task-detail-page__chip--due { background: #fff3e8; color: #a55d31; }

/* 备注：薄卡片，没有强边框，靠背景色区分。 */
.task-detail-page__note { padding: 26rpx 28rpx; border-radius: 20rpx; background: $brand-color-surface; }
.task-detail-page__note-label { display: block; color: $brand-color-text-secondary; font-size: 22rpx; letter-spacing: 1rpx; }
.task-detail-page__note-text { display: block; margin-top: 12rpx; color: $brand-color-text; font-size: 28rpx; line-height: 1.6; }

/* 错误：通用低饱和红。 */
.task-detail-page__error { display: block; color: #c5684d; font-size: 25rpx; text-align: center; }

/* 操作按钮：主操作大圆角渐变绿，放弃细描边珊瑚。 */
.task-detail-page__actions { display: flex; flex-direction: column; gap: 18rpx; margin-top: 16rpx; }
.task-detail-page__btn {
  width: 100%;
  height: 104rpx;
  border: 0;
  border-radius: 999rpx;
  display: flex; align-items: center; justify-content: center;
  transition: transform .15s ease, background .2s ease, box-shadow .2s ease;
}
.task-detail-page__btn::after { border: 0; }
.task-detail-page__btn--primary {
  background: linear-gradient(135deg, #43c89a, #5bdfb3);
  box-shadow: 0 12rpx 28rpx rgba(67, 200, 154, .28);
}
.task-detail-page__btn--primary:active { transform: scale(.97); box-shadow: 0 6rpx 16rpx rgba(67, 200, 154, .25); }
.task-detail-page__btn--ghost {
  background: transparent;
  box-shadow: inset 0 0 0 1.5rpx #E78A7B;
}
.task-detail-page__btn--ghost:active { background: rgba(231, 138, 123, .08); }
.task-detail-page__btn-text { color: #fff; font-size: 31rpx; font-weight: 600; letter-spacing: 2rpx; line-height: 1; }
.task-detail-page__btn-text--ghost { color: #E78A7B; }

/* 事件流：左侧小色点按 kind 区分，弱化硬边框。 */
.task-detail-page__events { margin-top: 8rpx; padding: 26rpx 28rpx; border-radius: 20rpx; background: $brand-color-surface; }
.task-detail-page__events-title { display: block; margin-bottom: 8rpx; color: $brand-color-text-secondary; font-size: 22rpx; letter-spacing: 1rpx; }
.task-detail-page__event {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f0f3f0;
}
.task-detail-page__event:last-child { border-bottom: 0; padding-bottom: 0; }
.task-detail-page__event-row { display: flex; align-items: center; gap: 16rpx; }
.task-detail-page__event-dot { width: 14rpx; height: 14rpx; border-radius: 50%; }
.task-detail-page__event-dot--create { background: #5BBE93; }
.task-detail-page__event-dot--claim { background: #43c89a; }
.task-detail-page__event-dot--complete { background: $brand-color-action; }
.task-detail-page__event-dot--abandon { background: #E78A7B; }
.task-detail-page__event-text { color: $brand-color-text; font-size: 26rpx; }
.task-detail-page__event-time { color: $brand-color-text-secondary; font-size: 22rpx; flex-shrink: 0; margin-left: 18rpx; }
</style>
