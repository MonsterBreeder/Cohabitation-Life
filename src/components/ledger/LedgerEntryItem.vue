<!--
  账目列表项：左侧类目色点 + 类目名 + 备注；右侧金额（支出红/收入绿）；右侧凭证缩略图。
-->
<template>
  <view class="ledger-entry-item" :data-testid="`ledger-entry-${entry.id}`" @click="onPress">
    <view class="ledger-entry-item__main">
      <view class="ledger-entry-item__head">
        <view class="ledger-entry-item__dot" :style="{ background: category.colorHex }" />
        <text class="ledger-entry-item__category">{{ category.name }}</text>
      </view>
      <text v-if="entry.note" class="ledger-entry-item__note">{{ entry.note }}</text>
      <text v-else class="ledger-entry-item__payer">{{ payerName }}</text>
    </view>

    <view class="ledger-entry-item__aside">
      <text
        class="ledger-entry-item__amount"
        :class="{
          'ledger-entry-item__amount--expense': entry.type === 'expense',
          'ledger-entry-item__amount--income': entry.type === 'income',
        }"
      >{{ amountText }}</text>
      <ReceiptThumb v-if="entry.receiptMediaId" :media-id="entry.receiptMediaId" :test-id="`ledger-entry-thumb-${entry.id}`" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { LedgerEntrySummary } from '../../types/ledger'
import { describeEntryAmount, type CategoryView } from '../../pages/ledger/ledger-home-view'
import ReceiptThumb from './ReceiptThumb.vue'

interface Props {
  entry: LedgerEntrySummary
  category: CategoryView
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'press', entryId: string): void }>()

const amountText = computed(() => describeEntryAmount(props.entry.type, props.entry.amountCents))
const payerName = computed(() => props.entry.payer.nickname || '我')

function onPress(): void {
  emit('press', props.entry.id)
}
</script>

<style lang="scss" scoped>
.ledger-entry-item {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  border-radius: 16rpx;
  background: $brand-color-surface;
  transition: transform .12s ease, background .15s ease;
}
.ledger-entry-item:active {
  transform: scale(.99);
  background: #f8faf7;
}
.ledger-entry-item__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}
.ledger-entry-item__head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.ledger-entry-item__dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  flex-shrink: 0;
}
.ledger-entry-item__category {
  color: $brand-color-text;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1.3;
}
.ledger-entry-item__note {
  color: $brand-color-text-secondary;
  font-size: 23rpx;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ledger-entry-item__payer {
  color: $brand-color-text-secondary;
  font-size: 23rpx;
  line-height: 1.4;
}
.ledger-entry-item__aside {
  display: flex;
  align-items: center;
  gap: 14rpx;
  flex-shrink: 0;
}
.ledger-entry-item__amount {
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.ledger-entry-item__amount--expense { color: $brand-color-accent; }
.ledger-entry-item__amount--income { color: $brand-color-primary; }
</style>
