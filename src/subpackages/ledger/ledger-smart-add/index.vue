<!-- 文件用途：组合一句话记账输入、清单、编辑和正式结果，不恢复退出前的未完成内容。 -->
<template>
  <view class="ledger-smart-add">
    <view v-if="state.phase === 'loading'" class="ledger-smart-add__loading">
      <wd-loading />
      <text>正在加载账本记账页。</text>
    </view>
    <template v-else>
      <view v-if="state.error || pageError" class="ledger-smart-add__error" role="alert">
        {{ state.error || pageError }}
      </view>
      <DraftComposer
        v-if="!state.batch && ['input', 'understanding'].includes(state.phase)"
        :text="state.text"
        :last-input="state.lastInput"
        :question="state.view?.question || ''"
        :consent="state.consent"
        :busy="busy"
        :available="state.available"
        @text="flow.setText"
        @consent="flow.setConsent"
        @send="flow.send"
        @cancel="flow.cancelUnderstanding"
      />
      <view v-if="['saving', 'editing', 'querying'].includes(state.phase)" class="ledger-smart-add__loading">
        <wd-loading />
        <text>正在核对本次结果。</text>
      </view>
      <DraftEntryList
        v-if="state.view?.status === 'DRAFT_READY' && !state.batch"
        :entries="state.view.draft.entries"
        :categories="state.view.categories"
        :members="state.view.members"
        :successful="successful"
        :disabled="busy || hasUnknown"
        @edit="editId = $event"
        @remove="flow.remove"
      />
      <view
        v-if="state.view?.status === 'DRAFT_READY' && !state.batch"
        class="ledger-smart-add__confirmation"
      >
        <view class="ledger-smart-add__totals">
          <text>支出 ¥{{ yuan(totals.expense) }}</text>
          <text>收入 ¥{{ yuan(totals.income) }}</text>
        </view>
        <wd-button
          block
          :loading="busy"
          :disabled="busy || !state.view.draft.entries.length"
          data-testid="smart-draft-confirm"
          @click="flow.save"
        >
          确认保存这{{ state.view.draft.entries.length }}笔
        </wd-button>
        <wd-button block plain :disabled="busy" @click="flow.restart">重新描述</wd-button>
      </view>
      <BatchResults
        v-if="state.batch"
        :result="state.batch"
        :busy="busy"
        :can-retry="canRetry"
        :entries="state.view?.draft.entries || []"
        :categories="state.view?.categories || []"
        :members="state.view?.members || []"
        :has-draft="!!state.view"
        :can-edit="!!state.view && !hasUnknown && !state.stopped"
        @edit="editId = $event"
        @remove="flow.remove"
        @query="flow.query()"
        @retry="flow.save"
        @open="openEntry"
      />
      <wd-button v-if="state.phase === 'saving'" block plain @click="flow.stop">停止后续保存</wd-button>
      <view v-if="state.batch && !busy" class="ledger-smart-add__another">
        <wd-button block plain @click="flow.restart">重新输入另一批</wd-button>
      </view>
      <view v-if="!state.view && !state.batch && state.history.length" class="ledger-smart-add__history">
        <text class="ledger-smart-add__caption">原保存结果</text>
        <wd-cell
          v-for="(batch, index) in state.history"
          :key="batch.batchId"
          :title="`第${index + 1}批 · ${savedCount(batch.items)}笔已保存`"
          value="核对"
          is-link
          @click="flow.query(batch.batchId)"
        />
      </view>
      <wd-button
        block
        type="info"
        plain
        :disabled="state.phase === 'editing'"
        custom-style="margin-top:32rpx"
        @click="back"
      >
        返回手动记账
      </wd-button>
      <text class="ledger-smart-add__footer">退出后清空未完成内容，已经保存的账目保留。</text>
    </template>
    <DraftEntryEditor
      v-if="editing && state.view"
      :key="editing.id"
      :entry="editing"
      :categories="state.view.categories"
      :members="state.view.members"
      :busy="busy"
      @save="saveEdit"
      @close="editId = null"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { useHouseholdStore } from '../../../store/modules/household'
import { createDraftCloud } from '../../../services/ledger-draft-cloud'
import type { DraftEntry } from '../../../types/ledger-draft'
import { useLedgerDraft } from './use-ledger-draft'
import DraftComposer from './components/DraftComposer.vue'
import DraftEntryList from './components/DraftEntryList.vue'
import DraftEntryEditor from './components/DraftEntryEditor.vue'
import BatchResults from './components/BatchResults.vue'

/** 沿用当前家庭，只作业务目标，不将它当成可信身份。 */
const household = useHouseholdStore()
/** 无平台能力时给出固定提示，页面仍可返回手动入口。 */
const pageError = ref('')
/** 当前唯一的编辑项目，弹层关闭不等于离开本页。 */
const editId = ref<string | null>(null)
/** 页面初始化前也保留同形状状态，避免模板读取空对象。 */
const fallback = {
  /**
   * 初始化本页明确使用的云连接；检查替身不连接真实云端。
   */
  init() {},

  /**
   * 接收固定动作及已复制资料，返回完整响应供客户端严格核对。
   */
  async callFunction() {
    throw new Error('当前平台未提供云端连接')
  },
}
/** 云端客户端只归本页所有，不写全局存储。 */
let cloud
try {
  cloud = createDraftCloud(household.household?.id || '')
} catch {
  cloud = createDraftCloud(household.household?.id || '', fallback)
  pageError.value = '请在微信中使用一句话记账，或返回手动记账。'
}
/** 页面负责组合，业务状态与副作用由专属状态处理。 */
const flow = useLedgerDraft(cloud)
/** 只读显示资料与固定操作来自同一个状态实例。 */
const { state, busy, totals, successful, hasUnknown } = flow
/** 成功项和未知项不能编辑，原输入不会因查询结果恢复。 */
const editing = computed(
  /**
   * 从本页只读状态计算显示或操作条件，不在计算中调用云端。
   */
  () =>
    state.view?.draft.entries.find(
      /**
       * 按当前稳定字段匹配单项，供后续核对；没有匹配时保持空值。
       */
      (
        /**
         * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
         */
        entry,
      ) => entry.id === editId.value && !successful.value.has(entry.id) && !hasUnknown.value,
    ) || null,
)
/** 只有当前页仍有确认清单且不存在未知结果时才能重试未成功项。 */
const canRetry = computed(
  /**
   * 从本页只读状态计算显示或操作条件，不在计算中调用云端。
   */
  () =>
    Boolean(
      state.view?.status === 'DRAFT_READY' &&
      state.batch &&
      !hasUnknown.value &&
      !state.stopped &&
      state.view.draft.entries.some(
        /**
         * 核对集合中是否存在符合当前条件的项，返回布尔结果。
         */
        (
          /**
           * 当前集合中的单项，使用所在集合的既有范围和检查规则。
           */
          item,
        ) => !successful.value.has(item.id),
      ),
    ),
)
/** 显示金额不参与保存计算。 */
function yuan(
  /**
   * 已经检查的整数分，显示换算不参与正式保存计算。
   */
  cents: number,
): string {
  return (cents / 100).toFixed(2)
}
/** 历史只统计正式成功项，模板不包含无说明的匿名处理。 */
function savedCount(
  /**
   * 按稳定编号组织的本批项目和状态，不丢掉后半段结果。
   */
  items: readonly {
    /**
     * 已经核对的正式状态，未知结果不能当作失败或成功。
     */
    status: string
  }[],
): number {
  return items.filter(
    /**
     * 按当前类型、范围或状态保留符合条件的项，返回独立列表。
     */
    (
      /**
       * 当前集合中的单项，使用所在集合的既有范围和检查规则。
       */
      item,
    ) => item.status === 'success',
  ).length
}
/** 修改经过后台检查，失败时保留编辑弹层供用户处理。 */
async function saveEdit(
  /**
   * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
   */
  entry: DraftEntry,
): Promise<void> {
  await flow.edit(entry)
  if (!state.error) editId.value = null
}
/** 只能打开正式成功账目的原详情页，身份权限仍由原云端核对。 */
function openEntry(
  /**
   * 正式成功账目的稳定引用，打开详情后仍重新核对权限。
   */
  entryId: string,
): void {
  // 查看正式账目会离开本流程，替换当前页以触发清理；返回仍回到原手动页。
  uni.redirectTo({ url: `/subpackages/ledger/ledger-detail/index?entryId=${encodeURIComponent(entryId)}` })
}
/** 用户点击返回时说明清除范围，保存已确认时仍按原结果处理。 */
function back(): void {
  if (state.text || state.view)
    uni.showModal({
      title: '退出一句话记账？',
      content:
        state.phase === 'saving'
          ? '已经确认的保存会按实际结果处理，未完成输入会清空。'
          : '未完成的输入和清单会清空，已保存的账目保留。',

      /**
       * 只读取用户明确确认结果，再执行本次导航意图。
       */
      success(
        /**
         * 当前请求、选择或事务返回的结果，不能仅凭文字宣称已保存。
         */
        result,
      ) {
        if (result.confirm) uni.navigateBack()
      },
    })
  else uni.navigateBack()
}
onLoad(
  /**
   * 页面进入时只读取连接及原回执状态，不自动调用模型或保存。
   */
  () => {
    void flow.initialize()
  },
)
onUnload(
  /**
   * 卸载时清空本页原话、清单及编辑引用，撤回旧响应显示资格。
   */
  () => {
    editId.value = null
    flow.dispose()
  },
)
/** 家庭切换或退出登录时立即撤回原页面资格，迟到结果不能再恢复旧家庭资料。 */
watch(
  /**
   * 核对当前家庭变化并撤回旧页资格，不能由迟到响应恢复旧内容。
   */
  () => household.household?.id,

  /**
   * 核对当前家庭变化并撤回旧页资格，不能由迟到响应恢复旧内容。
   */
  (
    /**
     * 当前记录的稳定编号，只在已经核对的范围内查回。
     */
    id,
    /**
     * 本次操作前已经核对的状态或阶段，用于保持旧值和失败恢复。
     */
    previous,
  ) => {
    if (previous && id !== previous) {
      flow.dispose()
      editId.value = null
      pageError.value = '家庭状态已变化，请返回后重新进入。'
    }
  },
)
</script>

<style lang="scss" scoped>
/* 沿用睦录奶油底与绿色操作，清单可随手机页面自然滚动。 */
.ledger-smart-add {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 40rpx 32rpx calc(40rpx + env(safe-area-inset-bottom));
  background: $brand-color-background;
  color: $brand-color-text;
  &__loading {
    display: flex;
    gap: 20rpx;
    justify-content: center;
    padding-top: 100rpx;
    font-size: 26rpx;
  }
  &__error {
    margin-bottom: 24rpx;
    padding: 24rpx;
    color: #8c3727;
    background: #fff0e8;
    border-radius: $brand-radius-input;
    font-size: 26rpx;
    line-height: 1.7;
  }
  &__confirmation {
    display: flex;
    flex-direction: column;
    gap: 20rpx;
    margin: 32rpx 0;
  }
  &__totals {
    display: flex;
    justify-content: space-between;
    font-size: 26rpx;
  }
  &__another {
    margin-top: 24rpx;
  }
  &__history {
    margin-top: 48rpx;
    border-top: 1rpx solid $brand-color-border;
    padding-top: 24rpx;
  }
  &__caption {
    display: block;
    margin-bottom: 20rpx;
    font-size: 28rpx;
    font-weight: 600;
  }
  &__footer {
    display: block;
    text-align: center;
    margin-top: 24rpx;
    font-size: 22rpx;
    line-height: 1.7;
    color: $brand-color-text-secondary;
  }
}
</style>
