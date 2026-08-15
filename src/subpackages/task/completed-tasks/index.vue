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
      <wd-icon name="notes" size="80rpx" color="#a8b3ac" />
      <text class="completed-page__empty-title">还没有已完成的事项</text>
      <text class="completed-page__empty-copy">完成或放弃的事项会出现在这里。</text>
    </view>

    <view v-else class="completed-page__list">
      <view
        v-for="item in items"
        :key="item.id"
        class="completed-page__item"
        data-testid="completed-item"
      >
        <view class="completed-page__item-mark" :class="`completed-page__item-mark--${item.type}`" />
        <view class="completed-page__item-content">
          <text class="completed-page__item-title">{{ item.title }}</text>
          <text class="completed-page__item-meta">{{ describeTerminalLine(item) }} · {{ formatTime(item.terminalAt) }}</text>
        </view>
        <text
          class="completed-page__item-tag"
          :class="`completed-page__item-tag--${item.terminalKind}`"
          @click="filterTo(item.terminalKind)"
        >
          {{ describeTerminalLabel(item.terminalKind) }}
        </text>
      </view>

      <view v-if="hasMore" class="completed-page__more">
        <wd-button
          block
          variant="plain"
          :loading="isLoadingMore"
          data-testid="completed-load-more"
          @click="loadMore"
        >
          加载更多
        </wd-button>
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
.completed-page { min-height: 100vh; padding: 48rpx 32rpx 80rpx; box-sizing: border-box; background: $brand-color-background; }
.completed-page__heading { display: flex; flex-direction: column; margin-bottom: 24rpx; }
.completed-page__eyebrow { color: $brand-color-primary; font-size: 23rpx; font-weight: 700; letter-spacing: 4rpx; }
.completed-page__title { margin-top: 12rpx; color: $brand-color-text; font-size: 42rpx; font-weight: 700; }
.completed-page__subtitle { margin-top: 8rpx; color: $brand-color-text-secondary; font-size: 25rpx; }
.completed-page__filter { margin: 20rpx 0; text-align: right; }
.completed-page__filter-text { color: $brand-color-primary; font-size: 24rpx; }
.completed-page__state { display: flex; min-height: 40vh; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.completed-page__state-title { margin-top: 24rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 700; }
.completed-page__state-copy { margin-top: 12rpx; padding: 0 80rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.6; }
.completed-page__empty { display: flex; flex-direction: column; align-items: center; padding: 96rpx 32rpx; }
.completed-page__empty-title { margin-top: 24rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 700; }
.completed-page__empty-copy { margin-top: 12rpx; color: $brand-color-text-secondary; font-size: 25rpx; }
.completed-page__list { display: flex; flex-direction: column; gap: 16rpx; }
.completed-page__item { display: flex; align-items: center; padding: 24rpx 28rpx; border: 2rpx solid $brand-color-border; border-radius: 18rpx; background: $brand-color-surface; }
.completed-page__item-mark { width: 12rpx; align-self: stretch; margin-right: 18rpx; border-radius: 6rpx; }
.completed-page__item-mark--low_stock { background: #d99833; }
.completed-page__item-mark--to_handle { background: #498469; }
.completed-page__item-mark--expiring { background: #c66b68; }
.completed-page__item-content { display: flex; flex: 1; flex-direction: column; gap: 6rpx; }
.completed-page__item-title { color: $brand-color-text; font-size: 28rpx; font-weight: 600; line-height: 1.4; }
.completed-page__item-meta { color: $brand-color-text-secondary; font-size: 23rpx; }
.completed-page__item-tag { padding: 6rpx 14rpx; border-radius: 999rpx; font-size: 21rpx; font-weight: 700; }
.completed-page__item-tag--completed { background: #e6f5ed; color: #2c6e4a; }
.completed-page__item-tag--abandoned { background: #f0e8e8; color: #8b5e5a; }
.completed-page__more { margin-top: 20rpx; }
.completed-page__end { margin-top: 24rpx; text-align: center; }
.completed-page__end-text { color: $brand-color-text-secondary; font-size: 23rpx; }
</style>
