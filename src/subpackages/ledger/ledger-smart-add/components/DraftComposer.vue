<!-- 文件用途：提供聊天底部的固定输入和发送动作，键盘位置交给页面统一处理。 -->
<template>
  <view class="draft-composer">
    <view class="draft-composer__field">
      <!-- 微信端组件内部的高度无法随外部样式收紧，使用原生文本域固定底栏高度。 -->
      <textarea
        class="draft-composer__textarea"
        :value="text"
        :placeholder="placeholder"
        :disabled="disabled"
        :maxlength="4000"
        :adjust-position="false"
        :show-confirm-bar="false"
        confirm-type="send"
        data-testid="smart-draft-input"
        @input="update"
        @keyboardheightchange="keyboardChanged"
        @confirm="send"
      />
    </view>
    <wd-button
      size="medium"
      round
      :disabled="disabled || !text.trim()"
      data-testid="smart-draft-send"
      @click="send"
    >
      发送
    </wd-button>
  </view>
</template>

<script setup lang="ts">
/** 页面持有正在编辑的原话，输入组件不持有草稿或网络能力。 */
const props = defineProps<{ text: string; placeholder: string; disabled: boolean }>()
const emit = defineEmits<{ text: [value: string]; send: []; keyboard: [height: number] }>()

/** 使用原生输入事件的完整文字，多行编辑留在输入框内。 */
function update(event: Event | { detail: { value: string } }) {
  const value = 'detail' in event ? event.detail.value : (event.target as HTMLTextAreaElement | null)?.value
  if (typeof value === 'string') emit('text', value)
}

/** 键盘发送与点击走相同的空输入、重复发送检查。 */
function send() {
  if (!props.disabled && props.text.trim()) emit('send')
}

/** 微信键盘高度由输入组件转发，页面只避让一次。 */
function keyboardChanged(event: { detail: { height: number } }) {
  emit('keyboard', Math.max(0, Number(event.detail.height) || 0))
}
</script>

<style lang="scss" scoped>
/* 输入在窄屏可收缩，发送按钮不随长句被挤出。 */
.draft-composer {
  display: flex;
  gap: 16rpx;
  align-items: flex-end;
  &__field {
    min-width: 0;
    flex: 1;
    background: #f5f7f2;
    border: 1rpx solid $brand-color-border;
    border-radius: $brand-radius-input;
    overflow: hidden;
  }
  /* 两行输入随字号留足高度，长句在文本域内继续滚动。 */
  &__textarea {
    width: 100%;
    height: 88rpx;
    padding: 12rpx 20rpx;
    box-sizing: border-box;
    color: $brand-color-text;
    font-size: 28rpx;
    line-height: 32rpx;
  }
}
</style>
