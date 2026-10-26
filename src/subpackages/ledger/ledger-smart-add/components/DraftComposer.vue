<!-- 文件用途：展示本轮描述、补问与信息用途说明，只上报输入和发送意图。 -->
<template>
  <view class="draft-composer">
    <text class="draft-composer__title">把几笔开销，一起告诉我</text>
    <text class="draft-composer__hint">支持人民币收入和支出，一次最多10笔。</text>
    <view v-if="lastInput" class="draft-composer__original">
      <text class="draft-composer__caption">你的描述</text>
      <text class="draft-composer__text">{{ lastInput }}</text>
    </view>
    <view v-if="question" class="draft-composer__question">
      <text class="draft-composer__caption">还需要确认</text>
      <text class="draft-composer__text">{{ question }}</text>
    </view>
    <wd-textarea
      :model-value="text"
      :disabled="busy || !available"
      :maxlength="4000"
      show-word-limit
      auto-height
      placeholder="例如：昨天我吃饭花50元，乙娱乐花100元"
      data-testid="smart-draft-input"
      @update:model-value="emit('text', $event)"
    />
    <view class="draft-composer__consent">
      <wd-checkbox
        :model-value="consent"
        :disabled="busy"
        @update:model-value="emit('consent', $event === true)"
      >
        同意用于本次整理
      </wd-checkbox>
      <text class="draft-composer__hint">
        输入和必要的类目、成员显示信息会交给模型处理。未完成内容退出后清空，不进入个人长期记忆；不同意仍可手动记账。
      </text>
    </view>
    <wd-button
      block
      :loading="busy"
      :disabled="busy || !available || !consent || !text.trim()"
      data-testid="smart-draft-send"
      @click="emit('send')"
    >
      {{ question ? '补充并整理' : '整理账目' }}
    </wd-button>
    <wd-button v-if="busy" block plain custom-style="margin-top:16rpx" @click="emit('cancel')">
      取消整理
    </wd-button>
  </view>
</template>

<script setup lang="ts">
/** 只接受父页面的显示资料，不持有可恢复草稿或云端连接。 */
defineProps<{
  text: string
  lastInput: string
  question: string
  consent: boolean
  busy: boolean
  available: boolean
}>()
/** 文字、用途同意及按钮意图均交回唯一页面状态处理。 */
const emit = defineEmits<{ text: [value: string]; consent: [value: boolean]; send: []; cancel: [] }>()
</script>

<style lang="scss" scoped>
/* 输入、用户原话与必要补问按阅读顺序排列。 */
.draft-composer {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  &__title {
    font-size: 44rpx;
    font-weight: 700;
    line-height: 1.5;
  }
  &__hint {
    display: block;
    font-size: 24rpx;
    line-height: 1.7;
    color: $brand-color-text-secondary;
  }
  &__original {
    padding: 28rpx;
    border-radius: $brand-radius-card;
    background: #e6f4eb;
  }
  &__question {
    padding: 28rpx;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
  }
  &__caption {
    display: block;
    margin-bottom: 12rpx;
    font-size: 22rpx;
    color: $brand-color-text-secondary;
  }
  &__text {
    display: block;
    font-size: 28rpx;
    line-height: 1.8;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  &__consent {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
  }
}
</style>
