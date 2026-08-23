<!--
  类目管理页（PRD 008 / Plan U6）。
  区块：① 系统预设（可隐藏） ② 自定义类目（可改名 / 隐藏 / 删除） ③ + 添加按钮。
-->
<template>
  <view class="category-manager">
    <wd-toast />

    <view v-if="isLoading && categories.length === 0" class="category-manager__state" data-testid="category-manager-loading">
      <wd-loading color="#267A5A" size="40rpx" />
      <text class="category-manager__state-title">正在加载账本类目</text>
    </view>

    <view v-else-if="loadError" class="category-manager__state" data-testid="category-manager-error">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="category-manager__state-title">暂时无法加载</text>
      <text class="category-manager__state-copy">{{ loadError }}</text>
      <wd-button block round variant="plain" @click="reload">重新加载</wd-button>
    </view>

    <view v-else class="category-manager__content" data-testid="category-manager-content">
      <view v-for="section in sections" :key="section.title" class="category-manager__section">
        <text class="category-manager__section-title">{{ section.title }}（{{ section.categories.length }}）</text>
        <view class="category-manager__list">
          <view
            v-for="cat in section.categories"
            :key="cat.id"
            class="category-manager__row"
            :class="{ 'category-manager__row--hidden': hiddenByMe.includes(cat.id) }"
            :data-testid="`category-manager-row-${cat.id}`"
          >
            <view class="category-manager__row-icon" :style="{ background: colorHex(cat) }">
              <wd-icon :name="iconName(cat)" size="32rpx" color="#FFFFFF" />
            </view>
            <view class="category-manager__row-info">
              <text class="category-manager__row-name">{{ cat.name }}</text>
              <text v-if="hiddenByMe.includes(cat.id)" class="category-manager__row-hint">已对你隐藏</text>
              <text v-else-if="cat.isCustom" class="category-manager__row-hint">自定义类目</text>
              <text v-else class="category-manager__row-hint">系统预设</text>
            </view>
            <view class="category-manager__row-actions">
              <wd-button v-if="!hiddenByMe.includes(cat.id)" size="small" plain data-testid="`category-manager-hide-${cat.id}`" @click="onHide(cat)">隐藏</wd-button>
              <wd-button v-else size="small" plain type="primary" :data-testid="`category-manager-unhide-${cat.id}`" @click="onUnhide(cat)">取消隐藏</wd-button>
              <wd-button v-if="cat.isCustom" size="small" plain :data-testid="`category-manager-rename-${cat.id}`" @click="onShowRename(cat)">改名</wd-button>
              <wd-button
                v-if="cat.isCustom"
                size="small"
                plain
                custom-class="category-manager__remove"
                :data-testid="`category-manager-remove-${cat.id}`"
                @click="onShowRemove(cat)"
              >删除</wd-button>
            </view>
          </view>
          <view v-if="section.categories.length === 0" class="category-manager__empty-row">
            <text class="category-manager__empty-text">{{ section.title === '我的自定义' ? '还没有自定义类目，点下面 + 添加' : '—' }}</text>
          </view>
        </view>
      </view>

      <view class="category-manager__add-section">
        <wd-button block round type="primary" data-testid="category-manager-add" @click="onShowAdd">+ 添加类目</wd-button>
      </view>
    </view>

    <!-- 添加/重命名类目弹窗 -->
    <view v-if="showDialog" class="category-manager__mask" @click.self="closeDialog">
      <view class="category-manager__dialog" data-testid="category-manager-dialog">
        <text class="category-manager__dialog-title">{{ dialogState.title }}</text>
        <view v-if="dialogState.mode === 'add' || dialogState.mode === 'rename'" class="category-manager__dialog-field">
          <text class="category-manager__label">类目名（2-8 字）</text>
          <wd-input v-model="dialogState.name" :placeholder="dialogState.placeholder" data-testid="category-manager-name" :maxlength="8" />
        </view>
        <view v-if="dialogState.mode === 'add'" class="category-manager__dialog-field">
          <text class="category-manager__label">图标</text>
          <view class="category-manager__icon-row">
            <view
              v-for="opt in iconOptions"
              :key="opt.value"
              class="category-manager__icon-chip"
              :class="{ 'category-manager__icon-chip--active': dialogState.iconKey === opt.value }"
              :data-testid="`category-manager-icon-${opt.value}`"
              @click="dialogState.iconKey = opt.value as LedgerCategoryIconKey"
            >
              <wd-icon :name="opt.iconName" size="32rpx" :color="dialogState.iconKey === opt.value ? '#267A5A' : '#74847D'" />
            </view>
          </view>
        </view>
        <view v-if="dialogState.mode === 'add'" class="category-manager__dialog-field">
          <text class="category-manager__label">颜色</text>
          <view class="category-manager__color-row">
            <view
              v-for="opt in colorOptions"
              :key="opt.value"
              class="category-manager__color-chip"
              :class="{ 'category-manager__color-chip--active': dialogState.colorKey === opt.value }"
              :style="{ background: opt.hex }"
              :data-testid="`category-manager-color-${opt.value}`"
              @click="dialogState.colorKey = opt.value as LedgerCategoryColorKey"
            />
          </view>
        </view>
        <text v-if="dialogError" class="category-manager__validation">{{ dialogError }}</text>
        <view v-if="dialogState.mode === 'remove'" class="category-manager__dialog-message">
          <text class="category-manager__message-text">{{ dialogState.message }}</text>
        </view>
        <view class="category-manager__dialog-actions">
          <wd-button size="small" plain @click="closeDialog">取消</wd-button>
          <wd-button size="small" type="primary" :loading="isDialogBusy" :disabled="isDialogBusy" data-testid="category-manager-confirm" @click="onConfirm">{{ dialogState.mode === 'remove' ? '删除' : '保存' }}</wd-button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { onShow } from '@dcloudio/uni-app'
import { useLedgerStore } from '../../../store/modules/ledger'
import { CATEGORY_COLOR_OPTIONS, CATEGORY_ICON_OPTIONS, defaultCategoryDraft, validateCategoryDraft } from '../ledger-add/ledger-add-view'
import { describeCategory, LEDGER_CATEGORY_COLOR_MAP, LEDGER_CATEGORY_ICON_MAP } from '../../../pages/ledger/ledger-home-view'
import { describeCategorySections } from './ledger-category-manager-view'
import type { LedgerCategory, LedgerCategoryColorKey, LedgerCategoryIconKey } from '../../../types/ledger'

const ledgerStore = useLedgerStore()
const { categories, phase, errorMessage: storeError } = storeToRefs(ledgerStore)

const isLoading = computed(() => phase.value === 'loading' && categories.value.length === 0)
const loadError = computed(() => storeError.value)

const iconOptions = CATEGORY_ICON_OPTIONS
const colorOptions = CATEGORY_COLOR_OPTIONS

const sections = computed(() => describeCategorySections(
  categories.value.filter((c) => !c.isCustom).sort((a, b) => a.sortOrder - b.sortOrder),
  categories.value.filter((c) => c.isCustom),
))

const hiddenByMe = computed(() => ledgerStore.hiddenByMeCategoryIds)

function colorHex(cat: LedgerCategory): string {
  return LEDGER_CATEGORY_COLOR_MAP[cat.colorKey] || LEDGER_CATEGORY_COLOR_MAP.gray
}
function iconName(cat: LedgerCategory): string {
  return LEDGER_CATEGORY_ICON_MAP[cat.iconKey] || LEDGER_CATEGORY_ICON_MAP.tag
}

type DialogState = {
  mode: 'add' | 'rename' | 'remove'
  title: string
  placeholder: string
  name: string
  iconKey: LedgerCategoryIconKey
  colorKey: LedgerCategoryColorKey
  message: string
  targetId: string | null
}

const dialogState = reactive<DialogState>({
  mode: 'add',
  title: '添加类目',
  placeholder: '比如：宠物',
  name: '',
  iconKey: 'tag',
  colorKey: 'gray',
  message: '',
  targetId: null,
})
const dialogError = ref('')
const isDialogBusy = ref(false)
const showDialog = ref(false)

function closeDialog(): void {
  showDialog.value = false
  dialogError.value = ''
}

function onShowAdd(): void {
  const draft = defaultCategoryDraft()
  dialogState.mode = 'add'
  dialogState.title = '添加类目'
  dialogState.placeholder = '比如：宠物'
  dialogState.name = draft.name
  dialogState.iconKey = draft.iconKey as LedgerCategoryIconKey
  dialogState.colorKey = draft.colorKey as LedgerCategoryColorKey
  dialogState.message = ''
  dialogState.targetId = null
  dialogError.value = ''
  showDialog.value = true
}

function onShowRename(cat: LedgerCategory): void {
  dialogState.mode = 'rename'
  dialogState.title = `重命名「${cat.name}」`
  dialogState.placeholder = '2-8 字'
  dialogState.name = cat.name
  dialogState.iconKey = cat.iconKey
  dialogState.colorKey = cat.colorKey
  dialogState.message = ''
  dialogState.targetId = cat.id
  dialogError.value = ''
  showDialog.value = true
}

function onShowRemove(cat: LedgerCategory): void {
  dialogState.mode = 'remove'
  dialogState.title = `删除「${cat.name}」`
  dialogState.placeholder = ''
  dialogState.name = ''
  dialogState.iconKey = cat.iconKey
  dialogState.colorKey = cat.colorKey
  dialogState.message = '类目删除后无法恢复。'
  dialogState.targetId = cat.id
  dialogError.value = ''
  showDialog.value = true
}

async function onConfirm(): Promise<void> {
  if (isDialogBusy.value) return
  dialogError.value = ''

  if (dialogState.mode === 'add' || dialogState.mode === 'rename') {
    const err = validateCategoryDraft({ name: dialogState.name, iconKey: dialogState.iconKey, colorKey: dialogState.colorKey })
    if (err) {
      dialogError.value = err
      return
    }
  }

  isDialogBusy.value = true
  try {
    if (dialogState.mode === 'add') {
      const result = await ledgerStore.addCategory({
        requestId: `mgr_add_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: dialogState.name,
        iconKey: dialogState.iconKey,
        colorKey: dialogState.colorKey,
      })
      if (result) closeDialog()
      else dialogError.value = ledgerStore.errorMessage || '添加类目失败'
    } else if (dialogState.mode === 'rename' && dialogState.targetId) {
      // 走 store action 而不是 `await import('...services/ledger-cloud')`：
      // mp-weixin 构建会把 `await import('...')` 错误地编成 `await <string>`，
      // 然后解构出 undefined、调用时抛 "_e is not a function"。
      const updated = await ledgerStore.renameCategory(dialogState.targetId, dialogState.name)
      if (updated) {
        closeDialog()
      } else {
        dialogError.value = ledgerStore.errorMessage || '重命名失败'
      }
    } else if (dialogState.mode === 'remove' && dialogState.targetId) {
      const ok = await ledgerStore.removeCategory(dialogState.targetId)
      if (ok) closeDialog()
      else dialogError.value = ledgerStore.errorMessage || '删除类目失败'
    }
  } finally {
    isDialogBusy.value = false
  }
}

async function onHide(cat: LedgerCategory): Promise<void> {
  await ledgerStore.updateCategoryHidden(cat.id, true)
}
async function onUnhide(cat: LedgerCategory): Promise<void> {
  await ledgerStore.updateCategoryHidden(cat.id, false)
}

async function reload(): Promise<void> {
  await ledgerStore.loadCategories()
}

onShow(async () => {
  if (categories.value.length === 0) await reload()
})
</script>

<style lang="scss" scoped>
.category-manager {
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
    gap: 32rpx;
  }
  &__section {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
  }
  &__section-title {
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    font-weight: 600;
    padding-left: 4rpx;
  }
  &__list {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
  }
  &__row {
    display: flex;
    align-items: center;
    gap: 18rpx;
    padding: 20rpx 22rpx;
    border-radius: $brand-radius-input;
    background: $brand-color-surface;
  }
  &__row--hidden {
    opacity: .55;
  }
  &__row-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64rpx;
    height: 64rpx;
    border-radius: 16rpx;
    flex-shrink: 0;
  }
  &__row-info {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2rpx;
    min-width: 0;
  }
  &__row-name {
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 600;
    line-height: 1.3;
  }
  &__row-hint {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
  }
  &__row-actions {
    display: flex;
    gap: 8rpx;
    flex-shrink: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  &__empty-row {
    padding: 24rpx;
    text-align: center;
    border: 2rpx dashed $brand-color-border;
    border-radius: 14rpx;
  }
  &__empty-text {
    color: $brand-color-text-secondary;
    font-size: 24rpx;
  }
  &__add-section {
    margin-top: 16rpx;
  }
  /* 弹窗 */
  &__mask {
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
  &__dialog-title {
    color: $brand-color-text;
    font-size: 32rpx;
    font-weight: 700;
  }
  &__dialog-field {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
  }
  &__label {
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    font-weight: 500;
  }
  &__icon-row {
    display: flex;
    gap: 14rpx;
    flex-wrap: wrap;
  }
  &__icon-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64rpx;
    height: 64rpx;
    border-radius: 50%;
    background: rgba($brand-color-border, .4);
    border: 2rpx solid transparent;
  }
  &__icon-chip--active {
    background: #effbf5;
    border-color: $brand-color-primary;
  }
  &__color-row {
    display: flex;
    gap: 16rpx;
    flex-wrap: wrap;
  }
  &__color-chip {
    width: 56rpx;
    height: 56rpx;
    border-radius: 50%;
    border: 4rpx solid transparent;
  }
  &__color-chip--active {
    border-color: $brand-color-text;
  }
  &__validation {
    color: #c5684d;
    font-size: 23rpx;
  }
  &__dialog-message {
    padding: 8rpx 0;
  }
  &__message-text {
    color: $brand-color-text;
    font-size: 28rpx;
  }
  &__dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 16rpx;
    margin-top: 8rpx;
  }
  &__remove {
    color: $brand-color-accent;
    border-color: $brand-color-accent;
  }
}
</style>
