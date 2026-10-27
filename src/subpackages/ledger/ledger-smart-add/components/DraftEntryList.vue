<!-- 文件用途：逐笔展示完整待确认账目和明确的修改移除操作，成功项保持只读。 -->
<template>
  <view class="draft-entry-list">
    <text class="draft-entry-list__title">核对这{{ entries.length }}笔</text>
    <text class="draft-entry-list__hint">检查金额、日期和对应成员，确认后才会记入账本。</text>
    <view
      v-for="(item, index) in entries"
      :key="item.id"
      class="draft-entry-list__card"
      :data-testid="`smart-draft-entry-${index}`"
    >
      <view class="draft-entry-list__heading">
        <text>{{ index + 1 }} · {{ label(categories, item.categoryKey) }}</text>
        <text class="draft-entry-list__amount">
          {{ item.type === 'income' ? '+' : '−' }} ¥{{ yuan(item.amountCents) }}
        </text>
      </view>
      <view class="draft-entry-list__row">
        <text>类型</text>
        <text>{{ item.type === 'income' ? '收入' : item.type === 'expense' ? '支出' : '待补充' }}</text>
      </view>
      <view class="draft-entry-list__row">
        <text>日期</text>
        <text>{{ item.date || '待补充' }}</text>
      </view>
      <view class="draft-entry-list__row">
        <text>{{ item.type === 'income' ? '收入成员' : '付款人' }}</text>
        <text>{{ label(members, item.memberKey) }}</text>
      </view>
      <view v-if="item.mealPeriod" class="draft-entry-list__row">
        <text>餐段</text>
        <text>{{ meals[item.mealPeriod] }}</text>
      </view>
      <view v-if="item.note" class="draft-entry-list__row">
        <text>备注</text>
        <text class="draft-entry-list__note">{{ item.note }}</text>
      </view>
      <view class="draft-entry-list__actions">
        <text v-if="successful.has(item.id)" class="draft-entry-list__saved">已保存</text>
        <template v-else>
          <wd-button size="small" plain :disabled="disabled" @click="emit('edit', item.id)">修改</wd-button>
          <wd-button size="small" type="info" plain :disabled="disabled" @click="emit('remove', item.id)">
            移除
          </wd-button>
        </template>
      </view>
    </view>
    <text v-if="!entries.length" class="draft-entry-list__hint">清单为空，请重新描述要记录的收支。</text>
  </view>
</template>

<script setup lang="ts">
import type { DraftChoice, DraftEntry } from '../../../../types/ledger-draft'
/** 只读清单与当前范围资料由父级提供。 */
defineProps<{
  entries: readonly DraftEntry[]
  categories: readonly DraftChoice[]
  members: readonly DraftChoice[]
  successful: ReadonlySet<string>
  disabled: boolean
}>()
/** 组件不直接修改父级资料或保存账本。 */
const emit = defineEmits<{ edit: [id: string]; remove: [id: string] }>()
/** 固定餐段名称，不根据当前时间增加内容。 */
const meals = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }
/** 查找短编号的当前显示名称，缺失时说明需补充。 */
function label(
  /**
   * 当前范围中可选择的显示项目，不增加新的类目或成员。
   */
  choices: readonly DraftChoice[],
  /**
   * 当前比较或查回使用的键，具体含义由所在集合或结构限定。
   */
  key: string | null,
): string {
  return (
    choices.find(
      /**
       * 按当前稳定字段匹配单项，供后续核对；没有匹配时保持空值。
       */
      (
        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        item,
      ) => item.key === key,
    )?.name || '待补充'
  )
}
/** 金额仅用于显示，不把显示字符串重新写回账本。 */
function yuan(
  /**
   * 已经检查的整数分，显示换算不参与正式保存计算。
   */
  cents: number | null,
): string {
  return cents === null ? '待补充' : (cents / 100).toFixed(2)
}
</script>

<style lang="scss" scoped>
/* 清单卡片允许长备注换行，操作不只靠颜色区分。 */
.draft-entry-list {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  &__title {
    font-size: 40rpx;
    font-weight: 700;
  }
  &__hint {
    font-size: 24rpx;
    color: $brand-color-text-secondary;
    line-height: 1.7;
  }
  &__card {
    padding: 28rpx;
    background: $brand-color-surface;
    border: 1rpx solid $brand-color-border;
    border-radius: $brand-radius-card;
  }
  &__heading {
    display: flex;
    justify-content: space-between;
    gap: 12rpx;
    margin-bottom: 24rpx;
    font-size: 28rpx;
    font-weight: 600;
  }
  &__amount {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  &__row {
    display: flex;
    justify-content: space-between;
    gap: 24rpx;
    margin-top: 16rpx;
    font-size: 26rpx;
    line-height: 1.6;
  }
  &__note {
    max-width: 70%;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    text-align: right;
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 16rpx;
    border-top: 1rpx solid $brand-color-border;
    margin-top: 24rpx;
    padding-top: 20rpx;
  }
  &__saved {
    font-size: 24rpx;
    color: $brand-color-action;
  }
}
</style>
