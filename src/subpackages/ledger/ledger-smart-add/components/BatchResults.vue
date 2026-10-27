<!-- 文件用途：显示正式逐项状态和成功账目入口，未知结果只能先核对。 -->
<template>
  <view class="batch-results">
    <text class="batch-results__title">已保存{{ successCount }}笔</text>
    <text class="batch-results__hint">已保存的不会重复记入。退出后可核对原结果，未保存内容不会恢复。</text>
    <view
      v-for="(item, index) in rows"
      :key="item.itemId"
      class="batch-results__card"
      :data-testid="`smart-batch-item-${index}`"
    >
      <view class="batch-results__heading">
        <text>{{ item.position }} · {{ item.title }}</text>
        <wd-tag :type="item.status === 'success' ? 'success' : 'warning'">{{ labels[item.status] }}</wd-tag>
      </view>
      <text v-if="item.amount" class="batch-results__amount">{{ item.amount }}</text>
      <text v-if="item.entry" class="batch-results__hint">
        {{ item.entry.date || '待补充日期' }} · {{ item.member }}
      </text>
      <text v-if="item.status !== 'success'" class="batch-results__hint">
        {{ describe(item.code, item.status) }}
      </text>
      <wd-button
        v-if="item.status === 'success' && item.entryId"
        size="small"
        plain
        :disabled="busy"
        @click="emit('open', item.entryId)"
      >
        查看账目
      </wd-button>
      <view v-if="item.entry && item.status !== 'success' && canEdit" class="batch-results__actions">
        <wd-button size="small" plain :disabled="busy" @click="emit('edit', item.itemId)">修改这笔</wd-button>
        <wd-button size="small" plain type="info" :disabled="busy" @click="emit('remove', item.itemId)">
          移除
        </wd-button>
      </view>
    </view>
    <text v-if="!rows.length" class="batch-results__hint">未保存项已移除，可重新输入另一批。</text>
    <wd-button
      block
      plain
      :loading="busy"
      :disabled="busy"
      data-testid="smart-batch-query"
      @click="emit('query')"
    >
      核对原结果
    </wd-button>
    <wd-button v-if="canRetry" block :disabled="busy" data-testid="smart-batch-retry" @click="emit('retry')">
      仅保存未成功项
    </wd-button>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BatchResult, DraftChoice, DraftEntry } from '../../../../types/ledger-draft'
/** 页面只读结果，不要求恢复消费原文。 */
const props = defineProps<{
  result: Omit<BatchResult, 'items'> & { items: readonly BatchResult['items'][number][] }
  busy: boolean
  canRetry: boolean
  /** 当前页仍保留的清单，不从历史回执恢复。 */
  entries: readonly DraftEntry[]
  /** 当前可选类目的显示资料。 */
  categories: readonly DraftChoice[]
  /** 当前成员显示资料，不包含后台身份。 */
  members: readonly DraftChoice[]
  /** 是否仍在本次确认流程，退出后为否。 */
  hasDraft: boolean
  /** 所有未知结果核对后才允许编辑未成功项。 */
  canEdit: boolean
}>()
/** 保存、回查和查看分别交回父级，组件不能自行重发。 */
const emit = defineEmits<{
  query: []
  retry: []
  open: [entryId: string]
  edit: [itemId: string]
  remove: [itemId: string]
}>()
/** 将正式状态与本页显示资料按稳定编号对应；退出后的回查不带回消费正文。 */
const rows = computed(
  /** 只有当前页仍有资料时才展示金额和成员，不能从回执推回失败清单。 */
  () =>
    props.result.items.flatMap(
      /** 保留原执行顺序，移除未成功项后不再显示本页已经删去的草稿。 */
      (
        /* 正式的逐项执行状态。 */
        item,
        /* 原批次中稳定的显示位置。 */
        index,
      ) => {
        /** 本页中与回执对应的明确项目，历史回查时为空。 */
        const entry = props.entries.find(
          /** 不能把另一项的金额拼到当前成功状态上。 */
          (
            /* 当前页中的候选显示项。 */
            candidate,
          ) => candidate.id === item.itemId,
        )
        if (props.hasDraft && !entry && item.status !== 'success') return []
        return [
          {
            ...item,
            position: index + 1,
            entry,
            title:
              props.categories.find(
                /** 只查当前页快照中的类目显示名称。 */
                (
                  /* 当前允许的类目选项。 */
                  category,
                ) => category.key === entry?.categoryKey,
              )?.name || (entry ? '类目待确认' : '原账目'),
            member:
              props.members.find(
                /** 成员短编号只作显示匹配，不作身份权限。 */
                (
                  /* 当前允许显示的成员。 */
                  member,
                ) => member.key === entry?.memberKey,
              )?.name || '待补充成员',
            amount: entry?.amountCents
              ? `${entry.type === 'income' ? '+' : '−'} ¥${(entry.amountCents / 100).toFixed(2)}`
              : '',
          },
        ]
      },
    ),
)
/** 所有状态都有文字，不能只使用颜色表达。 */
const labels = { success: '已保存', failed: '未保存', unknown: '待核对', unexecuted: '未执行' }
/** 只统计正式成功，不把未确定状态算入成功数。 */
const successCount = computed(
  /**
   * 从本页只读状态计算显示或操作条件，不在计算中调用云端。
   */
  () =>
    props.result.items.filter(
      /**
       * 按当前类型、范围或状态保留符合条件的项，返回独立列表。
       */
      (
        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        item,
      ) => item.status === 'success',
    ).length,
)
/** 固定原因文案，不展示云端或模型任意文本。 */
function describe(
  /**
   * 程序固定的错误编号，不包含原话或第三方异常。
   */
  code: string | null,
  /**
   * 已经核对的正式状态，未知结果不能当作失败或成功。
   */
  status: string,
): string {
  if (status === 'unknown') return '暂时不能确定是否保存成功，请先核对原结果。'
  if (code === 'LEDGER_CATEGORY_NOT_FOUND') return '当前类目不可用，请修改这笔后重新确认。'
  if (status === 'unexecuted') return '这笔尚未执行，已保存的账目保持。'
  return '这笔未能保存，请核对清单后手动再试。'
}
</script>

<style lang="scss" scoped>
/* 正式结果与待确认清单分开，未知结果不放直接重试按钮。 */
.batch-results {
  &__amount {
    font-size: 36rpx;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  &__actions {
    display: flex;
    gap: 16rpx;
  }
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  &__title {
    padding: 28rpx;
    font-size: 40rpx;
    font-weight: 700;
    background: #e6f4eb;
    border-radius: $brand-radius-card;
  }
  &__hint {
    display: block;
    line-height: 1.8;
    font-size: 24rpx;
    color: $brand-color-text-secondary;
  }
  &__card {
    padding: 28rpx;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 24rpx;
    border: 1rpx solid $brand-color-border;
    background: $brand-color-surface;
    border-radius: $brand-radius-card;
  }
  &__heading {
    width: 100%;
    display: flex;
    justify-content: space-between;
    font-size: 28rpx;
  }
}
</style>
