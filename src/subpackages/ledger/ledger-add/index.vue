<!--
  记一笔 / 编辑账目页（PRD 008 / Plan U5）。
  - 顶部 tab：支出 / 收入
  - 金额大字号（AmountInput）
  - 类目 chip（CategoryPicker；"+ 添加" 弹窗）
  - 付款人（单成员家庭隐藏）
  - 备注（wd-textarea，0-100 字）
  - 时间（picker mode=date）
  - 凭证图（ReceiptUploader）
  - 保存按钮（底部）
-->
<template>
  <view class="ledger-add-page">
    <wd-toast />

    <view v-if="!householdId" class="ledger-add-page__state" data-testid="ledger-add-no-household">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="ledger-add-page__state-title">需要先有家</text>
    </view>

    <view v-else-if="!isReady" class="ledger-add-page__state" data-testid="ledger-add-loading">
      <wd-loading color="#267A5A" size="40rpx" />
      <text class="ledger-add-page__state-title">正在加载记账页</text>
    </view>

    <view v-else class="ledger-add-page__content" data-testid="ledger-add-form">
      <!-- 类型 tab -->
      <view class="ledger-add-page__tabs">
        <view
          v-for="tab in typeTabs"
          :key="tab.value"
          class="ledger-add-page__tab"
          :class="{ 'ledger-add-page__tab--active': draft.type === tab.value, [`ledger-add-page__tab--${tab.value}`]: true }"
          :data-testid="`ledger-add-tab-${tab.value}`"
          @click="onTypeChange(tab.value)"
        >
          {{ tab.label }}
        </view>
      </view>

      <!-- 金额 -->
      <view class="ledger-add-page__amount-block">
        <AmountInput
          v-model="draft.amountCents"
          :type="draft.type"
          :disabled="isBusy"
          test-id="ledger-add-amount"
          @error="onAmountError"
        />
        <!-- 错误提示延后显示：用户打开记账页时如果 modelValue=0，validateDraft 会立刻报"请输入金额"，
             加上 AmountInput 自带 placeholder "请输入金额" 就会双重红字，体验很差。
             submitAttempted 在第一次点保存时置 true，错误信息才浮现。 -->
        <text v-if="submitAttempted && errors.amount" class="ledger-add-page__validation" data-testid="ledger-add-amount-error">
          {{ errors.amount }}
        </text>
      </view>

      <!-- 类目 -->
      <view class="ledger-add-page__field">
        <text class="ledger-add-page__label">类目</text>
        <CategoryPicker
          v-if="visibleCategories.length > 0"
          :categories="visibleCategories"
          v-model="draft.categoryId"
          @add="onShowAddCategory"
        />
        <text v-else class="ledger-add-page__empty-tip">还没有类目，请到「类目管理」添加</text>
        <text v-if="errors.category" class="ledger-add-page__validation" data-testid="ledger-add-category-error">
          {{ errors.category }}
        </text>
      </view>

      <!-- 付款人（双成员家庭才显示） -->
      <view v-if="payerOptions.length > 1" class="ledger-add-page__field">
        <text class="ledger-add-page__label">付款人</text>
        <view class="ledger-add-page__payer-row">
          <view
            v-for="opt in payerOptions"
            :key="opt.value"
            class="ledger-add-page__payer-chip"
            :class="{ 'ledger-add-page__payer-chip--active': draft.payerMemberKey === opt.value }"
            :data-testid="`ledger-add-payer-${opt.value}`"
            @click="draft.payerMemberKey = opt.value"
          >
            {{ opt.label }}
          </view>
        </view>
      </view>

      <!-- 时间 -->
      <view class="ledger-add-page__field">
        <text class="ledger-add-page__label">发生时间</text>
        <picker
          mode="date"
          :value="dateValue"
          :start="'2020-01-01'"
          :end="maxDate"
          :disabled="isBusy"
          @change="onDateChange"
        >
          <view class="ledger-add-page__date-pill" data-testid="ledger-add-date-pill">
            <wd-icon name="calendar" size="32rpx" color="#74847D" />
            <text class="ledger-add-page__date-text">{{ occurredAtLabel }}</text>
          </view>
        </picker>
        <text v-if="errors.time" class="ledger-add-page__validation" data-testid="ledger-add-time-error">
          {{ errors.time }}
        </text>
      </view>

      <!-- 备注 -->
      <view class="ledger-add-page__field">
        <text class="ledger-add-page__label">备注（可选）</text>
        <wd-textarea
          v-model="draft.note"
          placeholder="0-100 字"
          :maxlength="100"
          :disabled="isBusy"
          data-testid="ledger-add-note"
        />
        <text class="ledger-add-page__count">{{ draft.note.length }} / 100</text>
      </view>

      <!-- 凭证 -->
      <view class="ledger-add-page__field">
        <text class="ledger-add-page__label">凭证（可选）</text>
        <ReceiptUploader
          ref="uploaderRef"
          v-model="draft.receiptMediaId"
          :household-id="householdId"
          :disabled="isBusy"
          test-id="ledger-add-receipt"
          @error="onReceiptError"
        />
      </view>

      <!-- 保存按钮 -->
      <view class="ledger-add-page__actions">
        <wd-button
          block
          round
          type="primary"
          :loading="isSaving"
          :disabled="!saveState.enabled"
          data-testid="ledger-add-save"
          @click="onSave"
        >{{ saveState.label }}</wd-button>
      </view>
    </view>

    <!-- 类目添加弹窗
         重做设计（frontend-design skill Module C）：
         - 旧版：图标行（8 wd-icon，大部分缺失）+ 颜色行（8 色块）+ 取消/添加 → 双层臃肿
         - 新版：8 个组合色块（颜色背景 + 中文首字）一行展示 + 类目名 input + 取消/添加
         - 遮罩：去掉 @click.self 关闭（uni-app 在 .view 上不可靠，用户的反馈"随意一点就关"），
                 改用弹窗右上角显式 X 按钮 + "取消" 按钮两种关闭方式
    -->
    <view v-if="showCategoryDialog" class="ledger-add-page__dialog-mask" data-testid="ledger-add-category-dialog">
      <view class="ledger-add-page__dialog">
        <view class="ledger-add-page__dialog-header">
          <text class="ledger-add-page__dialog-title">添加类目</text>
          <view
            class="ledger-add-page__dialog-close"
            data-testid="ledger-add-category-close"
            @click="showCategoryDialog = false"
          >
            <text class="ledger-add-page__dialog-close-icon">×</text>
          </view>
        </view>
        <view class="ledger-add-page__dialog-field">
          <text class="ledger-add-page__label">类目名（2-8 字）</text>
          <wd-input v-model="categoryDraft.name" placeholder="比如：宠物" data-testid="ledger-add-category-name" :maxlength="8" />
        </view>
        <view class="ledger-add-page__dialog-field">
          <text class="ledger-add-page__label">选择图标和颜色</text>
          <view class="ledger-add-page__preset-row">
            <view
              v-for="preset in categoryPresets"
              :key="preset.iconKey"
              class="ledger-add-page__preset"
              :class="{
                'ledger-add-page__preset--active':
                  categoryDraft.iconKey === preset.iconKey && categoryDraft.colorKey === preset.colorKey,
              }"
              :style="{ background: preset.hex }"
              :data-testid="`ledger-add-cat-preset-${preset.iconKey}`"
              @click="onSelectPreset(preset.iconKey, preset.colorKey)"
            >
              <text class="ledger-add-page__preset-char">{{ preset.firstChar }}</text>
            </view>
          </view>
        </view>
        <text v-if="categoryDialogError" class="ledger-add-page__validation" data-testid="ledger-add-cat-error">
          {{ categoryDialogError }}
        </text>
        <view class="ledger-add-page__dialog-actions">
          <wd-button size="small" plain @click="showCategoryDialog = false">取消</wd-button>
          <wd-button size="small" type="primary" :loading="isAddingCategory" :disabled="isAddingCategory" data-testid="ledger-add-cat-confirm" @click="onConfirmAddCategory">添加</wd-button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { onLoad } from '@dcloudio/uni-app'
import AmountInput from './components/AmountInput.vue'
import CategoryPicker from './components/CategoryPicker.vue'
import ReceiptUploader from './components/ReceiptUploader.vue'
import { useHouseholdStore } from '../../../store/modules/household'
import { useLedgerStore } from '../../../store/modules/ledger'
import { formatDateYMD } from '../../../utils/format'
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  CATEGORY_PRESETS,
  defaultAddDraft,
  defaultCategoryDraft,
  describeMonthForPicker,
  describeOccurredAtShort,
  describePayerOptions,
  describeSaveButton,
  describeTypeTabs,
  draftFromEntry,
  hasErrors,
  validateCategoryDraft,
  validateDraft,
  type AddEntryDraft,
  type CategoryDraft,
} from './ledger-add-view'
import { describeCategory } from '../../../pages/ledger/ledger-home-view'
import type { LedgerEntryType } from '../../../types/ledger'

const householdStore = useHouseholdStore()
const ledgerStore = useLedgerStore()

const { household, profile } = storeToRefs(householdStore)
const { categories } = storeToRefs(ledgerStore)

const householdId = computed(() => household.value?.id || '')

const isReady = ref(false)
const isBusy = ref(false)
const isSaving = ref(false)
// 错误信息延后显示：用户首次尝试保存时才浮现"金额/类目"等验证文案，
// 避免页面一打开就一片红字，干扰录入节奏。
const submitAttempted = ref(false)
const isAddingCategory = ref(false)

const draft = reactive<AddEntryDraft>(defaultAddDraft())
const showCategoryDialog = ref(false)
const categoryDraft = reactive<CategoryDraft>(defaultCategoryDraft())
const categoryDialogError = ref('')
const uploaderRef = ref()

const typeTabs = describeTypeTabs()
const iconOptions = CATEGORY_ICON_OPTIONS
const colorOptions = CATEGORY_COLOR_OPTIONS
// 类目预设（8 个"图标首字 + 颜色"组合），用于添加弹窗的合并选择（替代旧版"先选图标再选颜色"双层）
const categoryPresets = CATEGORY_PRESETS

const visibleCategories = computed(() => ledgerStore.visibleCategories.map((c) => describeCategory(c)))

// 'self' / 'other' 是字面量占位符（与 defaultAddDraft 的 payerMemberKey 默认值一致）。
// addEntry 调云端时云端会映射到真实 memberKey（self → 当前 identityKey；other → 另一位）。
const selfMemberKey = computed(() => 'self')
const otherMemberKey = computed(() => 'other')
const memberCount = computed(() => household.value?.memberCount || 1)
const payerOptions = computed(() => describePayerOptions(selfMemberKey.value, otherMemberKey.value, memberCount.value))

const dateValue = computed(() => formatDateYMD(draft.occurredAt || new Date().toISOString()))
const maxDate = computed(() => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return formatDateYMD(tomorrow.toISOString())
})
const occurredAtLabel = computed(() => describeOccurredAtShort(draft.occurredAt))

const errors = computed(() => validateDraft(draft))
const saveState = computed(() => describeSaveButton(errors.value, isSaving.value, isEditMode.value))

const isEditMode = ref(false)
const editingEntryId = ref<string | null>(null)
const editingOperationToken = ref<string>('')

onLoad((options: any) => {
  if (options && options.mode === 'edit' && options.entryId) {
    isEditMode.value = true
    editingEntryId.value = options.entryId
    editingOperationToken.value = options.operationToken || ''
    void loadForEdit(options.entryId)
  } else {
    isReady.value = true
  }
  // 设置 context（云端会从 identityKey 解析 selfMemberKey）
  if (householdId.value) ledgerStore.setHouseholdContext(householdId.value, '')
  // 确保类目已加载
  if (categories.value.length === 0) void ledgerStore.loadCategories()
})

async function loadForEdit(entryId: string): Promise<void> {
  try {
    // 走 store action 而不是 `await import('...services/ledger-cloud')`：
    // mp-weixin 构建会把 `await import('...')` 错误地编成 `await <string>`，
    // 然后解构出 undefined、调用时抛 "_e is not a function"。
    const loaded = await ledgerStore.loadEntry(entryId)
    if (loaded) {
      // 把真实 memberKey 翻译成 'self' / 'other' 字面量：
      // 前端不持有 identityKey（云端从 APPID+OPENID 算出来），selfMemberKey 一直是空串；
      // 不能在 chip 渲染时用真实 key 与 'self'/'other' 直接比较。
      // 服务端在 getEntry 响应里通过 isCurrentUserPayer 告诉我们这条账目是不是当前用户付的。
      // 单成员家庭只有 'self' 选项（payerOptions 不会渲染 '对方' chip），落到 'other' 会无效。
      const loadedPayerKey: 'self' | 'other' = loaded.isCurrentUserPayer
        ? 'self'
        : (memberCount.value >= 2 ? 'other' : 'self')
      // 注意：直接覆盖 draft.payerMemberKey，而不是用 draftFromEntry 的 memberKey 默认逻辑，
      // 那样会写入真实 memberKey（user_xxx），导致 chip 永远不亮。
      const fallbackDraft = draftFromEntry({
        type: loaded.type,
        amountCents: loaded.amountCents,
        categoryId: loaded.categoryId,
        payer: loaded.payer,
        note: loaded.note,
        occurredAt: loaded.occurredAt,
        receiptMediaId: loaded.receiptMediaId,
      })
      Object.assign(draft, { ...fallbackDraft, payerMemberKey: loadedPayerKey })
    } else if (ledgerStore.errorMessage) {
      uni.showToast({ title: ledgerStore.errorMessage, icon: 'none' })
    }
    isReady.value = true
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '加载失败', icon: 'none' })
    isReady.value = true
  }
}

function onTypeChange(type: LedgerEntryType): void {
  draft.type = type
}

function onAmountError(_msg: string): void {
  // 错误由 errors 派生显示
}

function onDateChange(e: any): void {
  const value = e && e.detail && e.detail.value
  if (!value) return
  // 把 yyyy-MM-dd 拼成当天本地 12:00（避免时区错位）
  const [y, m, d] = value.split('-').map((v: string) => Number.parseInt(v, 10))
  if (!y || !m || !d) return
  draft.occurredAt = new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

function onReceiptError(msg: string): void {
  uni.showToast({ title: msg, icon: 'none' })
}

function onShowAddCategory(): void {
  Object.assign(categoryDraft, defaultCategoryDraft())
  categoryDialogError.value = ''
  showCategoryDialog.value = true
}

/** 选一个预设色块 = 同时设置 iconKey + colorKey。点击同一色块切换"已选/未选" */
function onSelectPreset(iconKey: string, colorKey: string): void {
  // 再次点击同一组合 = 反选（重置成 defaultCategoryDraft 的 tag/gray）
  if (categoryDraft.iconKey === iconKey && categoryDraft.colorKey === colorKey) {
    categoryDraft.iconKey = defaultCategoryDraft().iconKey
    categoryDraft.colorKey = defaultCategoryDraft().colorKey
  } else {
    categoryDraft.iconKey = iconKey
    categoryDraft.colorKey = colorKey
  }
}

async function onConfirmAddCategory(): Promise<void> {
  const errorMessage = validateCategoryDraft(categoryDraft)
  if (errorMessage) {
    categoryDialogError.value = errorMessage
    return
  }
  isAddingCategory.value = true
  const requestId = `addcat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const result = await ledgerStore.addCategory({
    requestId,
    name: categoryDraft.name,
    iconKey: categoryDraft.iconKey as any,
    colorKey: categoryDraft.colorKey as any,
  })
  isAddingCategory.value = false
  if (result) {
    draft.categoryId = result.id
    showCategoryDialog.value = false
  } else {
    categoryDialogError.value = ledgerStore.errorMessage || '添加类目失败'
  }
}

async function onSave(): Promise<void> {
  // 第一次保存：把 submitAttempted 置 true，让所有错误浮现（包含金额/类目等），
  // 给用户一个明确的"哪些字段还缺"的反馈。
  submitAttempted.value = true
  if (hasErrors(errors.value) || isBusy.value) return
  isSaving.value = true
  try {
    // 1. 先上传凭证图（如果有本地未上传）
    let mediaId: string | null = draft.receiptMediaId
    if (uploaderRef.value && typeof uploaderRef.value.uploadNow === 'function') {
      const uploaded = await uploaderRef.value.uploadNow()
      if (uploaded) mediaId = uploaded
    }

    // 2. 构造请求
    const requestId = `add_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    if (isEditMode.value && editingEntryId.value) {
      const result = await ledgerStore.updateEntry({
        entryId: editingEntryId.value,
        operationToken: editingOperationToken.value || `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        amountCents: draft.amountCents,
        categoryId: draft.categoryId as string,
        // 把 'self' / 'other' 字面量透传给云端做映射；如果用户没动过付款人 chip，
        // loadForEntry 写入的就是 'self' / 'other'，与 addEntry 走同一条映射逻辑，
        // 不会再出现"编辑时 payer 不生效"的问题。
        payerMemberKey: draft.payerMemberKey,
        note: draft.note,
        occurredAt: draft.occurredAt,
        receiptMediaId: mediaId,
      })
      if (result) {
        uni.navigateBack({ delta: 1 })
      } else if (ledgerStore.errorMessage) {
        uni.showToast({ title: ledgerStore.errorMessage, icon: 'none', duration: 2500 })
      }
    } else {
      const result = await ledgerStore.addEntry({
        requestId,
        type: draft.type,
        amountCents: draft.amountCents,
        categoryId: draft.categoryId as string,
        payerMemberKey: draft.payerMemberKey,
        note: draft.note,
        occurredAt: draft.occurredAt,
        receiptMediaId: mediaId,
      })
      if (result) {
        uni.navigateBack({ delta: 1 })
      } else if (ledgerStore.errorMessage) {
        // addEntry 失败但 store 设了 errorMessage（云端返回的非 throw 错误）—— 给用户看
        uni.showToast({ title: ledgerStore.errorMessage, icon: 'none', duration: 2500 })
      }
    }
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : '保存失败', icon: 'none' })
  } finally {
    isSaving.value = false
  }
}

watch(
  () => householdId.value,
  (id) => {
    if (id) ledgerStore.setHouseholdContext(id, '')
  },
)
</script>

<style lang="scss" scoped>
.ledger-add-page {
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
  &__content {
    display: flex;
    flex-direction: column;
    gap: 32rpx;
  }
  &__tabs {
    display: flex;
    gap: 16rpx;
  }
  &__tab {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18rpx 0;
    border-radius: 999rpx;
    background: $brand-color-surface;
    color: $brand-color-text-secondary;
    font-size: 28rpx;
    font-weight: 600;
    transition: all .15s ease;
  }
  &__tab--active {
    &.ledger-add-page__tab--expense {
      background: $brand-color-accent;
      color: #FFFFFF;
    }

    &.ledger-add-page__tab--income {
      background: $brand-color-primary;
      color: #FFFFFF;
    }
  }
  &__amount-block {
    padding: 16rpx 8rpx 8rpx;
    // 显式给一个最小高度，避免 AmountInput 内部 input 元素默认行高裁掉 56rpx 文字的上下边缘。
    min-height: 120rpx;
  }
  &__validation {
    display: block;
    margin-top: 8rpx;
    color: #c5684d;
    font-size: 23rpx;
  }
  &__field {
    display: flex;
    flex-direction: column;
    gap: 14rpx;
  }
  &__label {
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    font-weight: 500;
  }
  &__empty-tip {
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    font-style: italic;
  }
  &__payer-row {
    display: flex;
    gap: 16rpx;
  }
  &__payer-chip {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18rpx 0;
    border-radius: $brand-radius-input;
    background: $brand-color-surface;
    color: $brand-color-text;
    font-size: 26rpx;
    font-weight: 500;
    border: 2rpx solid transparent;
  }
  &__payer-chip--active {
    background: #effbf5;
    border-color: $brand-color-primary;
    color: $brand-color-action;
    font-weight: 600;
  }
  &__date-pill {
    display: flex;
    align-items: center;
    gap: 12rpx;
    padding: 18rpx 24rpx;
    border-radius: $brand-radius-input;
    background: $brand-color-surface;
  }
  &__date-text {
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 500;
  }
  &__count {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
    text-align: right;
  }
  &__actions {
    margin-top: 24rpx;
  }
  /* 类目弹窗（frontend-design 重做：去双层 + 显式 X 关闭） */
  &__dialog-mask {
    // 不再 @click.self 关闭弹窗（uni-app .view 上 self 行为不可靠，
    // 用户的反馈"随意一点就关"——遮罩只在视觉上盖住底层，不再响应 click）。
    // 关闭入口只走：①右上角 X ②"取消" ③"添加"成功后。
    position: fixed;
    inset: 0;
    z-index: 99;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, .45);
  }
  &__dialog {
    width: 86vw;
    max-width: 640rpx;
    display: flex;
    flex-direction: column;
    gap: 20rpx;
    padding: 32rpx 28rpx 28rpx;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
  }
  &__dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__dialog-title {
    color: $brand-color-text;
    font-size: 32rpx;
    font-weight: 700;
  }
  &__dialog-close {
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
  &__dialog-close-icon {
    color: $brand-color-text-secondary;
    font-size: 36rpx;
    font-weight: 300;
    line-height: 1;
  }
  &__dialog-field {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
  }
  // 8 个组合色块：色块背景 + 中文首字（替代旧版"图标行 + 颜色行"两次选择，单次点击完成组合）
  &__preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 18rpx;
    margin-top: 4rpx;
  }
  &__preset {
    display: flex;
    width: 80rpx;
    height: 80rpx;
    align-items: center;
    justify-content: center;
    border-radius: 20rpx;
    border: 4rpx solid transparent;
    box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, .06);
    transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease;
  }
  &__preset--active {
    border-color: $brand-color-text;
    box-shadow: 0 2rpx 12rpx rgba(41, 68, 58, .2);
    transform: scale(1.04);
  }
  &__preset-char {
    color: #FFFFFF;
    font-size: 32rpx;
    font-weight: 700;
    line-height: 1;
  }
  &__dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 16rpx;
    margin-top: 8rpx;
  }
}
</style>
