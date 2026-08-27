<!--
  账目详情页（PRD 008 / Plan U6）。
  区块：① 顶部类型 + 金额大字号 ② 付款人 / 备注 / 时间 ③ 凭证图（点击放大） ④ 操作区（编辑/删除）。
  Module C：沿用品牌色 + Wot UI + 类目色。
-->
<template>
  <view class="ledger-detail-page">
    <wd-toast />

    <view v-if="!entryId" class="ledger-detail-page__state" data-testid="ledger-detail-missing-id">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="ledger-detail-page__state-title">无法读取账目</text>
    </view>

    <view v-else-if="!detail && !loadError" class="ledger-detail-page__state" data-testid="ledger-detail-loading">
      <wd-loading color="#267A5A" size="40rpx" />
      <text class="ledger-detail-page__state-title">正在加载账目详情</text>
    </view>

    <view v-else-if="loadError" class="ledger-detail-page__state" data-testid="ledger-detail-error">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="ledger-detail-page__state-title">暂时无法读取</text>
      <text class="ledger-detail-page__state-copy">{{ loadError }}</text>
      <wd-button block round variant="plain" @click="reload">重新加载</wd-button>
    </view>

    <view v-else-if="detail" class="ledger-detail-page__content" data-testid="ledger-detail-card">
      <!-- 顶部：类目色带 + 金额 -->
      <view class="ledger-detail-page__header" :style="{ '--category-color': category.colorHex }">
        <view class="ledger-detail-page__type-mark" :style="{ background: category.colorHex }" />
        <view class="ledger-detail-page__head-text">
          <text class="ledger-detail-page__type-label">{{ typeLabel }}</text>
          <text class="ledger-detail-page__category-name">{{ category.name }}</text>
          <text class="ledger-detail-page__amount" :style="{ color: amountColor }">{{ amountText }}</text>
        </view>
      </view>

      <!-- 付款人 + 时间 + 备注 + 凭证 -->
      <view class="ledger-detail-page__panel">
        <view class="ledger-detail-page__row">
          <text class="ledger-detail-page__row-label">付款人</text>
          <text class="ledger-detail-page__row-value">{{ payerLine }}</text>
        </view>
        <view v-if="detail.note" class="ledger-detail-page__row">
          <text class="ledger-detail-page__row-label">备注</text>
          <text class="ledger-detail-page__row-value">{{ detail.note }}</text>
        </view>
        <view class="ledger-detail-page__row">
          <text class="ledger-detail-page__row-label">发生时间</text>
          <text class="ledger-detail-page__row-value">{{ whenLine }}</text>
        </view>
        <view class="ledger-detail-page__row">
          <text class="ledger-detail-page__row-label">创建时间</text>
          <text class="ledger-detail-page__row-value">{{ formatRelativeTime(detail.createdAt) }}</text>
        </view>
        <view v-if="detail.updatedAt && detail.updatedAt !== detail.createdAt" class="ledger-detail-page__row">
          <text class="ledger-detail-page__row-label">最后修改</text>
          <text class="ledger-detail-page__row-value">{{ formatRelativeTime(detail.updatedAt) }}</text>
        </view>
        <view v-if="detail.receiptMediaId" class="ledger-detail-page__receipt">
          <text class="ledger-detail-page__row-label">凭证</text>
          <view class="ledger-detail-page__receipt-wrap" data-testid="ledger-detail-receipt" @click="onPreviewReceipt">
            <image class="ledger-detail-page__receipt-image" :src="receiptUrl" mode="aspectFill" />
            <text class="ledger-detail-page__receipt-hint">点击查看原图</text>
          </view>
        </view>
      </view>

      <text v-if="storeError" class="ledger-detail-page__error">{{ storeError }}</text>

      <!-- 操作区 -->
      <view v-if="availability.edit || availability.delete" class="ledger-detail-page__actions">
        <wd-button
          v-if="availability.edit"
          block
          round
          type="primary"
          :loading="isEditing"
          :disabled="isBusy"
          data-testid="ledger-detail-edit"
          @click="onEdit"
        >编辑</wd-button>
        <wd-button
          v-if="availability.delete"
          block
          round
          plain
          custom-class="ledger-detail-page__delete-btn"
          :loading="isDeleting"
          :disabled="isBusy"
          data-testid="ledger-detail-delete"
          @click="onDelete"
        >删除</wd-button>
      </view>
      <view v-else class="ledger-detail-page__readonly" data-testid="ledger-detail-readonly">
        <text class="ledger-detail-page__readonly-text">只有记账人可以编辑或删除</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useHouseholdStore } from '../../../store/modules/household'
import { useLedgerStore } from '../../../store/modules/ledger'
import {
  describeActions,
  describeAmountColor,
  describeAmountLine,
  describeDeleteConfirmMessage,
  describePayerLine,
  describeTypeLabel,
  describeWhenLine,
  formatRelativeTime,
} from './ledger-detail-view'
import { describeCategory } from '../../../pages/ledger/ledger-home-view'
import type { LedgerCategory, LedgerEntryDetail } from '../../../types/ledger'

const householdStore = useHouseholdStore()
const ledgerStore = useLedgerStore()

const { household, profile } = storeToRefs(householdStore)
const { categories, phase, errorMessage: storeError } = storeToRefs(ledgerStore)

const entryId = ref<string>('')
const detail = ref<LedgerEntryDetail | null>(null)
const isDeleting = ref(false)
const isEditing = ref(false)
const receiptUrl = ref<string>('')

const householdId = computed(() => household.value?.id || '')

// 编辑/删除按钮的显隐直接由云端在 getEntry 响应里告诉前端（canEdit / canDelete）。
// 不再由前端比 selfMemberKey——前端没有 identityKey，没法自己算。
const availability = computed(() => describeActions(detail.value || undefined))
const amountText = computed(() => describeAmountLine(detail.value || undefined))
const amountColor = computed(() => describeAmountColor(detail.value?.type))
const typeLabel = computed(() => describeTypeLabel(detail.value?.type))
const payerLine = computed(() => describePayerLine(detail.value || undefined))
const whenLine = computed(() => describeWhenLine(detail.value || undefined))
const category = computed<{ id: string; name: string; colorHex: string; iconName: string }>(() => {
  if (!detail.value) return { id: '__none__', name: '', colorHex: '#74847D', iconName: 'tag' }
  const c = categories.value.find((x) => x.id === detail.value!.categoryId)
  if (!c) return { id: detail.value.categoryId, name: '其他', colorHex: '#74847D', iconName: 'tag' }
  return describeCategory(c) as any
})

const isBusy = computed(() => isDeleting.value || isEditing.value || phase.value === 'deleting')
const loadError = computed(() => storeError.value)

onLoad(async (options: any) => {
  if (options && options.entryId) {
    entryId.value = options.entryId
    if (householdId.value) ledgerStore.setHouseholdContext(householdId.value, '')
    await reload()
  }
})

// 编辑页 navigateBack 回来时主动重新拉取：详情页 detail 是页面局部 ref，
// 没有跟 store.entries 双向绑定，编辑后 store 里的 summary 已经更新
// （ledgerStore.updateEntry 会替换 entries 数组里的同 id 条目），但页面 detail 不会
// 自动响应——所以必须在 onShow 显式 reload 一次。
// firstShow 标志位：uni-app 首次进入页面会先触发 onLoad 再触发 onShow，
// 这里跳过首次 onShow，避免和 onLoad 重复请求。
let firstShow = true
onShow(() => {
  if (firstShow) {
    firstShow = false
    return
  }
  if (entryId.value) void reload()
})

async function reload(): Promise<void> {
  if (!entryId.value) return
  try {
    // 走 store action：subpackage 页面不能 `await import('...services/...')`，
    // mp-weixin 构建会把 `await import('...')` 错误地编成 `await <string>`，
    // 然后解构出 undefined，调用时抛 "_e is not a function"。
    // store 顶层 import 已经 work，detail / edit 页都通过 store 调云函数。
      const loaded = await ledgerStore.loadEntry(entryId.value)
    if (loaded) {
      detail.value = loaded
      if (loaded.receiptMediaId) {
        receiptUrl.value = loaded.receiptUrl || await resolveReceiptUrl(loaded.receiptMediaId)
      }
    } else {
      // loadEntry 已把 errorMessage 写到 store；UI 通过 storeError 读
    }
  } catch (err) {
    ledgerStore.applyError(err instanceof Error ? err : new Error(String(err)))
  }
}

function onPreviewReceipt(): void {
  if (!receiptUrl.value) return
  uni.previewImage({ urls: [receiptUrl.value] })
}

async function resolveReceiptUrl(mediaId: string): Promise<string> {
  const wxApi = (globalThis as any).wx
  if (!wxApi || !wxApi.cloud || !wxApi.cloud.getTempFileURL) return ''
  return new Promise<string>((resolve) => {
    wxApi.cloud.getTempFileURL({
      fileList: [mediaId],
      success: (res: any) => {
        const list = res && res.fileList
        if (Array.isArray(list) && list.length > 0 && list[0].tempFileURL) resolve(list[0].tempFileURL)
        else resolve('')
      },
      fail: () => resolve(''),
    })
  })
}

function onEdit(): void {
  if (!detail.value) return
  isEditing.value = true
  const operationToken = `edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  uni.navigateTo({
    url: `/subpackages/ledger/ledger-add/index?mode=edit&entryId=${detail.value.id}&operationToken=${operationToken}`,
  })
  setTimeout(() => { isEditing.value = false }, 500)
}

function onDelete(): void {
  if (!detail.value) return
  uni.showModal({
    title: '删除账目',
    content: describeDeleteConfirmMessage(detail.value),
    confirmText: '继续',
    cancelText: '取消',
    confirmColor: '#BA564B',
    success: async (res: any) => {
      if (!res.confirm) return
      isDeleting.value = true
      const operationToken = `delete_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const ok = await ledgerStore.deleteEntry({ entryId: detail.value!.id, operationToken })
      isDeleting.value = false
      if (ok) {
        uni.navigateBack({ delta: 1 })
      } else {
        uni.showToast({ title: ledgerStore.errorMessage || '删除失败', icon: 'none' })
      }
    },
  })
}
</script>

<style lang="scss" scoped>
.ledger-detail-page {
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
  &__header {
    display: flex;
    align-items: center;
    gap: 20rpx;
    padding: 32rpx 28rpx;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
    box-shadow: 0 2rpx 16rpx rgba(38, 122, 90, 0.04);
  }
  &__type-mark {
    width: 12rpx;
    align-self: stretch;
    border-radius: 6rpx;
    flex-shrink: 0;
  }
  &__head-text {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
    flex: 1;
  }
  &__type-label {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
  }
  &__category-name {
    color: $brand-color-text;
    font-size: 30rpx;
    font-weight: 600;
    line-height: 1.3;
  }
  &__amount {
    font-size: 60rpx;
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  &__panel {
    display: flex;
    flex-direction: column;
    padding: 8rpx 28rpx;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
  }
  &__row {
    display: flex;
    align-items: center;
    gap: 24rpx;
    padding: 24rpx 0;
    border-bottom: 1rpx solid $brand-color-border;
  }
  &__row:last-child {
    border-bottom: 0;
  }
  &__row-label {
    width: 140rpx;
    color: $brand-color-text-secondary;
    font-size: 26rpx;
    flex-shrink: 0;
  }
  &__row-value {
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 500;
    flex: 1;
    word-break: break-all;
  }
  &__receipt {
    padding: 24rpx 0;
  }
  &__receipt-wrap {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    margin-top: 16rpx;
  }
  &__receipt-image {
    width: 100%;
    height: 480rpx;
    border-radius: 16rpx;
  }
  &__receipt-hint {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
    text-align: center;
  }
  &__error {
    display: block;
    color: #c5684d;
    font-size: 25rpx;
    text-align: center;
  }
  &__actions {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    margin-top: 16rpx;
  }
  &__delete-btn {
    color: $brand-color-accent;
    border-color: $brand-color-accent;
  }
  &__readonly {
    display: flex;
    justify-content: center;
    padding: 24rpx 0;
  }
  &__readonly-text {
    color: $brand-color-text-secondary;
    font-size: 24rpx;
  }
}
</style>
