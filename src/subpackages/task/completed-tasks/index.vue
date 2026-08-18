<!--
  已完成和已放弃页：Wot UI 组件 + 品牌 scss 变量。
  - 列表按 YYYY-MM-DD 分组：今天/昨天/M月D日（同年）/YYYY-MM-DD（跨年），越靠近期望越靠上
  - 每组：日期头（"今天" 等 + 件数小角标）+ N 张完成卡片
  - 卡片：左侧色带（按 type）+ 中间标题/描述 + 右侧描边徽章
  - 加载/错误/空状态：wd-loading + wd-icon + wd-empty（带品牌 logo slot）
  - 加载更多：wd-loadmore，触底自动 onReachBottom 加载
  - testid 保持向后兼容：completed-loading / completed-error / completed-empty / completed-item / completed-end
-->
<template>
  <view class="completed-page">
    <wd-toast />

    <view class="completed-page__heading">
      <text class="completed-page__eyebrow">家里的事</text>
      <text class="completed-page__title">已完成和已放弃</text>
      <text class="completed-page__subtitle">永久保留，不会被时间冲掉。</text>
    </view>

    <view v-if="!isReady" class="completed-page__state" data-testid="completed-loading">
      <wd-loading color="#267A5A" size="44rpx" />
      <text class="completed-page__state-title">正在加载历史事项</text>
    </view>

    <view v-else-if="storeError && items.length === 0" class="completed-page__state" data-testid="completed-error">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="completed-page__state-title">暂时无法加载</text>
      <text class="completed-page__state-copy">{{ storeError }}</text>
      <wd-button block round variant="plain" :loading="isLoading" @click="reload">重新加载</wd-button>
    </view>

    <view v-else-if="items.length === 0" class="completed-page__empty" data-testid="completed-empty">
      <!-- wd-empty 内置 slot，可注入品牌 logo 代替默认 icon -->
      <wd-empty
        tip="还没有完成过的事"
        custom-class="completed-page__empty-host"
        data-testid="completed-empty"
      >
        <template #image>
          <image
            class="completed-page__empty-logo"
            src="/static/brand/logo.png"
            mode="aspectFit"
            data-testid="completed-empty-logo"
          />
        </template>
        <view slot="bottom" class="completed-page__empty-copy">完成或放弃的事项会在这里慢慢攒起来。</view>
      </wd-empty>
    </view>

    <view v-else class="completed-page__groups" data-testid="completed-groups">
      <view
        v-for="group in groups"
        :key="group.dateKey"
        class="completed-page__group"
        :data-date-key="group.dateKey"
      >
        <view class="completed-page__group-head">
          <text class="completed-page__group-title">{{ describeTerminalDateLabel(group.dateKey) }}</text>
          <text class="completed-page__group-meta">{{ group.items.length }} 件</text>
        </view>

        <view
          v-for="item in group.items"
          :key="item.id"
          class="completed-page__item"
          data-testid="completed-item"
          :data-terminal="item.terminalKind"
          :data-task-id="item.id"
          @click="goDetail(item.id)"
        >
          <view class="completed-page__item-mark" :class="`completed-page__item-mark--${item.type}`" />
          <view class="completed-page__item-text">
            <text class="completed-page__item-title">{{ item.title }}</text>
            <text class="completed-page__item-meta">
              {{ describeTerminalLine(item) }} · {{ formatTimeOfDay(item.terminalAt) }}
            </text>
          </view>
          <view
            class="completed-page__item-tag"
            :class="`completed-page__item-tag--${item.terminalKind}`"
            :data-testid="`completed-item-tag-${item.terminalKind}`"
          >
            {{ describeTerminalLabel(item.terminalKind) }}
          </view>
        </view>
      </view>

      <!-- 加载更多 / 到底提示：滚动到底自动触发 onReachBottom；失败可点重试 -->
      <wd-loadmore
        v-if="hasMore"
        state="loading"
        loading-text="正在加载更早的事项…"
        :loading-props="{ color: '#43c89a' }"
        custom-class="completed-page__more"
        data-testid="completed-load-more"
      />
      <view v-else class="completed-page__end" data-testid="completed-end">
        <wd-divider custom-class="completed-page__end-divider">已经到底了</wd-divider>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow, onReachBottom } from '@dcloudio/uni-app'
import { useTaskStore } from '../../../store/modules/task'
import {
  describeTerminalDateLabel,
  describeTerminalLabel,
  describeTerminalLine,
  formatTerminalTime,
  groupByTerminalDate,
  sortGroupsNewestFirst,
  type TerminalDateGroup,
} from './completed-tasks-view'
import type { CompletedTaskItem } from '../../../types/task'

const taskStore = useTaskStore()
// 软锁：避免 onReachBottom 高频触发时同时发起多个加载请求
const isAutoLoading = ref(false)

const items = computed<CompletedTaskItem[]>(() => taskStore.completedItems)
const isReady = computed(() => taskStore.phase === 'loaded' || taskStore.phase === 'editable' || taskStore.phase === 'failed')
const isLoading = computed(() => taskStore.phase === 'checking' || isAutoLoading.value)
const hasMore = computed(() => taskStore.completedHasMore)
const storeError = computed(() => taskStore.errorMessage)

/** 把扁平列表按本地日历日分组，再按日期倒序；近的在上、远的在下。 */
const groups = computed<TerminalDateGroup[]>(() => {
  const grouped = groupByTerminalDate(items.value)
  return sortGroupsNewestFirst(grouped)
})

async function load(reset: boolean): Promise<void> {
  if (reset) await taskStore.loadCompleted(true)
  else await taskStore.loadCompleted(false)
}

async function reload(): Promise<void> {
  await load(true)
}

/** 触底自动加载下一页：已经到底时不再发起。 */
async function loadMore(): Promise<void> {
  if (!hasMore.value || isAutoLoading.value) return
  isAutoLoading.value = true
  try {
    await taskStore.loadCompleted(false)
  } finally {
    isAutoLoading.value = false
  }
}

function goDetail(taskId: string): void {
  uni.navigateTo({ url: `/subpackages/task/task-detail/index?taskId=${taskId}` })
}

function formatTimeOfDay(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return formatTerminalTime(iso)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

onShow(() => {
  void load(true)
})

onReachBottom(() => {
  void loadMore()
})
</script>

<style lang="scss" scoped>
/* 整体：暖白底色 + 大留白。 */
.completed-page { min-height: 100vh; padding: 64rpx 32rpx 80rpx; box-sizing: border-box; background: $brand-color-background; }
.completed-page__heading { display: flex; flex-direction: column; margin-bottom: 32rpx; }
.completed-page__eyebrow { color: $brand-color-primary; font-size: 22rpx; font-weight: 600; letter-spacing: 6rpx; opacity: .85; }
.completed-page__title { margin-top: 16rpx; color: $brand-color-text; font-size: 46rpx; font-weight: 500; line-height: 1.35; letter-spacing: .5rpx; }
.completed-page__subtitle { margin-top: 12rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.6; }

/* 加载/错误：纵向居中。 */
.completed-page__state { display: flex; min-height: 40vh; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.completed-page__state-title { margin-top: 24rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 600; }
.completed-page__state-copy { margin-top: 12rpx; padding: 0 80rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.6; }

/* 空状态：wd-empty 容纳品牌 logo。 */
.completed-page__empty { padding: 80rpx 0; }
.completed-page__empty :deep(.wd-empty) { padding: 0; }
.completed-page__empty-logo { width: 220rpx; height: 220rpx; opacity: .92; }
.completed-page__empty-copy { display: block; margin-top: 16rpx; padding: 0 80rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.6; }

/* 分组容器：每组之间留出"日期间距"，让今天的记录和昨天的记录能呼吸。 */
.completed-page__groups { display: flex; flex-direction: column; }
.completed-page__group { display: flex; flex-direction: column; margin-top: 12rpx; }

/* 日期头：左侧大号主标签（"今天"/"昨天"/"8月16日"），右侧小号件数角标。
   整组用极淡的米色背景做底，色带卡片浮在白底上。 */
.completed-page__group-head {
  display: flex; align-items: baseline; justify-content: space-between;
  padding: 28rpx 6rpx 18rpx;
}
.completed-page__group-title { color: $brand-color-text; font-size: 30rpx; font-weight: 700; letter-spacing: .5rpx; }
.completed-page__group-meta { color: $brand-color-text-secondary; font-size: 22rpx; }

/* 列表卡片：左侧色带（按 type）+ 中间标题/描述 + 右侧描边徽章。
   同组内卡片紧贴，第一张圆角顶部、最后一张圆角底部，整组看起来像一张连续卡片。 */
.completed-page__group-items {
  display: flex; flex-direction: column;
  border-radius: 20rpx;
  background: $brand-color-surface;
  overflow: hidden;
}
.completed-page__item {
  display: flex; align-items: center; gap: 20rpx;
  padding: 24rpx 24rpx 24rpx 0;
  background: $brand-color-surface;
  transition: transform .12s ease, background .15s ease;
}
.completed-page__item:active { background: #effbf5; transform: scale(.998); }
/* 同组卡片之间的细分割线，第一张不要 */
.completed-page__item + .completed-page__item {
  border-top: 1rpx solid $brand-color-border;
}
.completed-page__item-mark { width: 6rpx; align-self: stretch; flex-shrink: 0; border-radius: 0 4rpx 4rpx 0; }
.completed-page__item-mark--low_stock { background: #E8B647; }
.completed-page__item-mark--to_handle { background: #5BBE93; }
.completed-page__item-mark--expiring { background: #E78A7B; }
.completed-page__item-text { display: flex; flex: 1; flex-direction: column; gap: 4rpx; min-width: 0; }
.completed-page__item-title { color: $brand-color-text; font-size: 28rpx; font-weight: 500; line-height: 1.4; }
.completed-page__item-meta { color: $brand-color-text-secondary; font-size: 22rpx; }
/* 状态徽章：完成=绿描边、放弃=珊瑚描边。 */
.completed-page__item-tag {
  flex-shrink: 0;
  display: inline-flex; align-items: center;
  height: 44rpx; padding: 0 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 500;
  letter-spacing: .5rpx;
}
.completed-page__item-tag--completed { color: $brand-color-action; box-shadow: inset 0 0 0 1.5rpx $brand-color-primary; background: transparent; }
.completed-page__item-tag--abandoned { color: #c5684d; box-shadow: inset 0 0 0 1.5rpx #E78A7B; background: transparent; }

/* 加载更多：wd-loadmore 自带文案，间距由 Wot UI 决定。 */
.completed-page__more { margin-top: 16rpx; }

.completed-page__end { margin-top: 32rpx; }
.completed-page__end-divider { color: $brand-color-text-secondary; }
</style>
