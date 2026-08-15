<template>
  <view class="completed-page">
    <wd-toast />

    <view class="completed-page__heading">
      <text class="completed-page__eyebrow">家里的事</text>
      <text class="completed-page__title">已完成和已放弃</text>
      <text class="completed-page__subtitle">永久保留，不会被时间冲掉。</text>
    </view>

    <view v-if="filter !== 'all'" class="completed-page__filter">
      <text class="completed-page__filter-text" @click="resetFilter">查看全部</text>
    </view>

    <view v-if="!isReady" class="completed-page__state" data-testid="completed-loading">
      <wd-loading color="#267A5A" size="44rpx" />
      <text class="completed-page__state-title">正在加载历史</text>
    </view>

    <view v-else-if="storeError && items.length === 0" class="completed-page__state" data-testid="completed-error">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="completed-page__state-title">暂时无法加载</text>
      <text class="completed-page__state-copy">{{ storeError }}</text>
      <wd-button block round variant="plain" :loading="isLoading" @click="reload">重新加载</wd-button>
    </view>

    <view v-else-if="items.length === 0" class="completed-page__empty" data-testid="completed-empty">
      <!-- 空状态：直接用双团子 logo 强化品牌温度 -->
      <image
        class="completed-page__empty-logo"
        src="/static/brand/logo.png"
        mode="aspectFit"
        data-testid="completed-empty-logo"
      />
      <text class="completed-page__empty-title">还没有完成过的事</text>
      <text class="completed-page__empty-copy">完成或放弃的事项会在这里慢慢攒起来。</text>
    </view>

    <view v-else class="completed-page__list">
      <view
        v-for="item in items"
        :key="item.id"
        class="completed-page__item"
        :data-testid="`completed-item`"
        :data-terminal="item.terminalKind"
      >
        <view class="completed-page__item-mark" :class="`completed-page__item-mark--${item.type}`" />
        <view class="completed-page__item-content">
          <text class="completed-page__item-title">{{ item.title }}</text>
          <text class="completed-page__item-meta">{{ describeTerminalLine(item) }} · {{ formatTime(item.terminalAt) }}</text>
        </view>
        <text
          class="completed-page__item-tag"
          :class="`completed-page__item-tag--${item.terminalKind}`"
          :data-testid="'completed-item-tag-' + item.terminalKind"
          @click="filterTo(item.terminalKind)"
        >
          {{ describeTerminalLabel(item.terminalKind) }}
        </text>
      </view>

      <view v-if="hasMore" class="completed-page__more">
        <button
          class="completed-page__more-btn"
          :disabled="isLoadingMore"
          :data-loading="isLoadingMore"
          data-testid="completed-load-more"
          @click="loadMore"
        >
          <wd-loading v-if="isLoadingMore" size="28rpx" color="#43c89a" />
          <text v-else class="completed-page__more-text">加载更多</text>
        </button>
      </view>
      <view v-else-if="items.length >= 5" class="completed-page__end" data-testid="completed-end">
        <text class="completed-page__end-text">已经到底了</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTaskStore } from '../../../store/modules/task'
import {
  describeTerminalLabel,
  describeTerminalLine,
  filterCompleted,
  formatTerminalTime,
  type CompletedFilter,
} from './completed-tasks-view'
import type { CompletedTaskItem } from '../../../types/task'

const taskStore = useTaskStore()
const filter = ref<CompletedFilter>('all')
const items = computed<CompletedTaskItem[]>(() => filterCompleted(taskStore.completedItems, filter.value))
const isReady = computed(() => taskStore.phase === 'loaded' || taskStore.phase === 'editable' || taskStore.phase === 'failed')
const isLoading = computed(() => taskStore.phase === 'checking')
const isLoadingMore = ref(false)
const hasMore = computed(() => taskStore.completedHasMore)
const storeError = computed(() => taskStore.errorMessage)

async function load(reset: boolean): Promise<void> {
  if (reset) await taskStore.loadCompleted(true)
  else await taskStore.loadCompleted(false)
}

async function loadMore(): Promise<void> {
  if (isLoadingMore.value || !hasMore.value) return
  isLoadingMore.value = true
  try { await taskStore.loadCompleted(false) }
  finally { isLoadingMore.value = false }
}

async function reload(): Promise<void> {
  await load(true)
}

function filterTo(kind: 'completed' | 'abandoned'): void {
  filter.value = kind
}

function resetFilter(): void {
  filter.value = 'all'
}

function formatTime(iso: string): string {
  return formatTerminalTime(iso)
}

onShow(() => {
  void load(true)
})
</script>

<style lang="scss" scoped>
/* 整体：暖白底色 + 大留白，与 add-task/task-detail 保持一致。 */
.completed-page { min-height: 100vh; padding: 64rpx 40rpx 120rpx; box-sizing: border-box; background: $brand-color-background; }
.completed-page__heading { display: flex; flex-direction: column; margin-bottom: 40rpx; }
.completed-page__eyebrow { color: $brand-color-primary; font-size: 22rpx; font-weight: 600; letter-spacing: 6rpx; opacity: .85; }
.completed-page__title { margin-top: 18rpx; color: $brand-color-text; font-size: 46rpx; font-weight: 500; line-height: 1.35; letter-spacing: .5rpx; }
.completed-page__subtitle { margin-top: 14rpx; color: $brand-color-text-secondary; font-size: 26rpx; line-height: 1.6; font-weight: 400; }

.completed-page__filter { margin: 8rpx 0 24rpx; text-align: right; }
.completed-page__filter-text { color: $brand-color-primary; font-size: 24rpx; }

/* 加载/错误/空状态：纵向居中。 */
.completed-page__state { display: flex; min-height: 40vh; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.completed-page__state-title { margin-top: 24rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 600; }
.completed-page__state-copy { margin-top: 12rpx; padding: 0 80rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.6; }

/* 空状态：用 logo 强化品牌温度，而不是抽象的笔记 icon。 */
.completed-page__empty { display: flex; flex-direction: column; align-items: center; padding: 120rpx 32rpx; }
.completed-page__empty-logo { width: 240rpx; height: 240rpx; opacity: .92; }
.completed-page__empty-title { margin-top: 32rpx; color: $brand-color-text; font-size: 32rpx; font-weight: 500; letter-spacing: .5rpx; }
.completed-page__empty-copy { margin-top: 12rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.6; }

/* 列表项：色带 + 内容 + 描边徽章。 */
.completed-page__list { display: flex; flex-direction: column; gap: 18rpx; }
.completed-page__item { display: flex; align-items: center; padding: 24rpx 24rpx 24rpx 0; border-radius: 20rpx; background: $brand-color-surface; overflow: hidden; transition: transform .15s ease; }
.completed-page__item:active { transform: scale(.99); }
.completed-page__item-mark { width: 8rpx; align-self: stretch; margin-right: 22rpx; }
.completed-page__item-mark--low_stock { background: #E8B647; }
.completed-page__item-mark--to_handle { background: #5BBE93; }
.completed-page__item-mark--expiring { background: #E78A7B; }
.completed-page__item-content { display: flex; flex: 1; flex-direction: column; gap: 6rpx; }
.completed-page__item-title { color: $brand-color-text; font-size: 28rpx; font-weight: 500; line-height: 1.4; }
.completed-page__item-meta { color: $brand-color-text-secondary; font-size: 22rpx; }

/* 状态徽章：完成=绿描边、放弃=珊瑚描边。描边而非填充，避免视觉重量。 */
.completed-page__item-tag {
  flex-shrink: 0;
  padding: 6rpx 16rpx;
  border-radius: 999rpx;
  font-size: 21rpx;
  font-weight: 600;
  letter-spacing: .5rpx;
  transition: opacity .15s ease;
}
.completed-page__item-tag:active { opacity: .7; }
.completed-page__item-tag--completed {
  color: $brand-color-action;
  box-shadow: inset 0 0 0 1.5rpx $brand-color-primary;
  background: transparent;
}
.completed-page__item-tag--abandoned {
  color: #c5684d;
  box-shadow: inset 0 0 0 1.5rpx #E78A7B;
  background: transparent;
}

/* 加载更多：细描边 pill 风格。 */
.completed-page__more { margin-top: 16rpx; }
.completed-page__more-btn {
  width: 100%;
  height: 88rpx;
  border: 0;
  border-radius: 999rpx;
  background: transparent;
  box-shadow: inset 0 0 0 1.5rpx #d6dfd9;
  display: flex; align-items: center; justify-content: center;
  transition: opacity .15s ease;
}
.completed-page__more-btn::after { border: 0; }
.completed-page__more-btn:active { opacity: .7; }
.completed-page__more-text { color: $brand-color-action; font-size: 27rpx; font-weight: 500; letter-spacing: 1rpx; }

.completed-page__end { margin-top: 32rpx; text-align: center; }
.completed-page__end-text { color: $brand-color-text-secondary; font-size: 22rpx; letter-spacing: 2rpx; }
</style>
