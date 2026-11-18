<!-- 文件用途：展示聊天来源、待确认内容和后续操作，由上层负责执行和核对。 -->
<template>
  <view
    v-if="result.kind === 'answer' || result.kind === 'stats'"
    class="life-card life-card--answer"
    data-testid="life-chat-answer"
  >
    <view class="life-card__bubble">
      <text>{{ result.message }}</text>
      <text v-if="result.range" class="life-card__detail">
        {{ result.range.start }} 至 {{ result.range.end }}
      </text>
    </view>
    <!-- 查账回复先读结论，原记录保持可点开的整行，不与确认卡混在一起。 -->
    <view v-if="result.candidates?.length" class="life-card__sources">
      <view class="life-card__sources-label life-card__label">
        <view class="life-card__marker" aria-hidden="true">
          <wd-icon name="book" size="23rpx" />
        </view>
        <text>相关账目</text>
      </view>
      <wd-cell
        v-for="(candidate, index) in result.candidates"
        :key="candidate.ref"
        :title="candidate.categoryName"
        :value="`¥${(candidate.amountCents / 100).toFixed(2)}`"
        :label="
          [candidate.date || candidate.occurredAt?.slice(0, 10), candidate.note, candidate.payerName]
            .filter(Boolean)
            .join(' · ')
        "
        :border="index > 0"
        custom-title-class="life-card__source-title"
        custom-value-class="life-card__source-amount"
        custom-label-class="life-card__source-detail"
        is-link
        @click="emit('source', candidate.ref)"
      />
    </view>
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
    <!-- 直接复用原记账小票，三类业务的确认共享同一票头、虚线和留白。 -->
    <ReceiptPaper tear>
      <template #heading>
        <view v-if="recordHeading" class="life-card__caption life-card__label">
          <wd-icon
            v-if="headingField"
            :name="iconForField(headingField.label)"
            size="24rpx"
            aria-hidden="true"
          />
          <text>{{ result.title }} · {{ active ? '待确认' : '此前内容' }}</text>
        </view>
        <text class="life-card__title">{{ recordHeading || result.title }}</text>
        <text v-if="!recordHeading" class="life-card__caption">{{ active ? '待确认' : '此前内容' }}</text>
      </template>
      <!-- 短值并排比较，长地址和备注可整行换行。删除只在票头重复说明同一记录时略去原值。 -->
      <view class="life-card__fields">
        <view
          v-for="field in receiptFields"
          :key="field.label"
          class="life-card__field"
          :class="{ 'life-card__field--stacked': field.compare || field.long }"
        >
          <view class="life-card__label life-card__detail">
            <view class="life-card__marker" aria-hidden="true">
              <wd-icon :name="iconForField(field.label)" size="23rpx" />
            </view>
            <text>{{ field.label }}</text>
          </view>
          <view
            v-if="field.compare"
            class="life-card__comparison"
            :class="{ 'life-card__comparison--stacked': field.long }"
          >
            <view class="life-card__value">
              <text class="life-card__value-label">修改前</text>
              <text class="life-card__previous">{{ field.before }}</text>
            </view>
            <view class="life-card__value life-card__value--after">
              <text class="life-card__value-label">修改后</text>
              <text class="life-card__next" :class="{ 'life-card__next--long': field.long }">
                {{ field.after }}
              </text>
            </view>
          </view>
          <view v-else class="life-card__single" :class="{ 'life-card__single--long': field.long }">
            <text v-if="field.showBefore" class="life-card__previous">{{ field.before }}</text>
            <text class="life-card__next" :class="{ 'life-card__next--long': field.long }">
              {{ field.after }}
            </text>
          </view>
        </view>
      </view>
      <view v-if="active" class="life-card__actions">
        <wd-button
          block
          round
          :disabled="busy"
          :type="result.action === 'delete' ? 'danger' : 'primary'"
          data-testid="life-chat-confirm"
          @click="emit('confirm')"
        >
          {{ result.action === 'delete' ? '确认删除' : result.action === 'update' ? '确认修改' : '确认保存' }}
        </wd-button>
        <wd-button block size="small" variant="text" :disabled="busy" @click="emit('cancel')">取消</wd-button>
      </view>
    </ReceiptPaper>
  </view>
  <view
    v-else-if="result.kind === 'choose_action' || result.kind === 'choose_record'"
    class="life-card life-card--choice"
  >
    <view class="life-card__label">
      <view class="life-card__marker" aria-hidden="true"><wd-icon name="list" size="23rpx" /></view>
      <text class="life-card__title">
        {{ result.kind === 'choose_action' ? '这一轮先处理哪一项？' : '你说的是哪条记录？' }}
      </text>
    </view>
    <wd-cell
      v-for="(option, index) in result.options"
      :key="index"
      :title="option"
      border
      :is-link="active && !busy"
      @click="active && !busy && emit('choose', index)"
    />
    <wd-button v-if="active" size="small" variant="text" :disabled="busy" @click="emit('cancel')">
      取消选择
    </wd-button>
  </view>
  <view
    v-else-if="result.kind === 'choose_place'"
    class="life-card life-card--choice"
    data-testid="life-chat-place-card"
  >
    <view class="life-card__label">
      <view class="life-card__marker" aria-hidden="true"><wd-icon name="location" size="23rpx" /></view>
      <text class="life-card__title">核对地点</text>
    </view>
    <text class="life-card__detail">{{ result.placeName }}</text>
    <wd-cell
      v-if="result.placeCandidate"
      :title="result.placeCandidate"
      :is-link="active && !busy"
      label="使用已有足迹中的地点"
      @click="active && !busy && emit('choose', 0)"
    />
    <view v-if="active" class="life-card__actions">
      <wd-button block size="small" plain round :disabled="busy" @click="emit('place')">
        在地图上选地点
      </wd-button>
      <wd-button block size="small" variant="text" :disabled="busy" @click="emit('cancel')">取消</wd-button>
    </view>
  </view>
  <view v-else-if="result.kind === 'saved'" class="life-card life-card--saved" data-testid="life-chat-saved">
    <view class="life-card__saved-heading">
      <BookkeepingIcon name="check" tone="mint" />
      <text class="life-card__title">
        {{ result.action === 'delete' ? '已删除' : result.action === 'update' ? '已修改' : '已保存' }}
      </text>
    </view>
    <wd-button v-if="result.action !== 'delete'" size="small" variant="text" @click="emit('details')">
      查看原记录
    </wd-button>
  </view>
  <view v-else-if="notice" class="life-card life-card--message">
    <text>{{ notice }}</text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { LifeChatResult } from '../../../../services/life-chat-cloud'
import ReceiptPaper from '../../ledger-smart-add/components/ReceiptPaper.vue'
import BookkeepingIcon from '../../ledger-smart-add/components/BookkeepingIcon.vue'

// 只发出用户点击事件，过时卡继续可读但不能确认或选择。
const props = defineProps<{ result: LifeChatResult; notice: string; active: boolean; busy: boolean }>()
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

// 用项目现有的线条图标标识字段，新字段回退到通用资料图标。
const fieldIcons = new Map([
  ['金额', 'book'],
  ['日期', 'calendar-line'],
  ['截止日期', 'calendar-line'],
  ['游玩日期', 'calendar-line'],
  ['地点', 'location'],
  ['名称', 'list'],
  ['备注', 'edit'],
  ['回忆', 'edit'],
  ['付款人', 'user'],
  ['类目', 'tag'],
  ['类型', 'tag'],
  ['餐次', 'time-line'],
  ['删除后', 'delete'],
])

// 标签只用于选择装饰图标，完整的字段名仍由正文呈现。
function iconForField(label: string): string {
  return fieldIcons.get(label) || 'file'
}

// 新记录直接用名称或地点作标题，修改和删除先显示正在操作的原记录。
const headingField = computed(() =>
  props.result.action === 'create'
    ? props.result.fields?.find((field) => field.label === '名称' || field.label === '地点')
    : undefined,
)
const recordHeading = computed(() => props.result.label || headingField.value?.after || '')

// 仅收拢展示，保留后台传来的原值、新值和删除影响。
const receiptFields = computed(() =>
  (props.result.fields || [])
    .filter((field) => props.result.label || field !== headingField.value || !recordHeading.value)
    .map((field) => {
      const hasBefore = field.before !== '' && field.before != null
      const compare = props.result.action === 'update' && hasBefore
      const showBefore = props.result.action === 'delete' && hasBefore && field.before !== props.result.label
      const long =
        field.label === '备注' ||
        field.label === '回忆' ||
        [field.after, compare || showBefore ? field.before : ''].some(
          (value) => String(value).length > 18 || String(value).includes('\n'),
        )
      return { ...field, compare, showBefore, long }
    }),
)
</script>

<style lang="scss" scoped>
.life-card {
  // 常规对话与原记账气泡同宽；只有记录选择和小票占满可用行宽。
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12rpx;
  padding: 22rpx;
  border: 1rpx solid $brand-color-border;
  border-radius: $brand-radius-card;
  background: $brand-color-surface;
  overflow-wrap: anywhere;
  font-size: 28rpx;
  line-height: 1.55;
  min-width: 0;
  &--answer,
  &--receipt {
    padding: 0;
    border: 0;
    background: transparent;
  }
  &--receipt {
    display: block;
  }
  &--choice {
    align-items: stretch;
    gap: 8rpx;
  }
  &--saved {
    flex-flow: row wrap;
    justify-content: space-between;
    align-items: center;
    padding: 14rpx 18rpx;
  }
  &--message,
  &__bubble {
    align-self: flex-start;
    max-width: 84%;
    padding: 18rpx 22rpx;
    white-space: pre-wrap;
  }
  &__bubble {
    border: 1rpx solid $brand-color-border;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
  }
  &__title {
    display: block;
    color: $brand-color-text;
    font-weight: 700;
    font-size: 30rpx;
    line-height: 1.4;
    white-space: pre-wrap;
  }
  &__caption {
    display: block;
    margin-top: 6rpx;
    font-size: 24rpx;
    color: $brand-color-action;
  }
  &__caption + &__title {
    margin-top: 6rpx;
  }
  &__detail {
    display: block;
    color: #536b60;
    font-size: 24rpx;
  }
  &__sources {
    align-self: stretch;
    overflow: hidden;
    border: 1rpx solid $brand-color-border;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
  }
  &__sources-label {
    padding: 16rpx 28rpx 4rpx;
    font-size: 24rpx;
    color: #536b60;
  }
  &__label {
    display: flex;
    align-items: center;
    gap: 8rpx;
  }
  &__marker {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 36rpx;
    height: 36rpx;
    border-radius: 10rpx;
    color: $brand-color-action;
    background: #edf5ee;
  }
  :deep(.life-card__source-title),
  :deep(.life-card__source-amount) {
    color: $brand-color-text;
    font-weight: 600;
  }
  :deep(.life-card__source-amount) {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  :deep(.life-card__source-detail) {
    color: #536b60;
  }
  // 小票正文把短字段放在同一行，长文字和对照区独占一行。
  &__field {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16rpx;
    padding: 18rpx 0;
    border-bottom: 1rpx solid $brand-color-border;
    &--stacked {
      align-items: stretch;
      flex-direction: column;
      gap: 10rpx;
    }
    &:last-child {
      border-bottom: 0;
    }
  }
  &__single {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 6rpx;
    text-align: right;
    &--long {
      text-align: left;
    }
  }
  &__comparison {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12rpx;
    &--stacked {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  &__value {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    padding: 12rpx 16rpx;
    border: 1rpx solid #eee7df;
    border-radius: 14rpx;
    background: #faf6ef;
    &--after {
      border-color: #cde4d5;
      background: #eef7f0;
    }
  }
  &__value-label {
    color: #536b60;
    font-size: 23rpx;
  }
  &__previous {
    color: #536b60;
    font-size: 26rpx;
    font-variant-numeric: tabular-nums;
    white-space: pre-wrap;
  }
  &__next {
    color: $brand-color-text;
    font-weight: 600;
    font-size: 29rpx;
    font-variant-numeric: tabular-nums;
    white-space: pre-wrap;
    &--long {
      font-size: 26rpx;
      font-weight: 400;
    }
  }
  &__actions {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
    padding-top: 16rpx;
    border-top: 1rpx solid $brand-color-border;
  }
  &__saved-heading {
    display: flex;
    align-items: center;
    gap: 16rpx;
  }
}
</style>
