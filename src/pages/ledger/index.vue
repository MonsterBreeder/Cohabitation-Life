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
      <text class="ledger-home__state-title">正在加载账本</text>
    </view>

    <view v-else-if="loadError && entries.length === 0" class="ledger-home__state" data-testid="ledger-home-error">
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

      <!-- ② 筛选条：模块化卡片，按"日期 → 主体筛选 → 类目"分组。
           设计目标：减少行数（3 行）+ 提升视觉层级（segmented 填充色 + 浅灰分割线），
           让筛选区不抢月度概览的视觉权重。 -->
      <view class="ledger-home__filters" data-testid="ledger-home-filters">
        <!-- 2.1 日期筛选：单行 pill 形（[‹] 月份 [›] [📅]），整体走 mint 浅底圆角，
             比 wd-button 三个并排更紧凑。 -->
        <view class="ledger-home__date-bar">
          <view
            class="ledger-home__date-step"
            data-testid="ledger-home-date-prev"
            @click="onShiftMonth(-1)"
          >
            <text class="ledger-home__date-step-icon">‹</text>
          </view>
          <text class="ledger-home__date-current" data-testid="ledger-home-month-current">{{ monthLabel }}</text>
          <view
            class="ledger-home__date-step"
            :class="{ 'ledger-home__date-step--disabled': !canGoNextMonth }"
            data-testid="ledger-home-date-next"
            @click="canGoNextMonth && onShiftMonth(1)"
          >
            <text class="ledger-home__date-step-icon">›</text>
          </view>
          <view class="ledger-home__date-divider" />
          <DatePickerButton
            :date="selectedDate"
            @update:date="onDatePicked"
            @clear="onDateClear"
            @update:open="onDatePickerOpenChange"
          />
        </view>

        <!-- 2.2 主体筛选 + 2.3 类目筛选：左右并排（flex row）。
             旧版两行 chip 视觉太重，用户反馈"上下两行还是丑"，改成左右两个独立 pill。
             类目展开的 chip 列表仍然走 row 内部 column——按钮本身是 row 内的两列。 -->
        <view class="ledger-home__filter-row">
          <!-- 2.2 主体筛选：单按钮 + 弹层（设计稿 C）。
               旧版两行 chip [全部|我付的|对方付的] + [全部|支出|收入] 视觉太重，
               改成"筛选 [当前选择] ⌄"单按钮，点开底部弹层选 [谁付的] / [什么类型] 两组 chip。 -->
          <view
            class="ledger-home__filter-btn"
            :class="{ 'ledger-home__filter-btn--active': isFilterActive }"
            data-testid="ledger-home-filter-btn"
            @click="onOpenFilterSheet"
          >
            <wd-icon name="filter" size="32rpx" :color="isFilterActive ? '#267A5A' : '#74847D'" />
            <text class="ledger-home__filter-btn-text">{{ filterLabel }}</text>
            <view class="ledger-home__filter-btn-arrow" :class="{ 'ledger-home__filter-btn-arrow--open': filterSheetOpen }">
              <wd-icon name="caret-down" size="24rpx" :color="isFilterActive ? '#267A5A' : '#74847D'" />
            </view>
          </view>

          <!-- 2.3 类目筛选：默认折叠成"按类目筛选"按钮，避免 8+ 个 chip 一直占两行。
               点开后展开成多选 chip，关闭或点外部时收起。
               注意：toggle 单独成项在 row 内（左右并排），body 放在 row 之外
               单独成段（点开后占满整行宽度，不挤在 toggle 右侧）。 -->
          <view
            v-if="visibleCategories.length > 0"
            class="ledger-home__category-toggle"
            :class="{ 'ledger-home__category-toggle--active': categoryOpen || selectedCategoryIds.length > 0 }"
            data-testid="ledger-home-category-toggle"
            @click="categoryOpen = !categoryOpen"
          >
            <text class="ledger-home__category-toggle-text">
              {{ selectedCategoryIds.length > 0
                ? `类目（已选 ${selectedCategoryIds.length}）`
                : '按类目筛选' }}
            </text>
            <view class="ledger-home__category-toggle-arrow" :class="{ 'ledger-home__category-toggle-arrow--open': categoryOpen }">
              <wd-icon name="caret-down" size="28rpx" color="#74847D" />
            </view>
          </view>
          </view>
        <view v-if="visibleCategories.length > 0 && categoryOpen" class="ledger-home__category-body" data-testid="ledger-home-category-body">
          <CategoryFilterChips
            :categories="visibleCategories"
            :selected-ids="selectedCategoryIds"
            @update:selected-ids="onCategoriesChange"
          />
          <view
            v-if="selectedCategoryIds.length > 0"
            class="ledger-home__category-clear"
            data-testid="ledger-home-category-clear"
            @click="onClearCategories"
          >
            <text>清除类目筛选</text>
          </view>
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
        <view v-if="loadMoreError" class="ledger-home__more-error" data-testid="ledger-home-more-error" @click="loadMore">
          <text>加载更早账目失败，点这里重试</text>
        </view>
        <wd-loadmore
          v-else-if="entriesHasMore"
          state="loading"
          loading-text="正在加载更早的账目…"
          :loading-props="{ color: '#43c89a' }"
          custom-class="ledger-home__more"
          data-testid="ledger-home-load-more"
        />
        <view v-else class="ledger-home__end" data-testid="ledger-home-end">
          <wd-divider custom-class="ledger-home__end-divider">已经到底了</wd-divider>
        </view>
      </view>

      <!-- ⑤ 已删除区：date 模式（已选具体日期）时折叠（KTD6） -->
      <view v-if="!selectedDate && deletedEntries.length > 0" class="ledger-home__deleted" data-testid="ledger-home-deleted">
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

    <!-- ④ FAB 记一笔：日期选择器打开时隐藏（避免 FAB 浮在日历弹层之上，挡住日期/确定按钮）。
         即便日历 z-index 已经提到 200，FAB 仍可能在日历关闭动画期间短暂可见，所以用 v-if 最稳；
         底部距离与首页快速添加按钮保持一致。 -->
    <wd-fab
      v-if="householdId && !isDatePickerOpen && !filterSheetOpen"
      type="primary"
      position="right-bottom"
      :expandable="false"
      :gap="{ right: 32, bottom: 104 }"
      :loading="isAdding"
      :aria-busy="isAdding"
      data-testid="ledger-home-fab"
      @click="goAdd"
    />

    <!-- ⑤ 筛选弹层（设计稿 C）：从底部弹起，含 谁付的 / 什么类型 两组 chip。
         用 v-model + draft 本地态实现"点开不立即应用、确认才应用"——避免每次
         点 chip 都触发云函数 listEntries / loadStats 抖动。
         用 wd-popup 而不是手写 mask + @click.self：uni-app 在 <view> 上的
         .self 修饰符不可靠（点击 chip 时事件冒泡让 mask 误判自身被点、弹窗被关），
         wd-popup 用组件内部事件处理 closeOnClickModal，从根上绕开这个问题。 -->
    <wd-popup
      v-model="filterSheetOpen"
      position="bottom"
      :z-index="200"
      :safe-area-inset-bottom="true"
      :round="true"
      custom-class="ledger-home__filter-popup"
      data-testid="ledger-home-filter-sheet"
      @close="onCloseFilterSheet"
    >
      <view class="ledger-home__sheet">
        <view class="ledger-home__sheet-header">
          <text class="ledger-home__sheet-title">筛选</text>
          <view
            class="ledger-home__sheet-close"
            data-testid="ledger-home-filter-sheet-close"
            @click="onCloseFilterSheet"
          >
            <text class="ledger-home__sheet-close-icon">×</text>
          </view>
        </view>
        <view class="ledger-home__sheet-body">
          <text class="ledger-home__sheet-label">谁付的</text>
          <view class="ledger-home__sheet-chips">
            <view
              v-for="opt in payerOptions"
              :key="opt.value"
              class="ledger-home__sheet-chip"
              :class="{ 'ledger-home__sheet-chip--active': draftPayerMode === opt.value }"
              :data-testid="`ledger-home-filter-payer-${opt.value}`"
              @click="draftPayerMode = opt.value as 'all' | 'me' | 'other'"
            >
              <text class="ledger-home__sheet-chip-text">{{ opt.label }}</text>
            </view>
          </view>
          <text class="ledger-home__sheet-label">什么类型</text>
          <view class="ledger-home__sheet-chips">
            <view
              v-for="opt in typeOptions"
              :key="opt.value"
              class="ledger-home__sheet-chip"
              :class="{ 'ledger-home__sheet-chip--active': draftTypeFilter === opt.value }"
              :data-testid="`ledger-home-filter-type-${opt.value}`"
              @click="draftTypeFilter = opt.value as 'all' | 'expense' | 'income'"
            >
              <text class="ledger-home__sheet-chip-text">{{ opt.label }}</text>
            </view>
          </view>
        </view>
        <view class="ledger-home__sheet-footer">
          <wd-button
            size="medium"
            block
            type="primary"
            data-testid="ledger-home-filter-confirm"
            @click="onConfirmFilter"
          >确认</wd-button>
        </view>
      </view>
    </wd-popup>

    <AppTabBar active="ledger" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { onLoad, onReachBottom, onShow } from '@dcloudio/uni-app'
import DatePickerButton from '../../components/ledger/DatePickerButton.vue'
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
  describeTypeFilterOptions,
  groupEntriesByDate,
  shiftMonth,
  shiftDay,
  type CategoryView,
  type PayerFilter,
} from './ledger-home-view'
import type { LedgerCategory, LedgerEntrySummary } from '../../types/ledger'

const householdStore = useHouseholdStore()
const ledgerStore = useLedgerStore()

const { household, profile } = storeToRefs(householdStore)
const { entries, deletedEntries, categories, stats, currentMonth, payerMode, typeFilter, selectedDate, selectedCategoryIds, phase, errorMessage, entriesHasMore, isLoadingMore } = storeToRefs(ledgerStore)

const showDeleted = ref(false)
const isAdding = ref(false)
// 类目筛选默认折叠——避免 8+ 个 chip 一直占两行视觉空间；点"按类目筛选"展开。
// selectedCategoryIds 非空时按钮文字变成"类目（已选 N）"，让用户知道当前已激活。
const categoryOpen = ref(false)
// 日期选择器打开状态：DatePickerButton 通过 v-model:visible 同步到 visibleProxy，
// 然后 emit 'update:open' 通知到本页面，本页面据此隐藏 FAB（避免 FAB z-index 99 浮在
// 日历弹层上方挡住日期/确定按钮）。
const isDatePickerOpen = ref(false)
// 筛选弹层（设计稿 C）：双维度（人 + 类型）合并到一颗按钮 + 底部弹层。
// 用 draft 本地态实现"点开不立即应用、确认才应用"——避免每次点 chip 都触发云函数抖动。
const filterSheetOpen = ref(false)
const draftPayerMode = ref<'all' | 'me' | 'other'>('all')
const draftTypeFilter = ref<'all' | 'expense' | 'income'>('all')
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
const loadMoreError = computed(() => Boolean(errorMessage.value && entries.value.length > 0 && !isLoadingMore.value))

const monthLabel = computed(() => {
  // date 模式显示具体日期；月模式显示月份
  if (selectedDate.value) return describeMonthLabel(selectedDate.value)
  return describeMonthLabel(currentMonth.value)
})
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

const payerOptions = computed(() => {
  // 单成员家庭不显示"对方付的"（R4）
  const all = describePayerFilterOptions('')
  return memberCount.value < 2 ? all.filter((o) => o.value !== 'other') : all
})
const typeOptions = computed(() => describeTypeFilterOptions())
const memberCount = computed(() => household.value?.memberCount || 1)

// 筛选弹层按钮文字：单按钮显示"我付的 · 支出"这种组合，默认"全部人 · 全部类型"。
// 至少有一个维度被设成非 all 时，按钮高亮（active 色）让用户知道筛选生效。
const isFilterActive = computed(() => payerMode.value !== 'all' || typeFilter.value !== 'all')
const filterLabel = computed(() => {
  // payer 维度中文
  const payerLabel = payerMode.value === 'me' ? '我付的' : payerMode.value === 'other' ? '对方付的' : '全部人'
  // type 维度中文
  const typeLabel = typeFilter.value === 'expense' ? '支出' : typeFilter.value === 'income' ? '收入' : '全部类型'
  return `${payerLabel} · ${typeLabel}`
})

const todayMonth = computed(() => formatLedgerMonth(new Date()))
const todayDate = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})
// KTD3 + KTD4：date 模式下"下一天"按日期判断；月模式下"下月"按月份判断
const canGoNextMonth = computed(() => {
  if (selectedDate.value) return selectedDate.value < todayDate.value
  return currentMonth.value !== '' && currentMonth.value !== 'all' && currentMonth.value < todayMonth.value
})

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
  // date 模式走 shiftDay；月模式走 shiftMonth
  if (selectedDate.value) {
    const next = shiftDay(selectedDate.value, delta)
    if (!next) return
    ledgerStore.setSelectedDate(next)
  } else {
    const next = shiftMonth(currentMonth.value, delta)
    if (!next) return
    ledgerStore.setMonth(next)
  }
}

function onDatePicked(date: string): void {
  ledgerStore.setSelectedDate(date)
}

function onDateClear(): void {
  ledgerStore.setSelectedDate('')
}

/** DatePickerButton 同步日历 open 状态到父页面，配合 FAB v-if 使用。 */
function onDatePickerOpenChange(open: boolean): void {
  isDatePickerOpen.value = open
}

/** 打开筛选弹层：把 store 当前值复制到 draft 本地态，弹层里改动不会立即生效，
 *  只有点"确认"才把 draft 写回 store，触发 watch 重新拉数据。 */
function onOpenFilterSheet(): void {
  draftPayerMode.value = payerMode.value
  draftTypeFilter.value = typeFilter.value
  filterSheetOpen.value = true
}

/** 关闭筛选弹层（不点确认 = 不应用修改） */
function onCloseFilterSheet(): void {
  filterSheetOpen.value = false
}

/** 确认筛选：把 draft 写回 store，触发 watch loadEntries + loadStatsDebounced。
 *  watcher 检测到 payerMode / typeFilter 变化会重新拉数据，不需要主动调用 loadEntries。 */
function onConfirmFilter(): void {
  ledgerStore.setPayerMode(draftPayerMode.value)
  ledgerStore.setTypeFilter(draftTypeFilter.value)
  filterSheetOpen.value = false
}

function onCategoriesChange(ids: string[]): void {
  ledgerStore.setSelectedCategoryIds(ids)
}

/** 清除类目筛选：把 selectedCategoryIds 置空，UI 状态保持 categoryOpen 让用户看到结果。 */
function onClearCategories(): void {
  ledgerStore.setSelectedCategoryIds([])
}

async function reload(): Promise<void> {
  if (!householdId.value) return
  await Promise.all([
    ledgerStore.loadEntries(),
    ledgerStore.loadStats(currentMonth.value),
    ledgerStore.loadDeletedEntries(),
  ])
}

async function loadMore(): Promise<void> {
  if (!entriesHasMore.value || isLoadingMore.value) return
  await ledgerStore.loadMoreEntries()
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
  () => [payerMode.value, typeFilter.value, selectedCategoryIds.value, selectedDate.value],
  () => {
    if (householdId.value) {
      void ledgerStore.loadEntries()
      // 头部 stats 跟筛选条件实时重算（U4：200ms 防抖）
      void ledgerStore.loadStatsDebounced()
    }
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

onReachBottom(() => {
  void loadMore()
})
</script>

<style lang="scss" scoped>
.ledger-home {
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
    gap: 28rpx;
  }
  /* 月度概览 */
  &__overview {
    display: flex;
    flex-direction: column;
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
    margin-top: 18rpx;
  }
  &__number-block {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }
  &__number-label {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
  }
  &__number-value {
    color: $brand-color-text;
    font-size: 38rpx;
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
  &__bar {
    display: flex;
    width: 100%;
    height: 18rpx;
    margin-top: 24rpx;
    overflow: hidden;
    border-radius: 999rpx;
    background: rgba($brand-color-border, .5);
  }
  &__bar-slice {
    height: 100%;
  }
  &__bar-empty {
    margin-top: 24rpx;
    color: $brand-color-text-secondary;
    font-size: 22rpx;
    font-style: italic;
  }
  /* 筛选条：去卡片化（不再用白底圆角包住整组筛选），改成"裸行+间距"——
     用户反馈"中间双层设计太过臃肿"，把外层 card 拿掉后，每行（date pill / chip / 类目）
     自带背景（pill 形），3 段之间靠 18rpx gap 隔开，视觉重量从"大块"变"行间"。 */
  &__filters {
    display: flex;
    flex-direction: column;
    gap: 18rpx;
    padding: 0;
  }
  // 2.1 日期 pill：单行容器，[‹] 月份 [›] | [📅] 四个动作
  &__date-bar {
    display: flex;
    align-items: center;
    gap: 8rpx;
    align-self: stretch;
    padding: 8rpx 12rpx;
    border-radius: 999rpx;
    background: #f5faf7;
  }
  &__date-step {
    display: flex;
    width: 48rpx;
    height: 48rpx;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background .15s ease, opacity .15s ease;
  }
  // 用 class 后缀单独声明 .disabled —— BEM 守门脚本限制连续 &。
  &__date-step--disabled {
    opacity: .35;
  }
  // active 但非 disabled：分开写两条选择器
  &__date-step:active {
    background: rgba($brand-color-primary, .15);
  }
  &__date-step-icon {
    color: $brand-color-text;
    font-size: 36rpx;
    font-weight: 500;
    line-height: 1;
  }
  &__date-current {
    flex: 1;
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 600;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  &__date-divider {
    width: 1rpx;
    height: 28rpx;
    margin: 0 4rpx;
    background: rgba($brand-color-text, .12);
  }
  // 2.2 主体筛选单按钮（设计稿 C）：合并旧版"人+类型"两行 chip 成一按钮，
  // 弹层里再展开选。active 态用主色浅底 + 深绿文字表明有筛选生效。
  &__filter-btn {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 10rpx;
    padding: 14rpx 22rpx;
    border: 2rpx solid transparent;
    border-radius: 999rpx;
    background: rgba($brand-color-border, .35);
    transition: all .18s ease;
    min-width: 0;
    &--active {
      border-color: $brand-color-primary;
      background: #e8f8f1;
    }
  }
  &__filter-btn-text {
    flex: 1;
    color: $brand-color-text-secondary;
    font-size: 25rpx;
    font-weight: 500;
    line-height: 1.2;
    transition: color .15s ease;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__filter-btn--active &__filter-btn-text {
    color: $brand-color-action;
    font-weight: 600;
  }
  &__filter-btn-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28rpx;
    height: 28rpx;
    transition: transform .2s ease;
    flex-shrink: 0;
    &--open {
      transform: rotate(180deg);
    }
  }
  // 2.2 + 2.3 左右并排容器：用户反馈"上下两行还是丑"，
  // 改成 flex row 让"主体筛选按钮"和"类目筛选按钮"并排，
  // 类目展开的 chip 列表仍走 column（在按钮下方展开）。
  &__filter-row {
    display: flex;
    align-items: center;
    gap: 14rpx;
  }
  // 2.3 类目筛选：toggle 直接是 row 内的子节点（不再被 column 包裹），
  // 跟 filter-btn 一起并排；body 提到 row 之外单独成段，点开占满整行宽度。
  &__category-toggle {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: space-between;
    padding: 14rpx 22rpx;
    border: 2rpx solid transparent;
    border-radius: 999rpx;
    background: rgba($brand-color-border, .35);
    transition: all .18s ease;
    min-width: 0;
    &--active {
      border-color: $brand-color-primary;
      background: #e8f8f1;
    }
  }
  &__category-toggle-text {
    flex: 1;
    color: $brand-color-text-secondary;
    font-size: 25rpx;
    font-weight: 500;
    transition: color .15s ease;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__category-toggle--active &__category-toggle-text {
    color: $brand-color-action;
    font-weight: 600;
  }
  &__category-toggle-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 4rpx;
    width: 28rpx;
    height: 28rpx;
    transition: transform .2s ease;
    flex-shrink: 0;
    &--open {
      transform: rotate(180deg);
    }
  }
  // body 现在是 row 的兄弟节点（不是 toggle 的子节点），
  // 点开后整行宽度展开，跨整行。
  &__category-body {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    margin-top: 16rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid rgba($brand-color-text, .08);
    width: 100%;
  }
  &__category-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 4rpx;
    color: $brand-color-accent;
    font-size: 23rpx;
    transition: opacity .15s ease;
    &:active {
      opacity: .6;
    }
  }
  /* 列表 */
  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 80rpx 32rpx;
    border: 2rpx dashed $brand-color-border;
    border-radius: $brand-radius-card;
    background: rgba($brand-color-surface, .6);
    text-align: center;
  }
  &__empty-title {
    margin-top: 16rpx;
    color: $brand-color-text;
    font-size: 30rpx;
    font-weight: 700;
  }
  &__empty-copy {
    margin-top: 8rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    line-height: 1.6;
  }
  &__list {
    display: flex;
    flex-direction: column;
    gap: 24rpx;
  }
  &__group {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }
  &__group-label {
    padding-left: 8rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    font-weight: 600;
  }
  &__entry-wrap { }
  &__more-error {
    padding: 24rpx;
    color: $brand-color-action;
    font-size: 24rpx;
    text-align: center;
  }
  &__end {
    padding-top: 8rpx;
  }
  /* 已删除区 */
  &__deleted {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }
  &__deleted-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18rpx 24rpx;
    border-radius: 14rpx;
    background: $brand-color-surface;
  }
  &__deleted-title {
    color: $brand-color-text-secondary;
    font-size: 26rpx;
    font-weight: 600;
  }
  &__deleted-toggle {
    color: $brand-color-action;
    font-size: 24rpx;
  }
  &__deleted-list {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
  }
  // ⑤ 筛选弹层（设计稿 C）：用 wd-popup 包住，避免手写 mask + @click.self
  // 在 uni-app .view 上不可靠导致"点 chip 弹窗就被关"的问题。
  // panel 圆角 + 底部安全距离由 wd-popup 自己处理，sheet 内部只负责内容排版。
  &__sheet {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    padding: 24rpx 28rpx 40rpx;
    background: $brand-color-surface;
  }
  &__sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8rpx;
  }
  &__sheet-title {
    color: $brand-color-text;
    font-size: 32rpx;
    font-weight: 700;
  }
  &__sheet-close {
    display: flex;
    width: 48rpx;
    height: 48rpx;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: background .15s ease;
    &:active {
      background: rgba($brand-color-border, .4);
    }
  }
  &__sheet-close-icon {
    color: $brand-color-text-secondary;
    font-size: 40rpx;
    font-weight: 300;
    line-height: 1;
  }
  &__sheet-body {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    padding: 8rpx 0 4rpx;
  }
  &__sheet-label {
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    font-weight: 500;
    margin-top: 8rpx;
  }
  &__sheet-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 14rpx;
  }
  &__sheet-chip {
    display: flex;
    align-items: center;
    padding: 14rpx 26rpx;
    border: 2rpx solid transparent;
    border-radius: 999rpx;
    background: rgba($brand-color-border, .35);
    transition: all .15s ease;
    &--active {
      border-color: $brand-color-primary;
      background: #e8f8f1;
    }
  }
  &__sheet-chip-text {
    color: $brand-color-text-secondary;
    font-size: 26rpx;
    font-weight: 500;
    line-height: 1.2;
    transition: color .15s ease;
  }
  &__sheet-chip--active &__sheet-chip-text {
    color: $brand-color-action;
    font-weight: 600;
  }
  &__sheet-footer {
    padding-top: 8rpx;
  }
}
</style>
