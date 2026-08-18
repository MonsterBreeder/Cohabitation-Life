<!--
  家庭共同流水账首页（PRD 008 / Plan U4）。
  按 frontend-design skill Module C 走，沿用项目品牌色 + Wot UI 组件。
  区块：①月度概览 ②筛选条 ③按日期分组的列表 ④FAB 记一笔 ⑤已删除区。
  位置：作为底部 tab 入口页面放在主包（src/pages/ledger/），
  其他 ledger 子页面（add/detail/category-manager/stats）保留在 subpackages/ledger/ 按需加载。
-->
<template>
  <view class="ledger-home">
    <wd-toast />

    <view v-if="!householdId" class="ledger-home__state" data-testid="ledger-home-no-household">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="ledger-home__state-title">需要先有家</text>
      <text class="ledger-home__state-copy">账本挂在家庭下，先去创建一个吧。</text>
    </view>

    <view v-else-if="isLoading && entries.length === 0" class="ledger-home__state" data-testid="ledger-home-loading">
      <wd-loading color="#267A5A" size="40rpx" />
      <text class="ledger-home__state-title">正在读账本</text>
    </view>

    <view v-else-if="loadError" class="ledger-home__state" data-testid="ledger-home-error">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="ledger-home__state-title">暂时无法读取</text>
      <text class="ledger-home__state-copy">{{ loadError }}</text>
      <wd-button block round variant="plain" @click="reload">重新加载</wd-button>
    </view>

    <view v-else class="ledger-home__content" data-testid="ledger-home-content">
      <!-- ① 月度概览 -->
      <view class="ledger-home__overview">
        <text class="ledger-home__month-label">{{ monthLabel }}</text>
        <view class="ledger-home__numbers">
          <view class="ledger-home__number-block">
            <text class="ledger-home__number-label">支出</text>
            <text class="ledger-home__number-value ledger-home__number-value--expense">{{ expenseText }}</text>
          </view>
          <view class="ledger-home__number-block">
            <text class="ledger-home__number-label">收入</text>
            <text class="ledger-home__number-value ledger-home__number-value--income">{{ incomeText }}</text>
          </view>
          <view class="ledger-home__number-block">
            <text class="ledger-home__number-label">净额</text>
            <text class="ledger-home__number-value">{{ netText }}</text>
          </view>
        </view>
        <view v-if="categorySlices.length > 0" class="ledger-home__bar" data-testid="ledger-home-category-bar">
          <view
            v-for="slice in categorySlices"
            :key="slice.categoryId"
            class="ledger-home__bar-slice"
            :style="{ width: `${slice.percent * 100}%`, background: slice.colorHex }"
            :data-testid="`ledger-home-bar-slice-${slice.categoryId}`"
          />
        </view>
        <text v-else class="ledger-home__bar-empty">本月还没有类目分布</text>
      </view>

      <!-- ② 筛选条 -->
      <view class="ledger-home__filters">
        <view class="ledger-home__filter-row">
          <MemberFilter v-model="payerMode" :options="payerOptions" />
        </view>
        <view class="ledger-home__filter-row ledger-home__filter-row--month">
          <wd-button size="small" plain custom-class="ledger-home__month-btn" @click="onShiftMonth(-1)">‹ 上月</wd-button>
          <text class="ledger-home__month-current" data-testid="ledger-home-month-current">{{ monthLabel }}</text>
          <wd-button size="small" plain custom-class="ledger-home__month-btn" :disabled="!canGoNextMonth" @click="onShiftMonth(1)">下月 ›</wd-button>
        </view>
        <view v-if="visibleCategories.length > 0" class="ledger-home__filter-row">
          <CategoryFilterChips :categories="visibleCategories" :selected-ids="selectedCategoryIds" @update:selected-ids="onCategoriesChange" />
        </view>
      </view>

      <!-- ③ 列表 -->
      <view v-if="monthEntries.length === 0" class="ledger-home__empty" data-testid="ledger-home-empty">
        <wd-icon name="list" size="68rpx" color="#43c89a" />
        <text class="ledger-home__empty-title">本月还没有账目</text>
        <text class="ledger-home__empty-copy">点右下角"记一笔"开始记录</text>
      </view>

      <view v-else class="ledger-home__list" data-testid="ledger-home-list">
        <view v-for="(group, groupIdx) in entryGroups" :key="group.label" class="ledger-home__group" :data-testid="`ledger-home-group-${groupIdx}`">
          <text class="ledger-home__group-label">{{ group.label }}</text>
          <view v-for="entry in group.entries" :key="entry.id" class="ledger-home__entry-wrap">
            <LedgerEntryItem
              :entry="entry"
              :category="categoryViewMap[entry.categoryId] || fallbackCategoryView"
              @press="onPressEntry"
            />
          </view>
        </view>
      </view>

      <!-- ⑤ 已删除区 -->
      <view v-if="deletedEntries.length > 0" class="ledger-home__deleted" data-testid="ledger-home-deleted">
        <view class="ledger-home__deleted-header" @click="showDeleted = !showDeleted">
          <text class="ledger-home__deleted-title">已删除（{{ deletedEntries.length }}）</text>
          <text class="ledger-home__deleted-toggle">{{ showDeleted ? '收起' : '展开' }}</text>
        </view>
        <view v-if="showDeleted" class="ledger-home__deleted-list">
          <RestorableEntryItem
            v-for="entry in deletedEntries"
            :key="entry.id"
            :entry="{ ...entry, ...categoryMap[entry.categoryId] } as any"
            :category="categoryViewMap[entry.categoryId]"
            @restore="onRestoreEntry"
          />
        </view>
      </view>
    </view>

    <!-- ④ FAB 记一笔 -->
    <wd-fab
      v-if="householdId"
      type="primary"
      position="right-bottom"
      :expandable="false"
      :gap="{ right: 32, bottom: 180 }"
      :loading="isAdding"
      :aria-busy="isAdding"
      data-testid="ledger-home-fab"
      @click="goAdd"
    />

    <AppTabBar active="ledger" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { onLoad, onShow } from '@dcloudio/uni-app'
import MemberFilter from '../../components/ledger/MemberFilter.vue'
import CategoryFilterChips from '../../components/ledger/CategoryFilterChips.vue'
import LedgerEntryItem from '../../components/ledger/LedgerEntryItem.vue'
import RestorableEntryItem from './RestorableEntryItem.vue'
import AppTabBar from '../../components/AppTabBar.vue'
import { useHouseholdStore } from '../../store/modules/household'
import { useLedgerStore } from '../../store/modules/ledger'
import { formatYuan, formatLedgerMonth } from '../../utils/format'
import {
  describeCategory,
  describeCategorySlices,
  describeEntryMonth,
  describeMonthLabel,
  describePayerFilterOptions,
  groupEntriesByDate,
  shiftMonth,
  type CategoryView,
  type PayerFilter,
} from './ledger-home-view'
import type { LedgerCategory, LedgerEntrySummary } from '../../types/ledger'

const householdStore = useHouseholdStore()
const ledgerStore = useLedgerStore()

const { household, profile } = storeToRefs(householdStore)
const { entries, deletedEntries, categories, stats, currentMonth, payerMode, selectedCategoryIds, phase, errorMessage } = storeToRefs(ledgerStore)

const showDeleted = ref(false)
const isAdding = ref(false)
const fallbackCategoryView: CategoryView = {
  id: '__fallback__',
  name: '其他',
  iconKey: 'tag',
  colorKey: 'gray',
  isCustom: false,
  colorHex: '#74847D',
  iconName: 'tag',
}

const householdId = computed(() => household.value?.id || '')
// "我付的"筛选在云端完成（云端从 identityKey 推断 selfMemberKey），
// 前端不需要 selfMemberKey 字段
// 只在 phase === 'loading' 时显示 loading；之前 'idle' + entries=[] + 无 error 也算 loading，
// 但云端真的返回空账目（家庭刚建好没记过账）时 phase 也是 'idle'，会被误判成 loading 一直转圈。
const isLoading = computed(() => phase.value === 'loading')
const loadError = computed(() => errorMessage.value)

const monthLabel = computed(() => describeMonthLabel(currentMonth.value))
// 防御性 try-catch：store getter 在 reactive 链路初始化时偶尔会 throw，computed 缓存 undefined
// 会让模板里的 .length / .map 直接报错。兜底成空数组/空对象，模板里其他 v-if 会处理空态。
const monthEntries = computed<LedgerEntrySummary[]>(() => {
  try { return ledgerStore.monthEntries } catch { return [] }
})
const entryGroups = computed(() => {
  try { return groupEntriesByDate(monthEntries.value) } catch { return [] }
})
const categoryMap = computed<Record<string, LedgerCategory>>(() => {
  try { return ledgerStore.categoriesMap } catch { return {} }
})
const categoryViewMap = computed<Record<string, CategoryView>>(() => {
  const m: Record<string, CategoryView> = {}
  const list = Array.isArray(categories.value) ? categories.value : []
  for (const c of list) m[c.id] = describeCategory(c)
  return m
})
const visibleCategories = computed<CategoryView[]>(() => {
  try {
    return (ledgerStore.visibleCategories || []).map((c) => describeCategory(c))
  } catch { return [] }
})
const categorySlices = computed(() => {
  if (!stats.value) return []
  try {
    return describeCategorySlices(stats.value.byCategory, stats.value.monthExpenseCents, Array.isArray(categories.value) ? categories.value : [])
  } catch { return [] }
})

const expenseText = computed(() => formatYuan(stats.value?.monthExpenseCents || 0, { sign: 'none' }))
const incomeText = computed(() => formatYuan(stats.value?.monthIncomeCents || 0, { sign: 'none' }))
const netText = computed(() => {
  const sign = (stats.value?.netCents || 0) >= 0 ? '+' : '-'
  return formatYuan(Math.abs(stats.value?.netCents || 0), { sign: 'none' })
    .replace('¥', `¥${sign}`)
})

const payerOptions = computed(() => describePayerFilterOptions(''))

const todayMonth = computed(() => formatLedgerMonth(new Date()))
const canGoNextMonth = computed(() => currentMonth.value === 'all' || currentMonth.value < todayMonth.value)

function onPressEntry(entryId: string): void {
  uni.navigateTo({ url: `/subpackages/ledger/ledger-detail/index?entryId=${entryId}` })
}

function onRestoreEntry(entryId: string): void {
  const operationToken = `restore_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  void ledgerStore.restoreEntry({ entryId, operationToken })
}

function goAdd(): void {
  if (isAdding.value) return
  isAdding.value = true
  uni.navigateTo({ url: '/subpackages/ledger/ledger-add/index' })
  setTimeout(() => { isAdding.value = false }, 500)
}

function onShiftMonth(delta: number): void {
  const next = shiftMonth(currentMonth.value, delta)
  if (!next) return
  ledgerStore.setMonth(next)
}

function onCategoriesChange(ids: string[]): void {
  ledgerStore.setSelectedCategoryIds(ids)
}

async function reload(): Promise<void> {
  if (!householdId.value) return
  await Promise.all([
    ledgerStore.loadEntries(),
    ledgerStore.loadStats(currentMonth.value),
    ledgerStore.loadDeletedEntries(),
  ])
}

watch(
  () => householdId.value,
  async (id) => {
    if (!id) return
    ledgerStore.setHouseholdContext(id, '')
    if (!currentMonth.value) ledgerStore.setMonth(formatLedgerMonth(new Date()))
    await ledgerStore.loadCategories()
    await reload()
  },
  { immediate: true },
)

watch(
  () => currentMonth.value,
  async () => {
    if (!householdId.value) return
    await Promise.all([
      ledgerStore.loadEntries(),
      ledgerStore.loadStats(currentMonth.value),
    ])
  },
)

watch(
  () => [payerMode.value, selectedCategoryIds.value],
  () => {
    if (householdId.value) void ledgerStore.loadEntries()
  },
  { deep: true },
)

onLoad(() => {
  if (!currentMonth.value) ledgerStore.setMonth(formatLedgerMonth(new Date()))
})

onShow(async () => {
  if (householdId.value) {
    ledgerStore.setHouseholdContext(householdId.value, '')
    await reload()
  }
})
</script>

<style lang="scss" scoped>
.ledger-home {
  min-height: 100vh;
  padding: 32rpx 32rpx 200rpx;
  box-sizing: border-box;
  background: $brand-color-background;
}
.ledger-home__state {
  display: flex;
  min-height: 60vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.ledger-home__state-title { margin-top: 24rpx; color: $brand-color-text; font-size: 32rpx; font-weight: 700; }
.ledger-home__state-copy { max-width: 480rpx; margin: 12rpx 0 32rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.6; }
.ledger-home__content { display: flex; flex-direction: column; gap: 28rpx; }

/* 月度概览 */
.ledger-home__overview {
  display: flex;
  flex-direction: column;
  padding: 28rpx 28rpx 24rpx;
  border-radius: $brand-radius-card;
  background: $brand-color-surface;
  box-shadow: 0 2rpx 16rpx rgba(38, 122, 90, 0.04);
}
.ledger-home__month-label {
  color: $brand-color-text-secondary;
  font-size: 24rpx;
  font-weight: 500;
  letter-spacing: 2rpx;
}
.ledger-home__numbers {
  display: flex;
  justify-content: space-between;
  margin-top: 18rpx;
}
.ledger-home__number-block { display: flex; flex-direction: column; gap: 8rpx; }
.ledger-home__number-label { color: $brand-color-text-secondary; font-size: 22rpx; }
.ledger-home__number-value {
  color: $brand-color-text;
  font-size: 38rpx;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.ledger-home__number-value--expense { color: $brand-color-accent; }
.ledger-home__number-value--income { color: $brand-color-primary; }
.ledger-home__bar {
  display: flex;
  width: 100%;
  height: 18rpx;
  margin-top: 24rpx;
  overflow: hidden;
  border-radius: 999rpx;
  background: rgba($brand-color-border, .5);
}
.ledger-home__bar-slice { height: 100%; }
.ledger-home__bar-empty {
  margin-top: 24rpx;
  color: $brand-color-text-secondary;
  font-size: 22rpx;
  font-style: italic;
}

/* 筛选条 */
.ledger-home__filters {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  padding: 20rpx 24rpx;
  border-radius: $brand-radius-card;
  background: $brand-color-surface;
}
.ledger-home__filter-row { display: flex; align-items: center; gap: 12rpx; }
.ledger-home__filter-row--month { justify-content: space-between; }
.ledger-home__month-btn { min-width: 110rpx; }
.ledger-home__month-current { color: $brand-color-text; font-size: 28rpx; font-weight: 600; }

/* 列表 */
.ledger-home__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 32rpx;
  border: 2rpx dashed $brand-color-border;
  border-radius: $brand-radius-card;
  background: rgba($brand-color-surface, .6);
  text-align: center;
}
.ledger-home__empty-title { margin-top: 16rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 700; }
.ledger-home__empty-copy { margin-top: 8rpx; color: $brand-color-text-secondary; font-size: 24rpx; line-height: 1.6; }
.ledger-home__list { display: flex; flex-direction: column; gap: 24rpx; }
.ledger-home__group { display: flex; flex-direction: column; gap: 12rpx; }
.ledger-home__group-label { padding-left: 8rpx; color: $brand-color-text-secondary; font-size: 24rpx; font-weight: 600; }
.ledger-home__entry-wrap { }

/* 已删除区 */
.ledger-home__deleted { display: flex; flex-direction: column; gap: 12rpx; }
.ledger-home__deleted-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18rpx 24rpx;
  border-radius: 14rpx;
  background: $brand-color-surface;
}
.ledger-home__deleted-title { color: $brand-color-text-secondary; font-size: 26rpx; font-weight: 600; }
.ledger-home__deleted-toggle { color: $brand-color-action; font-size: 24rpx; }
.ledger-home__deleted-list { display: flex; flex-direction: column; gap: 10rpx; }
</style>
