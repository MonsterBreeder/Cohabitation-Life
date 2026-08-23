<!--
  柱状图（PRD 008 / Plan U7）：纯 CSS bar，不引第三方图表库。
  数据：PayerBar[]（payer + expenseCents + percent）。
-->
<template>
  <view class="stats-bar">
    <view v-if="bars.length === 0" class="stats-bar__empty" data-testid="stats-bar-empty">
      <text class="stats-bar__empty-text">本月还没有付款人数据</text>
    </view>
    <view v-else class="stats-bar__list" data-testid="stats-bar">
      <view
        v-for="bar in bars"
        :key="bar.payerKey"
        class="stats-bar__row"
        :data-testid="`stats-bar-row-${bar.payerKey}`"
      >
        <text class="stats-bar__label">{{ bar.payerName }}</text>
        <view class="stats-bar__track">
          <view
            class="stats-bar__fill"
            :style="{ width: `${Math.max(bar.percent, 0.02) * 100}%`, background: '#43C89A' }"
          />
        </view>
        <text class="stats-bar__value">{{ formatCents(bar.expenseCents) }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import type { PayerBar } from '../ledger-stats-view'
import { formatYuan } from '../../../../utils/format'

interface Props {
  bars: PayerBar[]
}
defineProps<Props>()

function formatCents(cents: number): string {
  return formatYuan(cents, { sign: 'none' })
}
</script>

<style lang="scss" scoped>
.stats-bar {
  width: 100%;
  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200rpx;
    &-text {
      color: #74847D;
      font-size: 26rpx;
      font-style: italic;
    }
  }
  &__list {
    display: flex;
    flex-direction: column;
    gap: 18rpx;
  }
  &__row {
    display: flex;
    align-items: center;
    gap: 18rpx;
  }
  &__label {
    width: 120rpx;
    color: #29443A;
    font-size: 26rpx;
    font-weight: 500;
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__track {
    flex: 1;
    height: 18rpx;
    overflow: hidden;
    border-radius: 999rpx;
    background: #E4ECE7;
  }
  &__fill {
    height: 100%;
    border-radius: 999rpx;
    background: #43C89A;
    transition: width .35s ease;
  }
  &__value {
    min-width: 140rpx;
    color: #29443A;
    font-size: 26rpx;
    font-weight: 600;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
}
</style>
