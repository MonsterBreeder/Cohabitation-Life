<!--
  首页本月账本小卡（PRD 008 优化 R11-R15 + 用户反馈：同时显示支出和收入）。
  视觉跟 home-completed-link 同款：
  - 浅色卡片背景 + 圆角
  - 左侧 icon（账本 logo / 错误时 warning / 加载时转圈）
  - 中间：支出 / 收入两个数字并排（各带"支出"/"收入"小标签）
  - 右侧箭头
  四个状态：
  - loading：转圈 + "正在加载账本统计"
  - error：warning icon + "暂时无法读取" + 重试按钮
  - success：账本 icon + 支出 ¥X · 收入 ¥Y + "看看账本 →"
  - empty（数据 null 且无 loading/error）：保持隐藏，由父组件 v-if 控制
-->
<template>
  <view
    v-if="loading"
    class="monthly-expense-card"
    data-testid="monthly-expense-card-loading"
  >
    <view class="monthly-expense-card__icon">
      <wd-loading color="#267A5A" size="32rpx" />
    </view>
    <view class="monthly-expense-card__text">
      <text class="monthly-expense-card__title">正在加载账本统计</text>
      <text class="monthly-expense-card__copy">本月家庭共同账目</text>
    </view>
  </view>

  <view
    v-else-if="errorMessage"
    class="monthly-expense-card monthly-expense-card--error"
    data-testid="monthly-expense-card-error"
  >
    <view class="monthly-expense-card__icon">
      <wd-icon name="warning" size="40rpx" color="#BA564B" />
    </view>
    <view class="monthly-expense-card__text">
      <text class="monthly-expense-card__title">暂时无法读取</text>
      <text class="monthly-expense-card__copy">{{ errorMessage }}</text>
    </view>
    <wd-button size="small" plain @click.stop="onRetry">重试</wd-button>
  </view>

  <view
    v-else-if="expenseCents !== null"
    class="monthly-expense-card"
    data-testid="monthly-expense-card"
    @click="onPress"
  >
    <view class="monthly-expense-card__icon">
      <!-- Wot UI iconfont 里 `wallet` 字符没字形会渲染为空（项目规则明确禁用）。
           `book` 才是账本的语义替身。 -->
      <wd-icon name="book" size="40rpx" color="#267A5A" />
    </view>
    <view class="monthly-expense-card__text">
      <text class="monthly-expense-card__title">看看账本本月</text>
      <view class="monthly-expense-card__numbers">
        <view class="monthly-expense-card__number">
          <text class="monthly-expense-card__number-label">支出</text>
          <text class="monthly-expense-card__number-value monthly-expense-card__number-value--expense">
            {{ expenseText }}
          </text>
        </view>
        <view class="monthly-expense-card__number-divider" />
        <view class="monthly-expense-card__number">
          <text class="monthly-expense-card__number-label">收入</text>
          <text class="monthly-expense-card__number-value monthly-expense-card__number-value--income">
            {{ incomeText }}
          </text>
        </view>
      </view>
    </view>
    <text class="monthly-expense-card__arrow">›</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatYuan } from '../../utils/format'

interface Props {
  /** 当月支出（分）；null = 还没加载（此时父组件应当不渲染本组件）。 */
  expenseCents: number | null
  /** 当月收入（分）；null = 还没加载。 */
  incomeCents?: number | null
  loading: boolean
  errorMessage: string | null
}
const props = withDefaults(defineProps<Props>(), {
  incomeCents: null,
})
const emit = defineEmits<{ (e: 'press'): void; (e: 'retry'): void }>()

const expenseText = computed(() => formatYuan(props.expenseCents || 0, { sign: 'none' }))
const incomeText = computed(() => formatYuan(props.incomeCents || 0, { sign: 'none' }))

function onPress(): void {
  emit('press')
}

function onRetry(): void {
  emit('retry')
}
</script>

<style lang="scss" scoped>
.monthly-expense-card {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-top: 24rpx;
  padding: 24rpx 24rpx;
  border-radius: 20rpx;
  background: $brand-color-surface;
  transition: transform .12s ease, background .15s ease;
  &:active {
    transform: scale(.99);
    background: #effbf5;
  }
  &--error {
    background: rgba($brand-color-surface, .95);
  }
  &__icon {
    width: 64rpx;
    height: 64rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16rpx;
    background: #effbf5;
    flex-shrink: 0;
  }
  &__text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 8rpx;
    min-width: 0;
  }
  &__title {
    color: $brand-color-text;
    font-size: 24rpx;
    font-weight: 500;
    line-height: 1.3;
  }
  &__copy {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
    line-height: 1.4;
  }
  // 支出 / 收入双数字：左 label + 右金额，flex 横向并排，中间一道浅灰分割线
  &__numbers {
    display: flex;
    align-items: center;
    gap: 16rpx;
  }
  &__number {
    display: flex;
    align-items: baseline;
    gap: 8rpx;
  }
  &__number-label {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
    font-weight: 400;
  }
  &__number-value {
    font-size: 32rpx;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  &__number-value--expense {
    color: $brand-color-accent;
  }
  &__number-value--income {
    color: $brand-color-primary;
  }
  &__number-divider {
    width: 1rpx;
    height: 28rpx;
    background: rgba($brand-color-text, .12);
  }
  &__arrow {
    color: $brand-color-text-secondary;
    font-size: 40rpx;
    font-weight: 300;
    line-height: 1;
    flex-shrink: 0;
  }
}
</style>
