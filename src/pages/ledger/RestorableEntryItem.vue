<!--
  已删除区账目项：灰态显示 + 恢复按钮。
-->
<template>
  <view class="restorable-entry" :data-testid="`restorable-entry-${entry.id}`">
    <view class="restorable-entry__main">
      <text class="restorable-entry__category">{{ categoryName }}</text>
      <text class="restorable-entry__meta">{{ amountText }} · {{ hint }}</text>
    </view>
    <wd-button size="small" plain type="primary" :data-testid="`restorable-entry-restore-${entry.id}`" @click="onRestore">恢复</wd-button>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { LedgerCategory } from '../../types/ledger'
import { describeDeletedEntryHint, describeEntryAmount, type CategoryView } from './ledger-home-view'

interface Props {
  entry: LedgerCategory & { deletedAt?: string | null; amountCents: number; type: 'expense' | 'income'; id: string }
  category: CategoryView | undefined
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'restore', entryId: string): void }>()

const categoryName = computed(() => props.category?.name ?? '已删除类目')
const amountText = computed(() => describeEntryAmount(props.entry.type, props.entry.amountCents))
const hint = computed(() => describeDeletedEntryHint(props.entry.deletedAt || null))

function onRestore(): void {
  emit('restore', props.entry.id)
}
</script>

<style lang="scss" scoped>
.restorable-entry {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 24rpx;
  border-radius: 14rpx;
  background: rgba($brand-color-border, .4);
  opacity: .9;
}
.restorable-entry__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}
.restorable-entry__category {
  color: $brand-color-text-secondary;
  font-size: 26rpx;
  font-weight: 500;
  line-height: 1.3;
}
.restorable-entry__meta {
  color: $brand-color-text-secondary;
  font-size: 22rpx;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}
</style>
