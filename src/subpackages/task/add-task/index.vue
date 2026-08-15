<!--
  添加事项页：完全用 Wot UI 组件 + 品牌 scss 变量。
  - 标题区是纯排版（不属于组件）
  - 类型选择用 wd-radio-group，方向 horizontal，3 列通过 class 控制
  - 名称/截止/备注用 wd-cell 包裹 Wot UI 输入控件
  - 提交用 wd-button primary round
  - 所有 testid 与原版保持一致，e2e 选择器不用改
-->
<template>
  <view class="add-task-page">
    <wd-toast />

    <view v-if="!isReady" class="add-task-page__state" data-testid="add-task-loading">
      <wd-loading color="#267A5A" size="44rpx" />
      <text class="add-task-page__state-title">正在准备添加页</text>
    </view>

    <view v-else class="add-task-page__content" data-testid="add-task-form">
      <!-- 标题区：纯排版，不属于组件 -->
      <view class="add-task-page__heading">
        <text class="add-task-page__eyebrow">记一件事</text>
        <text class="add-task-page__title">先记下来，我们一起处理</text>
        <text class="add-task-page__subtitle">先写名称和类型，其他都能之后再补。</text>
      </view>

      <!-- 类型选择：3 列带色带卡片。
           这里用 <view @click> 而不是 wd-radio-group + <label>：因为 3 张带品牌色带的卡片
           是项目独有的视觉组合（AGENTS.md 允许的例外），用 label 包 wd-radio 不可靠
           —— 小程序里 label 不会把 click 转发到内部组件。 -->
      <view class="add-task-page__field">
        <text class="add-task-page__label">类型</text>
        <view class="add-task-page__types">
          <view
            v-for="opt in typeOptions"
            :key="opt.value"
            class="add-task-page__type"
            :class="`add-task-page__type--${opt.value}`"
            :data-selected="draft.type === opt.value ? 'true' : 'false'"
            :data-testid="'add-task-type-' + opt.value"
            hover-class="add-task-page__type--hover"
            :hover-stay-time="80"
            @click="selectType(opt.value)"
          >
            <view class="add-task-page__type-mark" />
            <view class="add-task-page__type-content">
              <text class="add-task-page__type-label">{{ opt.label }}</text>
              <text class="add-task-page__type-desc">{{ opt.description }}</text>
            </view>
          </view>
        </view>
        <text v-if="typeError" class="add-task-page__validation" data-testid="add-task-type-error">
          {{ typeError }}
        </text>
      </view>

      <!-- 名称：wd-cell 包裹 wd-input，label 模式 -->
      <view class="add-task-page__field">
        <wd-cell-group border>
          <wd-input
            v-model="titleInput"
            label="名称"
            label-width="100rpx"
            placeholder="比如：买洗衣液"
            :maxlength="80"
            clearable
            :error="Boolean(titleState.errorMessage)"
            :disabled="isBusy"
            data-testid="add-task-title-input"
          />
        </wd-cell-group>
        <text v-if="titleState.remaining < 20" class="add-task-page__count" data-testid="add-task-title-remaining">
          还可输入 {{ titleState.remaining }} 个字
        </text>
        <text v-if="titleState.errorMessage" class="add-task-page__validation" data-testid="add-task-title-error">
          {{ titleState.errorMessage }}
        </text>
      </view>

      <!-- 截止日期：原生 <picker mode="date"> + 自定义显示。
           之前用 wd-datetime-picker 跟 wd-cell 配合有问题（picker 自身没 trigger
           信号源），改回原生 picker 反而最稳；显示区用 Wot UI 风格。 -->
      <view class="add-task-page__field">
        <view class="add-task-page__date-row">
          <text class="add-task-page__date-label">截止日期（可选）</text>
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
              <wd-icon v-if="!draft.dueDate" name="calendar" size="32rpx" color="#74847D" />
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

      <!-- 备注：wd-cell 包裹 wd-textarea，label + showWordLimit -->
      <view class="add-task-page__field">
        <wd-cell-group border>
          <wd-textarea
            v-model="noteInput"
            label="备注"
            label-width="100rpx"
            placeholder="想补充的细节，比如：替换装优先 / 周三前联系"
            :maxlength="200"
            :disabled="isBusy"
            :error="Boolean(noteState.errorMessage)"
            show-word-limit
            data-testid="add-task-note-input"
          />
        </wd-cell-group>
        <text v-if="noteState.errorMessage" class="add-task-page__validation" data-testid="add-task-note-error">
          {{ noteState.errorMessage }}
        </text>
      </view>

      <text v-if="errorMessage" class="add-task-page__error" data-testid="add-task-error">{{ errorMessage }}</text>

      <!-- 提交：wd-button block round primary size=large -->
      <view class="add-task-page__submit">
        <wd-button
          block
          round
          type="primary"
          size="large"
          :loading="isBusy"
          :disabled="!canSubmit || isBusy"
          data-testid="add-task-submit"
          @click="submit"
        >
          记下这件事
        </wd-button>
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
// TASK_TYPES_DISPLAY 必须放在主包 task-shared：分包可引用主包，反向引用会触发"is not defined"运行时错误。
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
/* 整体：暖白底色 + 大留白。 */
.add-task-page { min-height: 100vh; padding: 64rpx 32rpx 80rpx; box-sizing: border-box; background: $brand-color-background; }
.add-task-page__state { display: flex; min-height: 60vh; flex-direction: column; align-items: center; justify-content: center; }
.add-task-page__state-title { margin-top: 24rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 600; }

/* 标题区：eyebrow + 主标 + 副标，字重比纯黑更柔。 */
.add-task-page__heading { display: flex; flex-direction: column; margin-bottom: 40rpx; }
.add-task-page__eyebrow { color: $brand-color-primary; font-size: 22rpx; font-weight: 600; letter-spacing: 6rpx; opacity: .85; }
.add-task-page__title { margin-top: 16rpx; color: $brand-color-text; font-size: 46rpx; font-weight: 500; line-height: 1.35; letter-spacing: .5rpx; }
.add-task-page__subtitle { margin-top: 12rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.6; }

/* 字段：上下间距加大到 40rpx。 */
.add-task-page__field { margin-top: 40rpx; }
.add-task-page__label { display: block; margin-bottom: 16rpx; color: $brand-color-text; font-size: 25rpx; font-weight: 600; letter-spacing: .5rpx; }
.add-task-page__count { display: block; margin-top: 10rpx; text-align: right; color: $brand-color-text-secondary; font-size: 22rpx; }
.add-task-page__validation { display: block; margin-top: 10rpx; color: #c5684d; font-size: 22rpx; }
.add-task-page__error { display: block; margin: 24rpx 0; color: #c5684d; font-size: 25rpx; text-align: center; }

/* 类型卡：横向 3 列 + 左侧色带。用 <view> + @click 是因为 3 张带品牌色带的卡片
   属于"项目独有的品牌展示"组合，wd-radio 不适合套这种布局。 */
.add-task-page__types { display: flex; gap: 16rpx; width: 100%; }
.add-task-page__type {
  flex: 1;
  position: relative;
  display: flex; align-items: center; gap: 16rpx;
  padding: 22rpx 18rpx 22rpx 24rpx;
  border-radius: 20rpx;
  background: $brand-color-surface;
  transition: background .15s ease, transform .15s ease;
  overflow: hidden;
  min-height: 132rpx;
}
.add-task-page__type::before {
  content: '';
  position: absolute;
  left: 0; top: 18rpx; bottom: 18rpx;
  width: 6rpx;
  border-radius: 0 6rpx 6rpx 0;
  transition: width .15s ease, top .15s ease, bottom .15s ease;
}
.add-task-page__type--low_stock::before { background: #E8B647; }
.add-task-page__type--to_handle::before { background: #5BBE93; }
.add-task-page__type--expiring::before { background: #E78A7B; }
.add-task-page__type[data-selected='true'] { background: #effbf5; transform: translateY(-2rpx); }
.add-task-page__type[data-selected='true']::before { width: 10rpx; top: 12rpx; bottom: 12rpx; }
.add-task-page__type--hover { transform: scale(.98); }
.add-task-page__type-content { display: flex; flex-direction: column; gap: 4rpx; min-width: 0; }
.add-task-page__type-label { color: $brand-color-text; font-size: 27rpx; font-weight: 600; line-height: 1.3; }
.add-task-page__type-desc { color: $brand-color-text-secondary; font-size: 20rpx; line-height: 1.4; }

/* 截止日期：原生 picker 包在自定义 pill 里；label 跟其他字段对齐。 */
.add-task-page__date-row { display: flex; align-items: center; gap: 18rpx; flex-wrap: wrap; }
.add-task-page__date-label { color: $brand-color-text; font-size: 25rpx; font-weight: 600; letter-spacing: .5rpx; margin-right: 6rpx; }
.add-task-page__date-pill {
  display: inline-flex; align-items: center; gap: 12rpx;
  height: 76rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: $brand-color-surface;
  box-shadow: inset 0 0 0 1rpx #eef2ef;
  color: $brand-color-text;
  font-size: 26rpx;
  font-weight: 500;
}
.add-task-page__date-pill--empty { color: $brand-color-text-secondary; font-weight: 400; }
.add-task-page__date-pill:active { box-shadow: inset 0 0 0 2rpx $brand-color-primary; }
.add-task-page__date-clear { color: $brand-color-text-secondary; font-size: 23rpx; text-decoration: underline; }

/* 提交：保留我的大圆角，但用 wd-button 实现。 */
.add-task-page__submit { margin-top: 48rpx; }
.add-task-page__hint { display: block; margin-top: 16rpx; color: $brand-color-text-secondary; font-size: 22rpx; text-align: center; }
</style>
