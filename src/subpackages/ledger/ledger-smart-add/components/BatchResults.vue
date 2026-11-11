<!-- 文件用途：把实际逐笔保存状态排成聊天回执，结果未知时只提供核对入口。 -->
<template>
  <ReceiptPaper>
    <template #heading>
      <text class="batch-results__title">本次保存结果</text>
      <text class="batch-results__hint">{{ summary }}</text>
    </template>
    <view
      v-for="(row, index) in rows"
      :key="row.itemId"
      class="batch-results__row"
      :data-testid="`smart-batch-item-${index}`"
    >
      <BookkeepingIcon :name="row.icon" :tone="row.tone" />
      <view class="batch-results__body">
        <view class="batch-results__line">
          <text class="batch-results__name">{{ row.title }}</text>
          <text v-if="row.amount" class="batch-results__amount">{{ row.amount }}</text>
        </view>
        <view class="batch-results__line batch-results__line--status">
          <view class="batch-results__status" :class="`batch-results__status--${row.status}`">
            <BookkeepingIcon :name="states[row.status].icon" tone="plain" />
            <text>{{ states[row.status].label }}</text>
          </view>
          <wd-button
            v-if="row.status === 'success' && row.entryId"
            size="small"
            variant="text"
            :disabled="busy"
            @click="emit('open', row.entryId)"
          >
            查看账目
          </wd-button>
        </view>
        <text v-if="row.status === 'failed'" class="batch-results__hint">
          {{
            row.code === 'LEDGER_CATEGORY_NOT_FOUND'
              ? '类目已不可用，请调整这笔。'
              : '这笔未保存，请核对后再试。'
          }}
        </text>
        <view v-if="canEdit && row.entry && row.status !== 'success'" class="batch-results__tools">
          <wd-button size="small" plain :disabled="busy" @click="emit('edit', row.itemId)">修改</wd-button>
          <wd-button size="small" plain type="info" :disabled="busy" @click="emit('remove', row.itemId)">
            移除
          </wd-button>
        </view>
      </view>
    </view>
    <view v-if="unknown || canRetry" class="batch-results__actions">
      <template v-if="unknown">
        <text class="batch-results__notice">先查回结果，避免重复记账。</text>
        <wd-button block round :disabled="busy" data-testid="smart-batch-query" @click="emit('query')">
          核对保存结果
        </wd-button>
      </template>
      <wd-button v-else block round :disabled="busy" data-testid="smart-batch-retry" @click="emit('retry')">
        确认补存未成功项
      </wd-button>
    </view>
  </ReceiptPaper>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BatchResult } from '../../../../types/ledger-draft'
import type { DraftDisplay } from '../use-ledger-draft'
import { entryDisplay } from '../bookkeeping-card-view'
import ReceiptPaper from './ReceiptPaper.vue'
import BookkeepingIcon from './BookkeepingIcon.vue'

/** 查历史只提供回执；当前页仍有草稿时才展示金额及类目。 */
const props = defineProps<{
  result: Omit<BatchResult, 'items'> & { items: readonly BatchResult['items'][number][] }
  display: DraftDisplay | null
  busy: boolean
  canRetry: boolean
  canEdit: boolean
}>()
const emit = defineEmits<{
  query: []
  retry: []
  open: [id: string]
  edit: [id: string]
  remove: [id: string]
}>()

/** 每种状态同时带文字和本地图标。 */
const states = {
  success: { label: '已记账', icon: 'check' },
  failed: { label: '未保存', icon: 'alert' },
  unknown: { label: '待核对', icon: 'clock' },
  unexecuted: { label: '未执行', icon: 'dash' },
} as const
const unknown = computed(() => props.result.items.some((item) => item.status === 'unknown'))
const rows = computed(() =>
  props.result.items.flatMap((item, index) => {
    const display = props.display
    const entry = display?.entries.find((candidate) => candidate.id === item.itemId)
    if (display && !entry && item.status !== 'success') return []
    const details =
      display && entry
        ? entryDisplay(entry, display.categories, display.members)
        : ({ title: `第 ${index + 1} 笔`, amount: '', icon: 'tag', tone: 'neutral' } as const)
    return [{ ...item, ...details, entry }]
  }),
)
const summary = computed(() => {
  const counts = { success: 0, failed: 0, unknown: 0, unexecuted: 0 }
  for (const row of rows.value) counts[row.status]++
  const order = ['success', 'failed', 'unknown', 'unexecuted'] as const
  return (
    order
      .filter((status) => counts[status])
      .map((status) => `${counts[status]} 笔${states[status].label}`)
      .join(' · ') || '未保存项已移除。'
  )
})
</script>

<style lang="scss" scoped>
/* 小票状态带文字，历史记录无原话也能逐项查看。 */
.batch-results {
  &__title,
  &__hint,
  &__notice {
    display: block;
  }
  &__title {
    font-size: 30rpx;
    font-weight: 700;
  }
  &__hint {
    margin-top: 8rpx;
    font-size: 24rpx;
    line-height: 1.5;
    color: #536b60;
  }
  &__row {
    display: flex;
    gap: 16rpx;
    padding: 20rpx 0;
    border-bottom: 1rpx solid $brand-color-border;
  }
  &__body {
    min-width: 0;
    flex: 1;
  }
  &__line {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8rpx;
    font-size: 29rpx;
    font-weight: 700;
  }
  &__line--status {
    flex-wrap: wrap;
    align-items: center;
    margin-top: 6rpx;
  }
  &__name {
    overflow-wrap: anywhere;
  }
  &__amount {
    flex: none;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  &__status {
    display: flex;
    align-items: center;
    gap: 6rpx;
    border-radius: 16rpx;
    padding: 5rpx 10rpx;
    font-size: 23rpx;
    background: #f1f3ed;
    color: #536b60;
  }
  &__status--success {
    background: #eaf5ed;
    color: $brand-color-action;
  }
  &__status--unknown,
  &__status--failed {
    background: #fbeddf;
    color: #805137;
  }
  &__tools,
  &__actions {
    margin-top: 16rpx;
  }
  &__tools {
    display: flex;
    gap: 12rpx;
  }
  &__notice {
    margin-bottom: 16rpx;
    padding: 14rpx 20rpx;
    border-radius: $brand-radius-input;
    background: #fcf3ea;
    color: #805137;
    font-size: 24rpx;
  }
}
</style>
