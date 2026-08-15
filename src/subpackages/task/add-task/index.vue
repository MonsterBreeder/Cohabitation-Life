<template>
  <view class="add-task-page">
    <wd-toast />

    <view v-if="!isReady" class="add-task-page__state" data-testid="add-task-loading">
      <wd-loading color="#267A5A" size="44rpx" />
      <text class="add-task-page__state-title">正在准备添加页</text>
    </view>

    <view v-else class="add-task-page__content" data-testid="add-task-form">
      <view class="add-task-page__heading">
        <text class="add-task-page__eyebrow">记一件事</text>
        <text class="add-task-page__title">先记下来，我们一起处理</text>
        <text class="add-task-page__subtitle">先写名称和类型，其他都能之后再补。</text>
      </view>

      <!-- 事项类型 -->
      <view class="add-task-page__field">
        <text class="add-task-page__label">类型</text>
        <view class="add-task-page__types">
          <button
            v-for="opt in typeOptions"
            :key="opt.value"
            class="add-task-page__type"
            :class="{ 'add-task-page__type--selected': draft.type === opt.value }"
            :data-testid="`add-task-type-${opt.value}`"
            :disabled="isBusy"
            @click="selectType(opt.value)"
          >
            <text class="add-task-page__type-label">{{ opt.label }}</text>
            <text class="add-task-page__type-desc">{{ opt.description }}</text>
          </button>
        </view>
        <text v-if="typeError" class="add-task-page__validation" data-testid="add-task-type-error">
          {{ typeError }}
        </text>
      </view>

      <!-- 名称 -->
      <view class="add-task-page__field">
        <view class="add-task-page__field-heading">
          <text class="add-task-page__label">名称</text>
          <text class="add-task-page__count" data-testid="add-task-title-remaining">
            还可输入 {{ titleState.remaining }} 个字
          </text>
        </view>
        <wd-input
          v-model="titleInput"
          clearable
          :maxlength="80"
          :disabled="isBusy"
          :error="Boolean(titleState.errorMessage)"
          placeholder="例如：买洗衣液"
          data-testid="add-task-title-input"
        />
        <text v-if="titleState.errorMessage" class="add-task-page__validation" data-testid="add-task-title-error">
          {{ titleState.errorMessage }}
        </text>
      </view>

      <!-- 截止日期 -->
      <view class="add-task-page__field">
        <text class="add-task-page__label">截止日期（可选）</text>
        <picker
          mode="date"
          :value="draft.dueDate || today"
          :start="today"
          :end="'2099-12-31'"
          :disabled="isBusy"
          @change="onDueDateChange"
        >
          <view class="add-task-page__picker" :class="{ 'add-task-page__picker--empty': !draft.dueDate }">
            <text>{{ draft.dueDate || '点击选择日期' }}</text>
          </view>
        </picker>
        <view v-if="draft.dueDate" class="add-task-page__picker-clear">
          <text class="add-task-page__picker-clear-text" @click="clearDueDate">清除</text>
        </view>
        <text v-if="dueDateState.errorMessage" class="add-task-page__validation" data-testid="add-task-due-error">
          {{ dueDateState.errorMessage }}
        </text>
      </view>

      <!-- 备注 -->
      <view class="add-task-page__field">
        <view class="add-task-page__field-heading">
          <text class="add-task-page__label">备注（可选）</text>
          <text class="add-task-page__count" data-testid="add-task-note-remaining">
            还可输入 {{ noteState.remaining }} 个字
          </text>
        </view>
        <textarea
          v-model="noteInput"
          class="add-task-page__textarea"
          :maxlength="200"
          :disabled="isBusy"
          placeholder="想补充的细节，比如：替换装优先 / 周三前联系"
          data-testid="add-task-note-input"
        />
        <text v-if="noteState.errorMessage" class="add-task-page__validation" data-testid="add-task-note-error">
          {{ noteState.errorMessage }}
        </text>
      </view>

      <text v-if="errorMessage" class="add-task-page__error" data-testid="add-task-error">{{ errorMessage }}</text>

      <wd-button
        block
        type="primary"
        :loading="isBusy"
        :disabled="!isReady || isBusy"
        data-testid="add-task-submit"
        @click="submit"
      >
        记下这件事
      </wd-button>
      <text class="add-task-page__hint">对方下次打开或刷新就能看到。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useTaskStore } from '../../../store/modules/task'
import { readPendingTask } from '../../../utils/pending-task'
import type { TaskType } from '../../../types/task'
import {
  describeDueDate,
  describeNote,
  describeTitle,
  isDraftReady,
  todayIso,
  TASK_TYPES_DISPLAY,
  type AddTaskDraft,
} from './add-task-view'

const taskStore = useTaskStore()
const typeOptions = TASK_TYPES_DISPLAY
const today = todayIso()

const isReady = ref(false)
const isBusy = computed(() => taskStore.phase === 'creating')
const errorMessage = ref('')

const draft = shallowRef<AddTaskDraft>({
  title: '',
  type: undefined,
  dueDate: undefined,
  note: '',
})

const titleInput = ref('')
const noteInput = ref('')
const titleState = computed(() => describeTitle(titleInput.value))
const noteState = computed(() => describeNote(noteInput.value))
const dueDateState = computed(() => describeDueDate(draft.value.dueDate, today))
const typeError = computed(() => draft.value.type ? '' : '请选择事项类型')

const canSubmit = computed(() => isDraftReady(draft.value, today))

watch(titleInput, (value) => {
  draft.value = { ...draft.value, title: value }
})
watch(noteInput, (value) => {
  draft.value = { ...draft.value, note: value }
})

function selectType(value: TaskType): void {
  draft.value = { ...draft.value, type: value }
}

function onDueDateChange(event: { detail: { value: string } }): void {
  draft.value = { ...draft.value, dueDate: event.detail.value }
}

function clearDueDate(): void {
  draft.value = { ...draft.value, dueDate: undefined }
}

async function submit(): Promise<void> {
  if (!canSubmit.value || isBusy.value) return
  if (!draft.value.type) return
  errorMessage.value = ''
  const ok = await taskStore.create({
    title: draft.value.title,
    type: draft.value.type,
    dueDate: draft.value.dueDate,
    note: draft.value.note || undefined,
  })
  if (ok) {
    uni.reLaunch({ url: '/pages/index/index' })
  } else {
    errorMessage.value = taskStore.errorMessage || '暂时无法创建，请稍后重试'
  }
}

onLoad(() => {
  // 刷新页面后恢复未提交的草稿（操作凭证仍在 TTL 内）
  const pending = readPendingTask()
  if (pending?.kind === 'create' && pending.draft) {
    titleInput.value = pending.draft.title
    noteInput.value = pending.draft.note || ''
    draft.value = {
      title: pending.draft.title,
      type: pending.draft.type,
      dueDate: pending.draft.dueDate,
      note: pending.draft.note || '',
    }
  }
  isReady.value = true
})

onShow(() => {
  isReady.value = true
})
</script>

<style lang="scss" scoped>
.add-task-page { min-height: 100vh; padding: 48rpx 32rpx 80rpx; box-sizing: border-box; background: $brand-color-background; }
.add-task-page__state { display: flex; min-height: 60vh; flex-direction: column; align-items: center; justify-content: center; }
.add-task-page__state-title { margin-top: 24rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 700; }
.add-task-page__heading { display: flex; flex-direction: column; margin-bottom: 36rpx; }
.add-task-page__eyebrow { color: $brand-color-primary; font-size: 23rpx; font-weight: 700; letter-spacing: 4rpx; }
.add-task-page__title { margin-top: 16rpx; color: $brand-color-text; font-size: 44rpx; font-weight: 700; line-height: 1.3; }
.add-task-page__subtitle { margin-top: 12rpx; color: $brand-color-text-secondary; font-size: 26rpx; line-height: 1.6; }
.add-task-page__field { margin-top: 36rpx; }
.add-task-page__field-heading { display: flex; align-items: center; justify-content: space-between; }
.add-task-page__label { color: $brand-color-text; font-size: 27rpx; font-weight: 700; }
.add-task-page__count { color: $brand-color-text-secondary; font-size: 22rpx; }
.add-task-page__types { display: flex; flex-direction: column; gap: 16rpx; margin-top: 20rpx; }
.add-task-page__type { display: flex; flex-direction: column; align-items: flex-start; padding: 24rpx 28rpx; border: 2rpx solid $brand-color-border; border-radius: 18rpx; background: $brand-color-surface; text-align: left; }
.add-task-page__type::after { border: 0; }
.add-task-page__type--selected { border-color: $brand-color-primary; background: #effbf5; }
.add-task-page__type-label { color: $brand-color-text; font-size: 29rpx; font-weight: 700; }
.add-task-page__type-desc { margin-top: 6rpx; color: $brand-color-text-secondary; font-size: 23rpx; }
.add-task-page__validation { display: block; margin-top: 12rpx; color: #c5684d; font-size: 23rpx; }
.add-task-page__picker { display: flex; align-items: center; height: 88rpx; padding: 0 24rpx; margin-top: 20rpx; border: 2rpx solid $brand-color-border; border-radius: 18rpx; background: $brand-color-surface; color: $brand-color-text; font-size: 28rpx; }
.add-task-page__picker--empty { color: $brand-color-text-secondary; }
.add-task-page__picker-clear { margin-top: 12rpx; text-align: right; }
.add-task-page__picker-clear-text { color: $brand-color-primary; font-size: 24rpx; }
.add-task-page__textarea { width: 100%; min-height: 160rpx; padding: 24rpx; margin-top: 20rpx; border: 2rpx solid $brand-color-border; border-radius: 18rpx; background: $brand-color-surface; color: $brand-color-text; font-size: 28rpx; line-height: 1.6; box-sizing: border-box; }
.add-task-page__error { display: block; margin: 24rpx 0; color: #c5684d; font-size: 25rpx; text-align: center; }
.add-task-page__hint { display: block; margin-top: 20rpx; color: $brand-color-text-secondary; font-size: 23rpx; text-align: center; }
</style>
