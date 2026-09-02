<template>
  <view class="ledger-ai-composer">
    <wd-textarea
      v-model="questionModel"
      :maxlength="200"
      auto-height
      show-word-limit
      placeholder="例如：两百元左右的火锅支出"
      custom-class="ledger-ai-composer__input"
      data-testid="ledger-ai-question-input"
    />
    <wd-button block :loading="submitting" :disabled="submitting || !questionModel.trim()" data-testid="ledger-ai-submit" @click="emit('submit')">发送</wd-button>
  </view>
</template>

<script setup lang="ts">
const questionModel = defineModel<string>({ required: true })
defineProps<{ submitting: boolean }>()
const emit = defineEmits<{ submit: [] }>()
</script>

<style lang="scss" scoped>
.ledger-ai-composer {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 20rpx;
  border: 2rpx solid $brand-color-border;
  border-radius: $brand-radius-card;
  background: $brand-color-surface;
  &__input { min-height: 110rpx; }
}
</style>
