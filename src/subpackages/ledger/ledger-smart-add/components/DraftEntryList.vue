<!-- 文件用途：展示可核对的小票，只有当前账单能确认或展开逐笔调整。 -->
<template>
  <ReceiptPaper tear>
    <template #heading>
      <text class="draft-entry-list__title">{{ active ? '待确认账单' : '此前账单' }}</text>
      <text class="draft-entry-list__caption">
        {{ display.entries.length }} 笔{{
          totals.income && totals.expense ? '' : totals.income ? '收入' : '支出'
        }}
        · 合计
      </text>
      <view class="draft-entry-list__totals">
        <text v-if="totals.expense">{{ totals.income ? '支出 ' : '' }}{{ formatYuan(totals.expense) }}</text>
        <text v-if="totals.income">{{ totals.expense ? '收入 ' : '' }}{{ formatYuan(totals.income) }}</text>
      </view>
    </template>
    <view
      v-for="(row, index) in rows"
      :key="row.id"
      class="draft-entry-list__row"
      :data-testid="`smart-draft-entry-${index}`"
    >
      <BookkeepingIcon :name="row.icon" :tone="row.tone" />
      <view class="draft-entry-list__body">
        <view class="draft-entry-list__line">
          <text class="draft-entry-list__name">{{ row.title }}</text>
          <text class="draft-entry-list__amount">{{ row.amount }}</text>
        </view>
        <text class="draft-entry-list__detail">{{ row.income ? '收入' : '支出' }} · {{ row.detail }}</text>
        <text v-if="row.note" class="draft-entry-list__detail">备注 · {{ row.note }}</text>
        <view v-if="active && expanded" class="draft-entry-list__tools">
          <wd-button size="small" plain :disabled="disabled" @click="emit('edit', row.id)">修改</wd-button>
          <wd-button size="small" plain type="info" :disabled="disabled" @click="emit('remove', row.id)">
            移除
          </wd-button>
        </view>
      </view>
    </view>
    <view v-if="active" class="draft-entry-list__actions">
      <wd-button size="small" variant="text" :disabled="disabled" @click="expanded = !expanded">
        <view class="draft-entry-list__adjust">
          <BookkeepingIcon name="edit" tone="plain" />
          <text>{{ expanded ? '收起调整' : '逐笔调整' }}</text>
        </view>
      </wd-button>
      <wd-button block round :disabled="disabled" data-testid="smart-draft-confirm" @click="emit('confirm')">
        确认记账 · {{ display.entries.length }} 笔
      </wd-button>
    </view>
  </ReceiptPaper>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import type { DraftDisplay } from '../use-ledger-draft'
import { draftTotals } from '../use-ledger-draft'
import { entryDisplay } from '../bookkeeping-card-view'
import { formatYuan } from '../../../../utils/format'
import ReceiptPaper from './ReceiptPaper.vue'
import BookkeepingIcon from './BookkeepingIcon.vue'

/** 子组件只接收卡片快照，确认时由父级核对其编号。 */
const props = defineProps<{ display: DraftDisplay; active: boolean; disabled: boolean }>()
const emit = defineEmits<{ confirm: []; edit: [id: string]; remove: [id: string] }>()
const expanded = shallowRef(false)
const totals = computed(() => draftTotals(props.display.entries))
const rows = computed(() =>
  props.display.entries.map((item) => ({
    ...entryDisplay(item, props.display.categories, props.display.members),
    id: item.id,
    note: item.note,
  })),
)
</script>

<style lang="scss" scoped>
/* 小票按金额和时间排版，补充说明允许换行。 */
.draft-entry-list {
  &__title,
  &__caption,
  &__detail {
    display: block;
  }
  &__title {
    font-size: 30rpx;
    font-weight: 700;
  }
  &__caption {
    margin-top: 6rpx;
    font-size: 24rpx;
    color: $brand-color-action;
  }
  &__totals {
    display: flex;
    flex-wrap: wrap;
    gap: 4rpx 20rpx;
    font-size: 42rpx;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  &__row {
    display: flex;
    gap: 16rpx;
    padding: 20rpx 0;
    border-bottom: 1rpx solid $brand-color-border;
  }
  &__body {
    flex: 1;
    min-width: 0;
  }
  &__line,
  &__tools,
  &__adjust {
    display: flex;
    gap: 12rpx;
    align-items: center;
  }
  &__line {
    justify-content: space-between;
    align-items: flex-start;
    font-size: 29rpx;
    font-weight: 700;
  }
  &__name,
  &__detail {
    overflow-wrap: anywhere;
  }
  &__amount {
    flex: none;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  &__detail {
    margin-top: 6rpx;
    font-size: 24rpx;
    line-height: 1.5;
    color: #536b60;
  }
  &__tools {
    margin-top: 12rpx;
  }
  &__actions {
    margin-top: 8rpx;
  }
}
</style>
