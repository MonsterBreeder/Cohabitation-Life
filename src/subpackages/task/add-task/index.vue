<template>
  <view class="add-task-page">
    <wd-toast />

    <view v-if="!isReady" class="add-task-page__state" data-testid="add-task-loading">
      <wd-loading color="#267A5A" size="44rpx" />
      <text class="add-task-page__state-title">正在准备添加页</text>
    </view>

    <view v-else class="add-task-page__content" data-testid="add-task-form">
      <!-- 标题区：eyebrow + 主标 + 副标，更轻的字重呼应 logo 柔和气质 -->
      <view class="add-task-page__heading">
        <text class="add-task-page__eyebrow">记一件事</text>
        <text class="add-task-page__title">先记下来，我们一起处理</text>
        <text class="add-task-page__subtitle">先写名称和类型，其他都能之后再补。</text>
      </view>

      <!-- 事项类型：横向 3 列，左侧色带代替颜色块 -->
      <view class="add-task-page__field">
        <text class="add-task-page__label">类型</text>
        <view class="add-task-page__types">
          <button
            v-for="opt in typeOptions"
            :key="opt.value"
            class="add-task-page__type"
            :class="`add-task-page__type--${opt.value}`"
            :data-selected="draft.type === opt.value"
            :data-testid="'add-task-type-' + opt.value"
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

      <!-- 名称：极简输入，焦点时浮现薄荷绿描边 -->
      <view class="add-task-page__field">
        <view class="add-task-page__field-heading">
          <text class="add-task-page__label">名称</text>
          <text class="add-task-page__count" data-testid="add-task-title-remaining">
            还可输入 {{ titleState.remaining }} 个字
          </text>
        </view>
        <view class="add-task-page__input-wrap" :data-has-error="Boolean(titleState.errorMessage)">
          <wd-input
            v-model="titleInput"
            clearable
            :maxlength="80"
            :disabled="isBusy"
            :no-border="true"
            custom-style="padding: 0 28rpx; height: 96rpx; background: transparent;"
            placeholder="比如：买洗衣液"
            placeholder-style="color: #b6c0bb;"
            data-testid="add-task-title-input"
          />
        </view>
        <text v-if="titleState.errorMessage" class="add-task-page__validation" data-testid="add-task-title-error">
          {{ titleState.errorMessage }}
        </text>
      </view>

      <!-- 截止日期：轻量 pill 风格，已选显示"X月X日 · 周Y" -->
      <view class="add-task-page__field">
        <text class="add-task-page__label">截止日期（可选）</text>
        <view class="add-task-page__date-row">
          <picker
            mode="date"
            :value="draft.dueDate || today"
            :start="today"
            :end="'2099-12-31'"
            :disabled="isBusy"
            @change="onDueDateChange"
          >
            <view
              class="add-task-page__date-pill"
              :class="{ 'add-task-page__date-pill--empty': !draft.dueDate }"
              data-testid="add-task-due-pill"
            >
              <wd-icon
                v-if="!draft.dueDate"
                name="calendar"
                size="32rpx"
                color="#74847D"
              />
              <text>{{ draft.dueDate || '挑一个日期提醒我们' }}</text>
            </view>
          </picker>
          <text
            v-if="draft.dueDate"
            class="add-task-page__date-clear"
            data-testid="add-task-due-clear"
            @click="clearDueDate"
          >清除</text>
        </view>
        <text v-if="dueDateState.errorMessage" class="add-task-page__validation" data-testid="add-task-due-error">
          {{ dueDateState.errorMessage }}
        </text>
      </view>

      <!-- 备注：极简 textarea -->
      <view class="add-task-page__field">
        <view class="add-task-page__field-heading">
          <text class="add-task-page__label">备注（可选）</text>
          <text class="add-task-page__count" data-testid="add-task-note-remaining">
            还可输入 {{ noteState.remaining }} 个字
          </text>
        </view>
        <view class="add-task-page__textarea-wrap" :data-has-error="Boolean(noteState.errorMessage)">
          <textarea
            v-model="noteInput"
            class="add-task-page__textarea"
            :maxlength="200"
            :disabled="isBusy"
            placeholder="想补充的细节，比如：替换装优先 / 周三前联系"
            placeholder-style="color: #b6c0bb;"
            data-testid="add-task-note-input"
          />
        </view>
        <text v-if="noteState.errorMessage" class="add-task-page__validation" data-testid="add-task-note-error">
          {{ noteState.errorMessage }}
        </text>
      </view>

      <text v-if="errorMessage" class="add-task-page__error" data-testid="add-task-error">{{ errorMessage }}</text>

      <!-- 提交按钮：大圆角 + 渐变绿 -->
      <view class="add-task-page__submit">
        <button
          class="add-task-page__submit-btn"
          :class="{ 'add-task-page__submit-btn--ready': canSubmit && !isBusy }"
          :disabled="!canSubmit || isBusy"
          :data-testid="'add-task-submit'"
          @click="submit"
        >
          <text v-if="!isBusy" class="add-task-page__submit-text">记下这件事</text>
          <wd-loading v-else size="32rpx" color="#ffffff" />
        </button>
        <text class="add-task-page__hint">对方下次打开或刷新就能看到。</text>
      </view>
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
  type AddTaskDraft,
} from './add-task-view'
// TASK_TYPES_DISPLAY 放在主包 task-shared：分包可以引用主包，反之会触发"is not defined"运行时错误。
import { TASK_TYPES_DISPLAY } from '../../../components/task/task-shared'

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
/* 整体：暖白底色，加大留白让两个团子 logo 的柔和气质有空间呼吸。 */
.add-task-page { min-height: 100vh; padding: 64rpx 40rpx 120rpx; box-sizing: border-box; background: $brand-color-background; }
.add-task-page__state { display: flex; min-height: 60vh; flex-direction: column; align-items: center; justify-content: center; }
.add-task-page__state-title { margin-top: 24rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 700; }

/* 标题：eyebrow + 主标 + 副标；主标字重从 700 降到 500，呼应 logo 的圆润亲密。 */
.add-task-page__heading { display: flex; flex-direction: column; margin-bottom: 56rpx; }
.add-task-page__eyebrow { color: $brand-color-primary; font-size: 22rpx; font-weight: 600; letter-spacing: 6rpx; opacity: .85; }
.add-task-page__title { margin-top: 18rpx; color: $brand-color-text; font-size: 48rpx; font-weight: 500; line-height: 1.35; letter-spacing: .5rpx; }
.add-task-page__subtitle { margin-top: 14rpx; color: $brand-color-text-secondary; font-size: 26rpx; line-height: 1.6; font-weight: 400; }

/* 字段：上下间距加大到 48rpx，告别"表单填表"感。 */
.add-task-page__field { margin-top: 48rpx; }
.add-task-page__field-heading { display: flex; align-items: center; justify-content: space-between; }
.add-task-page__label { color: $brand-color-text; font-size: 25rpx; font-weight: 600; letter-spacing: .5rpx; }
.add-task-page__count { color: $brand-color-text-secondary; font-size: 22rpx; font-weight: 400; }

/* 类型卡：横向 3 列网格 + 左侧色带代替颜色块。
   色带是低饱和的暖黄/绿/柔珊瑚，避开主色品牌大块出现的位置。 */
.add-task-page__types { display: flex; gap: 18rpx; margin-top: 22rpx; }
.add-task-page__type {
  flex: 1;
  position: relative;
  display: flex; flex-direction: column; align-items: flex-start;
  padding: 26rpx 22rpx 24rpx;
  border: 0;
  border-radius: 24rpx;
  background: $brand-color-surface;
  text-align: left;
  transition: background .15s ease, transform .15s ease;
  overflow: hidden;
}
.add-task-page__type::before {
  content: '';
  position: absolute;
  left: 0; top: 24rpx; bottom: 24rpx;
  width: 6rpx;
  border-radius: 0 6rpx 6rpx 0;
  transition: width .15s ease, top .15s ease, bottom .15s ease;
}
.add-task-page__type--low_stock::before { background: #E8B647; }
.add-task-page__type--to_handle::before { background: #5BBE93; }
.add-task-page__type--expiring::before { background: #E78A7B; }
.add-task-page__type[data-selected='true'] { background: #effbf5; transform: translateY(-2rpx); }
.add-task-page__type[data-selected='true']::before { width: 10rpx; top: 16rpx; bottom: 16rpx; }
.add-task-page__type::after { border: 0; }
.add-task-page__type:active { transform: scale(.98); }
.add-task-page__type-label { margin-left: 14rpx; color: $brand-color-text; font-size: 28rpx; font-weight: 600; }
.add-task-page__type-desc { margin-top: 6rpx; margin-left: 14rpx; color: $brand-color-text-secondary; font-size: 21rpx; line-height: 1.5; }

/* 校验文案：低饱和红，不刺眼。 */
.add-task-page__validation { display: block; margin-top: 12rpx; color: #c5684d; font-size: 22rpx; }

/* 输入框：极简，焦点时 inset 2rpx 薄荷绿。 */
.add-task-page__input-wrap {
  display: flex; align-items: center;
  min-height: 96rpx;
  margin-top: 18rpx;
  border-radius: 20rpx;
  background: $brand-color-surface;
  box-shadow: inset 0 0 0 1rpx #eef2ef;
  transition: box-shadow .2s ease;
}
.add-task-page__input-wrap:focus-within { box-shadow: inset 0 0 0 2rpx $brand-color-primary; }
.add-task-page__input-wrap[data-has-error='true'] { box-shadow: inset 0 0 0 2rpx #c5684d; }

/* 日期选择：轻量 pill，焦点/按下和输入框一致。 */
.add-task-page__date-row { display: flex; align-items: center; gap: 18rpx; margin-top: 18rpx; }
.add-task-page__date-pill {
  display: inline-flex; align-items: center; gap: 12rpx;
  height: 80rpx;
  padding: 0 26rpx;
  border-radius: 999rpx;
  background: $brand-color-surface;
  box-shadow: inset 0 0 0 1rpx #eef2ef;
  color: $brand-color-text;
  font-size: 27rpx;
  font-weight: 500;
  transition: box-shadow .2s ease;
}
.add-task-page__date-pill--empty { color: $brand-color-text-secondary; font-weight: 400; }
.add-task-page__date-pill:active { box-shadow: inset 0 0 0 2rpx $brand-color-primary; }
.add-task-page__date-clear { color: $brand-color-text-secondary; font-size: 23rpx; text-decoration: underline; }

/* 备注：极简 textarea，焦点时 inset 描边。 */
.add-task-page__textarea-wrap {
  margin-top: 18rpx;
  border-radius: 20rpx;
  background: $brand-color-surface;
  box-shadow: inset 0 0 0 1rpx #eef2ef;
  transition: box-shadow .2s ease;
  padding: 22rpx 0;
}
.add-task-page__textarea-wrap:focus-within { box-shadow: inset 0 0 0 2rpx $brand-color-primary; }
.add-task-page__textarea-wrap[data-has-error='true'] { box-shadow: inset 0 0 0 2rpx #c5684d; }
.add-task-page__textarea {
  width: 100%;
  min-height: 140rpx;
  padding: 0 28rpx;
  background: transparent;
  color: $brand-color-text;
  font-size: 27rpx;
  line-height: 1.6;
  box-sizing: border-box;
}

/* 错误：通用 toast-like。 */
.add-task-page__error { display: block; margin: 32rpx 0 24rpx; color: #c5684d; font-size: 25rpx; text-align: center; }

/* 提交按钮：大圆角 + 渐变绿；未激活时浅灰禁用态。 */
.add-task-page__submit { display: flex; flex-direction: column; align-items: center; margin-top: 64rpx; }
.add-task-page__submit-btn {
  width: 100%;
  height: 104rpx;
  border: 0;
  border-radius: 999rpx;
  background: #d6dfd9;
  display: flex; align-items: center; justify-content: center;
  transition: transform .15s ease, background .2s ease, box-shadow .2s ease;
}
.add-task-page__submit-btn::after { border: 0; }
.add-task-page__submit-btn--ready {
  background: linear-gradient(135deg, #43c89a, #5bdfb3);
  box-shadow: 0 12rpx 28rpx rgba(67, 200, 154, .28);
}
.add-task-page__submit-btn--ready:active { transform: scale(.97); box-shadow: 0 6rpx 16rpx rgba(67, 200, 154, .25); }
.add-task-page__submit-text { color: #fff; font-size: 31rpx; font-weight: 600; letter-spacing: 2rpx; line-height: 1; }
.add-task-page__hint { display: block; margin-top: 20rpx; color: $brand-color-text-secondary; font-size: 22rpx; text-align: center; }
</style>
