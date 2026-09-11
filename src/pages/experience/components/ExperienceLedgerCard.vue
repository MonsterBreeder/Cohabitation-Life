<template>
  <!-- 体验页账本卡：支出/收入 tab + 金额输入 + 类目 + 提交。错误紧邻输入展示。 -->
  <view class="experience-ledger-card" data-testid="experience-ledger-card">
    <view class="experience-ledger-card__tabs">
      <view
        v-for="tab in typeTabs"
        :key="tab.value"
        class="experience-ledger-card__tab"
        :class="{ 'experience-ledger-card__tab--active': entryType === tab.value }"
        :data-testid="`experience-ledger-tab-${tab.value}`"
        @click="handleTypeChange(tab.value)"
      >
        <text :style="{ color: entryType === tab.value ? tab.color : '#74847D' }">{{ tab.label }}</text>
      </view>
    </view>

    <view class="experience-ledger-card__amount">
      <text class="experience-ledger-card__currency">¥</text>
      <input
        v-model="amountText"
        class="experience-ledger-card__input"
        type="digit"
        placeholder="0.00"
        placeholder-class="experience-ledger-card__placeholder"
        :disabled="disabled"
        data-testid="experience-ledger-amount"
        @input="handleAmountInput"
      />
    </view>
    <text v-if="errorMessage" class="experience-ledger-card__error" data-testid="experience-ledger-error">{{ errorMessage }}</text>

    <view class="experience-ledger-card__categories">
      <view
        v-for="category in categories"
        :key="category.id"
        class="experience-ledger-card__category"
        :class="{ 'experience-ledger-card__category--active': entryType && categoryId === category.id }"
        :data-testid="`experience-ledger-category-${category.id}`"
        @click="handleCategoryChange(category.id)"
      >
        <text class="experience-ledger-card__category-dot" :style="{ background: category.colorHex }" />
        <text class="experience-ledger-card__category-label">{{ category.label }}</text>
      </view>
    </view>

    <view class="experience-ledger-card__stats">
      <view class="experience-ledger-card__stat">
        <text class="experience-ledger-card__stat-label">支出</text>
        <text class="experience-ledger-card__stat-value experience-ledger-card__stat-value--expense">¥{{ formatYuan(stats.expenseCents) }}</text>
      </view>
      <view class="experience-ledger-card__stat">
        <text class="experience-ledger-card__stat-label">收入</text>
        <text class="experience-ledger-card__stat-value experience-ledger-card__stat-value--income">¥{{ formatYuan(stats.incomeCents) }}</text>
      </view>
    </view>

    <view class="experience-ledger-card__categories-stats">
      <text v-for="category in categories" :key="category.id" class="experience-ledger-card__category-stat">
        {{ category.label }}：¥{{ formatYuan(stats.byCategoryCents[category.id] ?? 0) }}
      </text>
    </view>

    <view class="experience-ledger-card__action">
      <wd-button
        size="small"
        round
        data-testid="experience-ledger-submit"
        custom-class="experience-ledger-card__btn"
        @click="handleSubmit"
      >记一笔</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ExperienceEntryType, ExperienceLedgerCategory, ExperienceLedgerStats } from '../../../types/experience'

interface Props {
  categories: ExperienceLedgerCategory[]
  stats: ExperienceLedgerStats
  disabled: boolean
  errorMessage: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  submit: [input: { type: ExperienceEntryType; amountText: string; categoryId: string }]
  'reset-stats': []
}>()

const typeTabs: { value: ExperienceEntryType; label: string; color: string }[] = [
  { value: 'expense', label: '支出', color: '#FF8F79' },
  { value: 'income', label: '收入', color: '#43C89A' },
]

const entryType = ref<ExperienceEntryType>('expense')
const amountText = ref('')
const categoryId = ref<string>(props.categories[0]?.id ?? '')

// 父组件统计清零时同步清空本地草稿；确保"恢复示例"按钮是幂等入口。
watch(() => props.stats, (next) => {
  if (next.expenseCents === 0 && next.incomeCents === 0) {
    amountText.value = ''
    categoryId.value = props.categories[0]?.id ?? ''
  }
})

function handleTypeChange(type: ExperienceEntryType): void {
  entryType.value = type
}

function handleCategoryChange(id: string): void {
  categoryId.value = id
}

function handleAmountInput(event: { detail: { value: string } }): void {
  amountText.value = event.detail.value
}

function handleSubmit(): void {
  if (!entryType.value || !categoryId.value) return
  emit('submit', { type: entryType.value, amountText: amountText.value.trim(), categoryId: categoryId.value })
}

function formatYuan(cents: number): string {
  const yuan = cents / 100
  return Number.isInteger(yuan) ? `${yuan}.00` : yuan.toFixed(2)
}
</script>

<style lang="scss" scoped>
.experience-ledger-card {
  /* 体验账本卡：tabs + 金额 + 类目 + 统计。 */
  padding: 24rpx 28rpx;
  border: 2rpx solid $brand-color-border;
  border-radius: $brand-radius-card;
  background: $brand-color-surface;
  margin-bottom: 16rpx;

  &__tabs {
    display: flex;
    gap: 20rpx;
  }
  &__tab {
    padding: 8rpx 18rpx;
    border-radius: 24rpx;
    background: $brand-color-background;
    font-size: 24rpx;
  }
  &__tab--active {
    background: rgba($brand-color-primary, .12);
  }
  &__amount {
    display: flex;
    align-items: baseline;
    margin-top: 20rpx;
  }
  &__currency {
    color: $brand-color-text-secondary;
    font-size: 32rpx;
    margin-right: 8rpx;
  }
  &__input {
    flex: 1;
    color: $brand-color-text;
    font-size: 44rpx;
    font-weight: 700;
    line-height: 1.4;
  }
  &__placeholder {
    color: #c0c0c0;
  }
  &__error {
    display: block;
    margin-top: 8rpx;
    color: #ba564b;
    font-size: 24rpx;
  }
  &__categories {
    display: flex;
    flex-wrap: wrap;
    gap: 14rpx;
    margin-top: 20rpx;
  }
  &__category {
    display: flex;
    align-items: center;
    padding: 12rpx 18rpx;
    border: 2rpx solid transparent;
    border-radius: 24rpx;
    background: $brand-color-background;
  }
  &__category--active {
    border-color: $brand-color-primary;
  }
  &__category-dot {
    width: 16rpx;
    height: 16rpx;
    border-radius: 50%;
    margin-right: 10rpx;
  }
  &__category-label {
    color: $brand-color-text;
    font-size: 24rpx;
  }
  &__stats {
    display: flex;
    gap: 24rpx;
    margin-top: 20rpx;
  }
  &__stat {
    flex: 1;
    padding: 12rpx 18rpx;
    border-radius: $brand-radius-input;
    background: $brand-color-background;
  }
  &__stat-label {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
  }
  &__stat-value {
    display: block;
    margin-top: 6rpx;
    font-size: 30rpx;
    font-weight: 700;
  }
  &__stat-value--expense { color: $brand-color-accent; }
  &__stat-value--income { color: $brand-color-primary; }
  &__categories-stats {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
    margin-top: 14rpx;
    color: $brand-color-text-secondary;
    font-size: 22rpx;
  }
  &__action {
    display: flex;
    justify-content: flex-end;
    margin-top: 20rpx;
  }
  :deep(.experience-ledger-card__btn) {
    height: 60rpx;
    padding: 0 32rpx;
    background: $brand-color-action;
    color: #ffffff;
    font-size: 24rpx;
  }
}
</style>
