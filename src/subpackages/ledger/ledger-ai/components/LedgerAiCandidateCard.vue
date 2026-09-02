<template>
  <view class="ledger-ai-candidate" :class="{ 'ledger-ai-candidate--inactive': !active }" :data-testid="`ledger-ai-candidate-${index}`" role="button" :aria-label="active ? '查看这笔账的详情' : '这条旧结果仅供阅读'" @click="active && emit('press', candidate.sourceRef)">
    <view class="ledger-ai-candidate__header">
      <text class="ledger-ai-candidate__index">第 {{ index }} 笔</text>
      <text class="ledger-ai-candidate__amount">{{ amountText }}</text>
    </view>
    <text class="ledger-ai-candidate__meta">{{ candidate.occurredAt.slice(0, 10) }} · {{ candidate.categoryName }} · {{ candidate.payerName }}</text>
    <text v-if="candidate.note" class="ledger-ai-candidate__note">{{ candidate.note }}</text>
    <view class="ledger-ai-candidate__reasons">
      <wd-tag v-for="reason in candidate.matchReasons" :key="reason" plain round type="primary">{{ reason }}</wd-tag>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatYuan } from '../../../../utils/format'
import type { LedgerAiCandidate } from '../../../../types/ledger-ai'

const props = defineProps<{ candidate: LedgerAiCandidate; index: number; active: boolean }>()
const emit = defineEmits<{ press: [sourceRef: string] }>()
// 金额只按真实整数分显示，候选卡不展示模型估算值。
const amountText = computed(() => formatYuan(props.candidate.amountCents, { sign: props.candidate.type === 'expense' ? 'expense' : 'income' }))
</script>

<style lang="scss" scoped>
.ledger-ai-candidate {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 22rpx;
  border: 2rpx solid $brand-color-border;
  border-radius: 20rpx;
  background: $brand-color-surface;
  transition: transform .12s ease, background .15s ease;
  &:active { transform: scale(.99); background: #f7fbf9; }
  &--inactive { opacity: .72; }
  &__header { display: flex; align-items: center; justify-content: space-between; }
  &__index { color: $brand-color-action; font-size: 25rpx; font-weight: 700; }
  &__amount { color: $brand-color-text; font-size: 30rpx; font-weight: 700; }
  &__meta { color: $brand-color-text-secondary; font-size: 23rpx; }
  &__note { color: $brand-color-text; font-size: 25rpx; line-height: 1.5; }
  &__reasons { display: flex; flex-wrap: wrap; gap: 8rpx; }
}
</style>
