<!--
  事项详情页：Wot UI 组件 + 品牌 scss 变量。
  - 头部 / 事件流是自定义排版（不属于组件）
  - 状态/类型/截止 用 wd-tag
  - 备注/事件行 用 wd-cell + wd-cell-group
  - 操作按钮 用 wd-button block round
  - 所有 testid 与原版保持一致
-->
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
            <!-- 终态下隐藏 type chip（避免"待处理"type 跟"已结束"语义冲突）；pending/claimed 才显示 -->
            <wd-tag
              v-if="!detail.terminalKind"
              round
              plain
              type="primary"
              custom-class="task-detail-page__chip"
              :data-testid="`task-detail-type-${detail.type}`"
            >
              {{ typeLabel }}
            </wd-tag>
            <!-- 状态 chip：pending 跟 type label 撞（都是"待处理"），省略；
                 claimed/terminal 才有新信息（"由 X 处理" / "由 X 完成"），才显示。 -->
            <wd-tag
              v-if="detail.status !== 'pending'"
              round
              plain
              :type="detail.status === 'claimed' ? 'success' : 'default'"
              custom-class="task-detail-page__chip"
              :data-testid="`task-detail-status-${detail.status}`"
            >
              {{ statusLine }}
            </wd-tag>
            <wd-tag
              v-if="dueLabel"
              round
              plain
              type="warning"
              custom-class="task-detail-page__chip"
              data-testid="task-detail-due"
            >
              截止 {{ dueLabel }}
            </wd-tag>
          </view>
        </view>
      </view>

      <!-- 备注：wd-cell-group + 自定义 cell（左侧 label + 右侧 value 文本） -->
      <view v-if="detail.note" class="task-detail-page__note">
        <text class="task-detail-page__note-label">备注</text>
        <text class="task-detail-page__note-text">{{ detail.note }}</text>
      </view>

      <text v-if="storeError" class="task-detail-page__error" data-testid="task-detail-error">{{ storeError }}</text>

      <!-- 操作按钮：编辑 + 认领/完成 + 放弃 -->
      <view class="task-detail-page__actions">
        <wd-button
          v-if="availability.edit"
          block
          round
          variant="plain"
          type="primary"
          size="large"
          :disabled="isAnyBusy"
          data-testid="task-detail-edit"
          @click="onEdit"
        >
          编辑事项
        </wd-button>
        <wd-button
          v-if="availability.claim"
          block
          round
          type="primary"
          size="large"
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
          round
          type="primary"
          size="large"
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
          round
          variant="plain"
          type="warning"
          size="large"
          :loading="isAbandoning"
          :disabled="isAnyBusy"
          data-testid="task-detail-abandon"
          @click="onAbandon"
        >
          放弃
        </wd-button>
        <!-- 删除：仅 pending/claimed；终态不显示（R2）。紧邻"放弃"按钮 -->
        <wd-button
          v-if="availability.delete"
          block
          round
          variant="plain"
          type="danger"
          size="large"
          :loading="isDeleting"
          :disabled="isAnyBusy"
          data-testid="task-detail-delete"
          @click="onDelete"
        >
          删除
        </wd-button>
      </view>

      <!-- 事件流：wd-cell-group + 每个事件一行（左侧色点 + 描述 + 时间） -->
      <view v-if="detail.events.length" class="task-detail-page__events">
        <text class="task-detail-page__events-title">操作记录</text>
        <wd-cell-group border>
          <wd-cell
            v-for="(event, idx) in detail.events"
            :key="`${event.kind}-${event.at}-${idx}`"
            custom-class="task-detail-page__event"
            data-testid="task-detail-event"
          >
            <view class="task-detail-page__event-row">
              <view class="task-detail-page__event-dot" :class="`task-detail-page__event-dot--${event.kind}`" />
              <text class="task-detail-page__event-text">{{ describeEventLine(event) }}</text>
            </view>
            <text slot="value" class="task-detail-page__event-time">{{ formatTime(event.at) }}</text>
          </wd-cell>
        </wd-cell-group>
      </view>

      <!-- 备注对话：评论列表 + 输入框；终态封口（PRD 006 R8 / R9） -->
      <TaskComments
        v-if="detail.comments"
        :task-id="detail.id"
        :comments="detail.comments"
        :disabled="Boolean(detail.terminalKind)"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import { useTaskStore } from '../../../store/modules/task'
import {
  describeAbandonConfirmMessage,
  describeActions,
  describeDeleteConfirmMessage,
  describeDueLabel,
  describeEventLine,
  describeStatusLine,
} from './task-detail-view'
import { todayIso } from '../add-task/add-task-view'
// TASK_TYPES_DISPLAY 来自主包 task-shared：分包可引用主包，反向引用会在主包编译时丢失路径。
import { TASK_TYPES_DISPLAY } from '../../../components/task/task-shared'
import TaskComments from '../components/TaskComments.vue'

const taskStore = useTaskStore()
const taskId = ref('')
const loadError = ref('')
const errorMessage = ref('')
const isLoading = computed(() => taskStore.phase === 'checking')
const isClaiming = computed(() => taskStore.phase === 'claiming')
const isCompleting = computed(() => taskStore.phase === 'completing')
const isAbandoning = computed(() => taskStore.phase === 'abandoning')
const isEditing = computed(() => taskStore.phase === 'updating')
const isDeleting = computed(() => taskStore.phase === 'deleting')
const isAnyBusy = computed(() => isClaiming.value || isCompleting.value || isAbandoning.value || isEditing.value || isDeleting.value)
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

function onEdit(): void {
  if (!taskId.value) return
  // 编辑页：mode=edit + taskId 查询参数；add-task 页会读取后预填
  uni.navigateTo({ url: `/subpackages/task/add-task/index?mode=edit&taskId=${taskId.value}` })
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

async function onDelete(): Promise<void> {
  if (!taskId.value) return
  // 二次确认（PRD 007 R3/R4）
  const confirmed = await uni.showModal({
    title: '删除这件事',
    content: describeDeleteConfirmMessage(detail.value),
    confirmText: '继续',
    confirmColor: '#c5684d',
  })
  if (!confirmed.confirm) return
  const ok = await taskStore.delete(taskId.value)
  if (ok) {
    // PRD 007 R23/R5：删除成功直接 reLaunch 回首页（不留历史栈）
    uni.reLaunch({ url: '/pages/index/index' })
  } else {
    errorMessage.value = taskStore.errorMessage || '暂时无法删除，请稍后重试'
  }
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
  if (id) {
    void load(id).then(() => {
      // 详情加载完后再订阅实时评论推送
      if (id === taskId.value && taskStore.detail) {
        taskStore.subscribeComments(id)
      }
    })
  }
})

onShow(() => {
  if (taskId.value && !detail.value && !isLoading.value) {
    void load(taskId.value)
  }
})

onUnload(() => {
  // 页面卸载：关闭实时推送（避免泄漏）
  taskStore.unsubscribeComments()
})
</script>

<style lang="scss" scoped>
/* 整体：暖白底色 + 大留白。 */
.task-detail-page { min-height: 100vh; padding: 64rpx 32rpx 80rpx; box-sizing: border-box; background: $brand-color-background; }
.task-detail-page__state { display: flex; min-height: 60vh; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.task-detail-page__state-title { margin-top: 24rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 600; }
.task-detail-page__state-copy { margin-top: 12rpx; padding: 0 80rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.6; }

/* 内容容器：列布局。 */
.task-detail-page__content { display: flex; flex-direction: column; gap: 24rpx; }

/* 头部：左色带 + 大标题 + chip 行。 */
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
.task-detail-page__chips { display: flex; flex-wrap: wrap; gap: 12rpx; }
.task-detail-page__chip { font-size: 22rpx; }

/* 备注：薄卡片（与 wd-cell 区分，是更大的可换行文本）。 */
.task-detail-page__note { padding: 26rpx 28rpx; border-radius: 20rpx; background: $brand-color-surface; }
.task-detail-page__note-label { display: block; color: $brand-color-text-secondary; font-size: 22rpx; letter-spacing: 1rpx; }
.task-detail-page__note-text { display: block; margin-top: 12rpx; color: $brand-color-text; font-size: 28rpx; line-height: 1.6; }

/* 错误：通用低饱和红。 */
.task-detail-page__error { display: block; color: #c5684d; font-size: 25rpx; text-align: center; }

/* 操作按钮组。 */
.task-detail-page__actions { display: flex; flex-direction: column; gap: 18rpx; margin-top: 8rpx; }

/* 事件流：wd-cell-group 包裹每行。 */
.task-detail-page__events { margin-top: 8rpx; }
.task-detail-page__events-title { display: block; margin-bottom: 12rpx; color: $brand-color-text-secondary; font-size: 22rpx; letter-spacing: 1rpx; }
.task-detail-page__event { padding: 18rpx 0; }
.task-detail-page__event-row { display: flex; align-items: center; gap: 16rpx; }
.task-detail-page__event-dot { width: 14rpx; height: 14rpx; border-radius: 50%; flex-shrink: 0; }
.task-detail-page__event-dot--create { background: #5BBE93; }
.task-detail-page__event-dot--claim { background: #43c89a; }
.task-detail-page__event-dot--complete { background: #267a5a; }
.task-detail-page__event-dot--abandon { background: #E78A7B; }
.task-detail-page__event-dot--edit { background: #E8B647; }
.task-detail-page__event-text { color: $brand-color-text; font-size: 26rpx; line-height: 1.4; }
.task-detail-page__event-time { color: $brand-color-text-secondary; font-size: 22rpx; flex-shrink: 0; }
</style>
