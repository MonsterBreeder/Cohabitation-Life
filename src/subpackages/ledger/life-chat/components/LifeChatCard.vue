<!-- 文件用途：展示聊天来源、待确认内容和后续操作，由上层负责执行和核对。 -->
<template>
  <view
    v-if="result.kind === 'answer' || result.kind === 'stats'"
    class="life-card"
    data-testid="life-chat-answer"
  >
    <text class="life-card__title">{{ result.message }}</text>
    <text v-if="result.range" class="life-card__detail">
      {{ result.range.start }} 至 {{ result.range.end }}
    </text>
    <wd-cell
      v-for="candidate in result.candidates || []"
      :key="candidate.ref"
      :title="`${candidate.categoryName} · ¥${(candidate.amountCents / 100).toFixed(2)}`"
      :label="
        [candidate.date || candidate.occurredAt?.slice(0, 10), candidate.note, candidate.payerName]
          .filter(Boolean)
          .join(' · ')
      "
      is-link
      @click="emit('source', candidate.ref)"
    />
    <wd-button v-if="result.hasMore" size="small" variant="text" :disabled="busy" @click="emit('more')">
      查看全部
    </wd-button>
    <wd-button v-if="result.kind === 'stats'" size="small" plain @click="emit('stats')">
      查看账本统计
    </wd-button>
  </view>
  <view
    v-else-if="result.kind === 'confirm'"
    class="life-card life-card--receipt"
    data-testid="life-chat-confirm-card"
  >
    <view class="life-card__header">
      <text class="life-card__title">待确认{{ result.title }}</text>
      <text v-if="result.label" class="life-card__detail">{{ result.label }}</text>
    </view>
    <view class="life-card__body">
      <view v-for="field in result.fields" :key="field.label" class="life-card__field">
        <text class="life-card__detail">{{ field.label }}</text>
        <view class="life-card__values">
          <text v-if="result.action !== 'create'">{{ field.before }} →</text>
          <text class="life-card__next">{{ field.after }}</text>
        </view>
      </view>
      <view v-if="active" class="life-card__actions">
        <wd-button plain size="small" :disabled="busy" @click="emit('cancel')">取消</wd-button>
        <wd-button
          round
          size="small"
          :disabled="busy"
          data-testid="life-chat-confirm"
          @click="emit('confirm')"
        >
          {{ result.action === 'delete' ? '确认删除' : result.action === 'update' ? '确认修改' : '确认保存' }}
        </wd-button>
      </view>
    </view>
  </view>
  <view v-else-if="result.kind === 'choose_action' || result.kind === 'choose_record'" class="life-card">
    <text class="life-card__title">
      {{ result.kind === 'choose_action' ? '这一轮先处理哪一项？' : '你说的是哪条记录？' }}
    </text>
    <wd-cell
      v-for="(option, index) in result.options"
      :key="index"
      :title="option"
      :is-link="active && !busy"
      @click="active && !busy && emit('choose', index)"
    />
    <wd-button v-if="active" size="small" variant="text" :disabled="busy" @click="emit('cancel')">
      取消选择
    </wd-button>
  </view>
  <view v-else-if="result.kind === 'choose_place'" class="life-card" data-testid="life-chat-place-card">
    <text class="life-card__title">核对地点</text>
    <text class="life-card__detail">{{ result.placeName }}</text>
    <wd-cell
      v-if="result.placeCandidate"
      :title="result.placeCandidate"
      :is-link="active && !busy"
      label="使用已有足迹中的地点"
      @click="active && !busy && emit('choose', 0)"
    />
    <wd-button v-if="active" size="small" plain :disabled="busy" @click="emit('place')">
      在地图上选地点
    </wd-button>
    <wd-button v-if="active" size="small" variant="text" :disabled="busy" @click="emit('cancel')">
      取消
    </wd-button>
  </view>
  <view v-else-if="result.kind === 'saved'" class="life-card" data-testid="life-chat-saved">
    <text class="life-card__title">
      {{ result.action === 'delete' ? '已删除' : result.action === 'update' ? '已修改' : '已保存' }}
    </text>
    <wd-button v-if="result.action !== 'delete'" size="small" variant="text" @click="emit('details')">
      查看原记录
    </wd-button>
  </view>
  <view v-else-if="notice" class="life-card">
    <text>{{ notice }}</text>
  </view>
</template>

<script setup lang="ts">
import type { LifeChatResult } from '../../../../services/life-chat-cloud'

// 只发出用户点击事件，过时卡继续可读但不能确认或选择。
defineProps<{ result: LifeChatResult; notice: string; active: boolean; busy: boolean }>()
const emit = defineEmits<{
  source: [ref: string]
  more: []
  stats: []
  cancel: []
  confirm: []
  choose: [index: number]
  place: []
  details: []
}>()
</script>

<style lang="scss" scoped>
.life-card {
  // 统一小票底色和操作层级，微信组件处理实际按钮触区。
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12rpx;
  padding: 22rpx;
  border: 1rpx solid $brand-color-border;
  border-radius: 24rpx;
  background: $brand-color-surface;
  overflow-wrap: anywhere;
  &--receipt {
    gap: 0;
    padding: 0;
    align-items: stretch;
    overflow: hidden;
  }
  &__header {
    display: flex;
    flex-direction: column;
    padding: 22rpx;
    background: #e7f3ea;
    border-bottom: 1rpx dashed #b8d3c2;
  }
  &__title {
    color: $brand-color-text;
    font-weight: 700;
  }
  &__detail {
    color: $brand-color-text-secondary;
    font-size: 24rpx;
  }
  &__body {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    padding: 22rpx;
  }
  &__field {
    padding: 14rpx 16rpx;
    border-radius: 12rpx;
    background: #f5f7f2;
  }
  &__values {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 14rpx;
  }
  &__next {
    color: $brand-color-action;
    font-weight: 700;
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 14rpx;
  }
}
</style>
