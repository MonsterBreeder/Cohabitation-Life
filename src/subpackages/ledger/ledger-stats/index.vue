<!--
  账本统计页（PRD 008 / Plan U7）。
  区块：① 月度概览（支出 / 收入 / 净额） ② 月份切换 ③ 类目饼图 ④ 付款人柱状图 ⑤ 图例。
-->
<template>
  <view class="ledger-stats">
    <wd-toast />

    <view v-if="!householdId" class="ledger-stats__state" data-testid="ledger-stats-no-household">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="ledger-stats__state-title">需要先有家</text>
    </view>

    <view v-else-if="isLoading" class="ledger-stats__state" data-testid="ledger-stats-loading">
      <wd-loading color="#267A5A" size="40rpx" />
      <text class="ledger-stats__state-title">正在加载账本统计</text>
    </view>

    <view v-else-if="loadError" class="ledger-stats__state" data-testid="ledger-stats-error">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="ledger-stats__state-title">暂时无法读取</text>
      <text class="ledger-stats__state-copy">{{ loadError }}</text>
      <wd-button block round variant="plain" @click="reload">重新加载</wd-button>
    </view>

    <view v-else class="ledger-stats__content" data-testid="ledger-stats-content">
      <!-- 概览 -->
      <view class="ledger-stats__overview">
        <text class="ledger-stats__month-label">{{ overview.monthLabel }}</text>
        <view class="ledger-stats__numbers">
          <view class="ledger-stats__number-block">
            <text class="ledger-stats__number-label">支出</text>
            <text class="ledger-stats__number-value ledger-stats__number-value--expense">{{ overview.expenseText }}</text>
          </view>
          <view class="ledger-stats__number-block">
            <text class="ledger-stats__number-label">收入</text>
            <text class="ledger-stats__number-value ledger-stats__number-value--income">{{ overview.incomeText }}</text>
          </view>
          <view class="ledger-stats__number-block">
            <text class="ledger-stats__number-label">净额</text>
            <text class="ledger-stats__number-value">{{ overview.netText }}</text>
          </view>
        </view>
        <view class="ledger-stats__month-row">
          <wd-button size="small" plain custom-class="ledger-stats__month-btn" @click="onShift(-1)">‹ 上月</wd-button>
          <text class="ledger-stats__month-current">{{ currentMonth }}</text>
          <wd-button size="small" plain custom-class="ledger-stats__month-btn" :disabled="!canGoNext" @click="onShift(1)">下月 ›</wd-button>
        </view>
      </view>

      <!-- 类目饼图 -->
      <view class="ledger-stats__panel">
        <text class="ledger-stats__panel-title">类目分布</text>
        <StatsPieChart :slices="categorySlices" :size="280" />
        <view v-if="categorySlices.length > 0" class="ledger-stats__legend">
          <view
            v-for="slice in categorySlices"
            :key="slice.categoryId"
            class="ledger-stats__legend-item"
            :data-testid="`stats-legend-${slice.categoryId}`"
          >
            <view class="ledger-stats__legend-dot" :style="{ background: slice.colorHex }" />
            <text class="ledger-stats__legend-name">{{ slice.categoryName }}</text>
            <text class="ledger-stats__legend-percent">{{ Math.round(slice.percent * 100) }}%</text>
          </view>
        </view>
      </view>

      <!-- 付款人柱状图 -->
      <view class="ledger-stats__panel">
        <text class="ledger-stats__panel-title">付款人</text>
        <StatsBarChart :bars="payerBars" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { onLoad, onShow } from '@dcloudio/uni-app'
import StatsPieChart from './components/StatsPieChart.vue'
import StatsBarChart from './components/StatsBarChart.vue'
import { useHouseholdStore } from '../../../store/modules/household'
import { useLedgerStore } from '../../../store/modules/ledger'
import { formatLedgerMonth } from '../../../utils/format'
import {
  describeCategorySlices,
  describeMonthOverview,
  describePayerBars,
  shiftMonth as shiftMonthView,
} from './ledger-stats-view'

const householdStore = useHouseholdStore()
const ledgerStore = useLedgerStore()
const { household, profile } = storeToRefs(householdStore)
const { categories, stats, phase, errorMessage: storeError } = storeToRefs(ledgerStore)

const householdId = computed(() => household.value?.id || '')

const currentMonth = ref<string>('')
const isLoading = computed(() => phase.value === 'loading' && !stats.value)
const loadError = computed(() => storeError.value)

const todayMonth = computed(() => formatLedgerMonth(new Date()))
const canGoNext = computed(() => !currentMonth.value || currentMonth.value < todayMonth.value)

const overview = computed(() => describeMonthOverview(currentMonth.value, stats.value))
const categorySlices = computed(() => describeCategorySlices(stats.value, categories.value))
const payerBars = computed(() => describePayerBars(stats.value, payerNamesByKey.value))

const payerNamesByKey = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  if (profile.value) map[''] = profile.value.nickname || '我'
  if (household.value && Array.isArray(household.value.members)) {
    for (const m of household.value.members) {
      if (m.nickname) map[m.isSelf ? '' : 'other'] = m.nickname
    }
  }
  return map
})

onLoad(() => {
  if (householdId.value) ledgerStore.setHouseholdContext(householdId.value, '')
  if (!currentMonth.value) currentMonth.value = formatLedgerMonth(new Date())
  void reload()
})

onShow(async () => {
  if (householdId.value) {
    ledgerStore.setHouseholdContext(householdId.value, '')
    if (!currentMonth.value) currentMonth.value = formatLedgerMonth(new Date())
    await reload()
  }
})

async function reload(): Promise<void> {
  if (!currentMonth.value) return
  await ledgerStore.loadStats(currentMonth.value)
}

function onShift(delta: number): void {
  const next = shiftMonthView(currentMonth.value, delta)
  if (!next) return
  currentMonth.value = next
}

watch(
  () => householdId.value,
  (id) => {
    if (id) ledgerStore.setHouseholdContext(id, '')
  },
)
</script>

<style lang="scss" scoped>
.ledger-stats {
  min-height: 100vh;
  padding: 32rpx 32rpx 200rpx;
  box-sizing: border-box;
  background: $brand-color-background;
  &__state {
    display: flex;
    min-height: 60vh;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  &__state-title {
    margin-top: 24rpx;
    color: $brand-color-text;
    font-size: 32rpx;
    font-weight: 700;
  }
  &__state-copy {
    max-width: 480rpx;
    margin: 12rpx 0 32rpx;
    color: $brand-color-text-secondary;
    font-size: 25rpx;
    line-height: 1.6;
  }
  &__content {
    display: flex;
    flex-direction: column;
    gap: 24rpx;
  }
  &__overview {
    display: flex;
    flex-direction: column;
    gap: 18rpx;
    padding: 28rpx 28rpx 24rpx;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
    box-shadow: 0 2rpx 16rpx rgba(38, 122, 90, 0.04);
  }
  &__month-label {
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    font-weight: 500;
    letter-spacing: 2rpx;
  }
  &__numbers {
    display: flex;
    justify-content: space-between;
  }
  &__number-block {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
  }
  &__number-label {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
  }
  &__number-value {
    color: $brand-color-text;
    font-size: 34rpx;
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  &__number-value--expense {
    color: $brand-color-accent;
  }
  &__number-value--income {
    color: $brand-color-primary;
  }
  &__month-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__month-btn {
    min-width: 110rpx;
  }
  &__month-current {
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 600;
  }
  &__panel {
    display: flex;
    flex-direction: column;
    gap: 18rpx;
    padding: 24rpx 24rpx;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
  }
  &__panel-title {
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 700;
  }
  &__legend {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    margin-top: 8rpx;
  }
  &__legend-item {
    display: flex;
    align-items: center;
    gap: 14rpx;
  }
  &__legend-dot {
    width: 16rpx;
    height: 16rpx;
    border-radius: 50%;
    flex-shrink: 0;
  }
  &__legend-name {
    flex: 1;
    color: $brand-color-text;
    font-size: 26rpx;
    font-weight: 500;
  }
  &__legend-percent {
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
}
</style>
