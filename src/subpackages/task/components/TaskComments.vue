<!--
  事项详情页的"备注对话"区域：
  - 顶部：评论列表（倒序，新的在前）
  - 底部：输入框 + 发送按钮
  - 终态时（terminalKind 存在）整体禁用
  - 1-200 字校验；非空 trim 后才能发送
  - 只在本页使用：放在 task-detail/components/ 而非主包 components
-->
<template>
  <view class="task-comments" data-testid="task-comments">
    <text class="task-comments__title">备注对话</text>

    <view v-if="comments.length === 0" class="task-comments__empty" data-testid="task-comments-empty">
      <text class="task-comments__empty-text">还没有留言。补充一下背景、约定个时间，或者留个赞许。</text>
    </view>

    <view v-else class="task-comments__list">
      <TaskCommentItem
        v-for="c in comments"
        :key="c.id"
        :comment="c"
      />
    </view>

    <view v-if="disabled" class="task-comments__sealed" data-testid="task-comments-sealed">
      <text class="task-comments__sealed-text">事项已结束，留言通道已关闭。</text>
    </view>

    <view v-else class="task-comments__composer">
      <view class="task-comments__input">
        <wd-textarea
          v-model="draft"
          :placeholder="placeholder"
          :maxlength="200"
          :disabled="isBusy"
          :error="Boolean(localError)"
          show-word-limit
          no-border
          data-testid="task-comments-input"
        />
      </view>
      <view class="task-comments__send-row">
        <wd-button
          type="primary"
          size="small"
          :loading="isBusy"
          :disabled="!canSend || isBusy"
          data-testid="task-comments-send"
          @click="send"
        >
          发送
        </wd-button>
      </view>
    </view>

    <text v-if="localError" class="task-comments__error" data-testid="task-comments-error">{{ localError }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TaskComment } from '../../../types/task'
import { useTaskStore } from '../../../store/modules/task'
import { TASK_COMMENT_MAX_LENGTH } from '../../../services/task-cloud'
import TaskCommentItem from './TaskCommentItem.vue'

const props = defineProps<{
  taskId: string
  comments: TaskComment[]
  /** 已终止时禁用整个输入区 */
  disabled?: boolean
}>()

const taskStore = useTaskStore()
const draft = ref('')
const localError = ref('')
const placeholder = '说点什么，比如：明天到 / 已联系 / 谢啦'

const isBusy = computed(() => taskStore.phase === 'commenting')
const remaining = computed(() => TASK_COMMENT_MAX_LENGTH - draft.value.length)
const canSend = computed(() => {
  const text = draft.value.trim()
  return text.length >= 1 && text.length <= TASK_COMMENT_MAX_LENGTH
})

watch(() => props.taskId, () => {
  // 切换 task 时清空草稿和错误
  draft.value = ''
  localError.value = ''
})

async function send(): Promise<void> {
  if (!canSend.value || isBusy.value) return
  const text = draft.value.trim()
  if (!text) {
    localError.value = '留言不能为空'
    return
  }
  if (text.length > TASK_COMMENT_MAX_LENGTH) {
    localError.value = `留言最多 ${TASK_COMMENT_MAX_LENGTH} 个字`
    return
  }
  localError.value = ''
  const ok = await taskStore.addComment(props.taskId, text)
  if (ok) {
    draft.value = ''
  } else {
    localError.value = taskStore.errorMessage || '暂时无法发送，请稍后重试'
  }
}

// 暴露给测试 / 调试使用
defineExpose({ send, canSend })
</script>

<style lang="scss" scoped>
.task-comments {
  display: flex;
  flex-direction: column;
  margin-top: 16rpx;
  &__title {
    display: block;
    margin-bottom: 16rpx;
    color: $brand-color-text-secondary;
    font-size: 22rpx;
    letter-spacing: 1rpx;
  }
  &__empty {
    padding: 32rpx 28rpx;
    border-radius: 20rpx;
    background: $brand-color-surface;
  }
  &__empty-text {
    display: block;
    color: $brand-color-text-secondary;
    font-size: 25rpx;
    line-height: 1.6;
  }
  /* 评论列表：内部 padding 加大让首条评论有空间；列表本身最大 800rpx，超出滚动。 */
  &__list {
    padding: 28rpx 28rpx;
    border-radius: 20rpx;
    background: $brand-color-surface;
    max-height: 800rpx;
    overflow-y: auto;
  }
  &__list > .task-comment-item + .task-comment-item {
    /* 相邻评论之间加分隔线和间距 */
    border-top: 1rpx solid rgba(0, 0, 0, 0.06);
    margin-top: 24rpx;
    padding-top: 24rpx;
  }
  &__sealed {
    margin-top: 8rpx;
    padding: 18rpx 24rpx;
    border-radius: 16rpx;
    background: $brand-color-surface;
  }
  &__sealed-text {
    color: $brand-color-text-secondary;
    font-size: 23rpx;
  }
  &__composer {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    margin-top: 16rpx;
    padding: 20rpx 20rpx 24rpx;
    border-radius: 20rpx;
    background: $brand-color-surface;
  }
  /* textarea 容器：强制 block + 100% 宽度，绕开 wd-textarea 内部 flex 的宽度塌缩问题 */
  &__input {
    display: block;
    width: 100%;
  }
  &__send-row {
    display: flex;
    justify-content: flex-end;
    align-items: center;
  }
  &__error {
    display: block;
    margin-top: 10rpx;
    color: #c5684d;
    font-size: 22rpx;
  }
}
</style>
