<!-- 文件用途：把原记账入口组合成当前页聊天，负责滚动、键盘和退出。 -->
<template>
  <view
    class="ledger-smart-add"
    :style="keyboardHeight ? { '--bookkeeping-keyboard-height': `${keyboardHeight}px` } : undefined"
  >
    <view
      v-if="state.phase === 'loading' && !pageError"
      class="ledger-smart-add__initial"
      data-testid="smart-draft-initial"
    >
      <wd-loading color="#267A5A" size="40rpx" />
      <text>正在加载账本记账页。</text>
    </view>
    <view v-else-if="pageError || !state.available" class="ledger-smart-add__initial">
      <text>{{ pageError || state.error }}</text>
      <wd-button plain @click="back">返回手动记账</wd-button>
    </view>
    <template v-else>
      <scroll-view
        class="ledger-smart-add__scroll"
        scroll-y
        :scroll-into-view="scrollTarget"
        @scroll="trackScroll"
      >
        <view class="ledger-smart-add__timeline">
          <view class="ledger-smart-add__message">
            <view class="ledger-smart-add__sender">
              <image class="ledger-smart-add__avatar" src="/static/brand/logo.png" mode="aspectFit" />
              <text>睦录</text>
            </view>
            <view class="ledger-smart-add__bubble ledger-smart-add__bubble--assistant">
              <text>把要记的收支告诉我。</text>
              <text class="ledger-smart-add__example">比如：昨天午饭 50 元，打车 28 元。</text>
            </view>
          </view>
          <view v-if="state.history.length || state.historyError" class="ledger-smart-add__history">
            <text v-if="state.historyError">{{ state.historyError }}</text>
            <wd-button
              v-else
              size="small"
              variant="text"
              :disabled="busy"
              @click="historyOpen = !historyOpen"
            >
              {{ historyOpen ? '收起原保存结果' : '原保存结果' }}
            </wd-button>
            <template v-if="historyOpen">
              <wd-cell
                v-for="(batch, index) in state.history"
                :key="batch.batchId"
                :title="`第 ${index + 1} 批 · ${batch.items.length} 笔`"
                value="核对"
                :is-link="!busy"
                @click="queryReceipt(batch.batchId)"
              />
            </template>
          </view>
          <view v-for="item in timeline" :key="item.id" class="ledger-smart-add__message">
            <view
              v-if="item.kind === 'progress'"
              class="ledger-smart-add__progress"
              data-testid="smart-draft-progress"
            >
              <wd-loading color="#267A5A" size="32rpx" />
              <text>{{ item.text }}</text>
            </view>
            <view
              v-else-if="item.kind === 'user'"
              class="ledger-smart-add__bubble ledger-smart-add__bubble--user"
            >
              <text>{{ item.text }}</text>
            </view>
            <template v-else>
              <view class="ledger-smart-add__sender">
                <image class="ledger-smart-add__avatar" src="/static/brand/logo.png" mode="aspectFit" />
                <text>睦录</text>
              </view>
              <view
                v-if="item.kind === 'assistant'"
                class="ledger-smart-add__bubble ledger-smart-add__bubble--assistant"
              >
                <text>{{ item.text }}</text>
              </view>
              <DraftEntryList
                v-else-if="item.kind === 'draft'"
                :display="item.display"
                :active="item.id === state.activeCard"
                :disabled="!canConfirm || !!editing"
                @confirm="flow.save(item.id)"
                @edit="editId = $event"
                @remove="flow.remove"
              />
              <BatchResults
                v-else-if="item.kind === 'receipt'"
                :result="item.result"
                :display="item.display"
                :busy="busy || !!editing || state.preparePending"
                :can-retry="item.result.batchId === state.batch?.batchId && canRetry && !state.preparePending"
                :can-edit="item.result.batchId === state.batch?.batchId && canRetry && !state.preparePending"
                @edit="editId = $event"
                @remove="flow.remove"
                @query="queryReceipt(item.result.batchId)"
                @retry="flow.retrySave(item.result.batchId)"
                @open="openEntry"
              />
            </template>
          </view>
          <view v-if="state.consentText" class="ledger-smart-add__notice" data-testid="smart-draft-consent">
            <text class="ledger-smart-add__notice-title">发送前了解数据用途</text>
            <text>这句话和必要的类目、成员显示信息会交给模型处理。未完成内容退出后清空。</text>
            <wd-button
              block
              size="medium"
              :disabled="busy"
              data-testid="smart-draft-consent-accept"
              @click="flow.acceptConsent()"
            >
              同意并发送
            </wd-button>
            <wd-button size="small" variant="text" @click="flow.declineConsent()">暂不发送</wd-button>
          </view>
          <view
            v-if="state.error || state.failedMessage"
            class="ledger-smart-add__notice ledger-smart-add__notice--error"
            role="alert"
          >
            <text>{{ state.error || '这条消息还未整理成功。' }}</text>
            <template v-if="state.failedMessage">
              <wd-button
                size="small"
                variant="text"
                :disabled="busy || !!state.text.trim()"
                @click="flow.send(state.failedMessage)"
              >
                重试这条消息
              </wd-button>
              <wd-button size="small" variant="text" :disabled="busy" @click="flow.discardFailed()">
                放弃这次整理
              </wd-button>
            </template>
            <wd-button v-if="state.preparePending" block :disabled="busy" @click="flow.retrySave()">
              继续原确认
            </wd-button>
          </view>
          <wd-button
            v-if="state.phase === 'understanding'"
            size="small"
            variant="text"
            @click="flow.cancelUnderstanding()"
          >
            取消整理
          </wd-button>
          <wd-button
            v-if="state.phase === 'saving' && !state.stopped"
            size="small"
            variant="text"
            @click="flow.stop()"
          >
            停止后续保存
          </wd-button>
          <wd-button
            v-if="state.batch && !complete && !busy && !state.preparePending"
            size="small"
            variant="text"
            @click="endBatch"
          >
            结束本批
          </wd-button>
          <view id="smart-chat-bottom-a" class="ledger-smart-add__anchor" />
          <view id="smart-chat-bottom-b" class="ledger-smart-add__anchor" />
        </view>
      </scroll-view>
      <view
        class="ledger-smart-add__footer"
        :class="{ 'ledger-smart-add__footer--keyboard': keyboardHeight > 0 }"
      >
        <view v-if="hasNew" class="ledger-smart-add__jump">
          <wd-button size="small" plain @click="jumpLatest">查看新消息</wd-button>
        </view>
        <DraftComposer
          :text="state.text"
          :placeholder="placeholder"
          :disabled="!canCompose || !!editing"
          @text="flow.setText"
          @send="flow.send()"
          @keyboard="updateKeyboard"
        />
      </view>
      <DraftEntryEditor
        v-if="editing && state.view"
        :key="editing.id"
        :entry="editing"
        :categories="state.view.categories"
        :members="state.view.members"
        :busy="busy"
        :error="state.error"
        @save="saveEdit"
        @close="editId = null"
      />
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, shallowRef, watch } from 'vue'
import { onLoad, onReady, onUnload } from '@dcloudio/uni-app'
import { useHouseholdStore } from '../../../store/modules/household'
import { createDraftCloud } from '../../../services/ledger-draft-cloud'
import type { DraftEntry } from '../../../types/ledger-draft'
import { useLedgerDraft } from './use-ledger-draft'
import DraftComposer from './components/DraftComposer.vue'
import DraftEntryList from './components/DraftEntryList.vue'
import DraftEntryEditor from './components/DraftEntryEditor.vue'
import BatchResults from './components/BatchResults.vue'

/** 页面只传所属目标，真实身份仍由云端读取。 */
const household = useHouseholdStore()
const pageError = shallowRef('')
const householdId = household.household?.id ?? ''
const editId = shallowRef<string | null>(null)
const historyOpen = shallowRef(false)
const keyboardHeight = shallowRef(0)
const scrollTarget = shallowRef('')
const hasNew = shallowRef(false)
const queryTarget = shallowRef('')
const instance = getCurrentInstance()?.proxy
let nearBottom = true
let viewportHeight = 0
let disposed = false

/** 浏览器等无微信云能力的平台仍可显示可返回的提示。 */
const fallback = {
  init() {},
  async callFunction() {
    throw new Error('当前平台未提供云端连接')
  },
}
let cloud
try {
  cloud = createDraftCloud(householdId)
} catch {
  cloud = createDraftCloud(householdId, fallback)
  pageError.value = '请在微信中使用一句话记账，或返回手动记账。'
}
if (!householdId) pageError.value = '需要先有家，才能使用一句话记账。'
const flow = useLedgerDraft(cloud)
const { state, busy, canCompose, canConfirm, canRetry, complete, successful, hasUnknown } = flow
const editing = computed(
  () =>
    state.view?.draft.entries.find(
      (entry) => entry.id === editId.value && !successful.value.has(entry.id) && !hasUnknown.value,
    ) ?? null,
)
const placeholder = computed(() =>
  state.batch && !complete.value
    ? '处理本次结果后继续记账'
    : state.view?.question
      ? '在这里回答睦录'
      : canConfirm.value
        ? '还想改哪一笔？'
        : '输入你要记的账',
)

/** 一次操作只插入一条进度。查回时尽量插在原回执下面。 */
const progressText = {
  loading: '',
  input: '',
  review: '',
  result: '',
  understanding: '正在整理账目…',
  editing: '正在更新待确认账目…',
  saving: '正在保存账目…',
  querying: '正在核对保存结果…',
}
const timeline = computed(() => {
  const items = [...state.messages]
  const text = progressText[state.phase]
  if (!text || (state.phase === 'editing' && editing.value)) return items
  const target =
    state.phase === 'querying' ? items.findIndex((item) => item.id === `receipt-${queryTarget.value}`) : -1
  const progress = { id: 'smart-chat-progress', kind: 'progress', text } as const
  return target < 0
    ? [...items, progress]
    : [...items.slice(0, target + 1), progress, ...items.slice(target + 1)]
})

/** 只量页面实际剩余区域，键盘避让由根容器承担。 */
function measureScroll() {
  if (!instance || disposed) return
  uni
    .createSelectorQuery()
    .in(instance)
    .select('.ledger-smart-add__scroll')
    .boundingClientRect((result) => {
      if (result && !Array.isArray(result)) viewportHeight = result.height ?? 0
    })
    .exec()
}

function trackScroll(event: { detail: { scrollHeight: number; scrollTop: number } }) {
  if (!viewportHeight) return
  nearBottom = event.detail.scrollHeight - event.detail.scrollTop - viewportHeight <= 48
  if (nearBottom) hasNew.value = false
}

/** 交替定位两个底部锚点，微信会响应连续的定位。 */
function jumpLatest() {
  if (disposed) return
  nearBottom = true
  hasNew.value = false
  scrollTarget.value =
    scrollTarget.value === 'smart-chat-bottom-a' ? 'smart-chat-bottom-b' : 'smart-chat-bottom-a'
}

async function updateKeyboard(height: number) {
  keyboardHeight.value = height
  await nextTick()
  measureScroll()
  if (nearBottom) jumpLatest()
}

watch(
  () => [state.messages[state.messages.length - 1], state.phase, state.consentText, state.error] as const,
  async ([last, phase], [before]) => {
    await nextTick()
    if (disposed) return
    if (nearBottom || (last !== before && last?.kind === 'user') || !!state.consentText) jumpLatest()
    else if (last !== before && last) hasNew.value = true
    if (phase === 'input') measureScroll()
  },
)

/** 历史查回是只读动作，不能切换正在整理的草稿。 */
async function queryReceipt(id: string) {
  if (busy.value || state.preparePending || editing.value) return
  queryTarget.value = id
  historyOpen.value = false
  await flow.query(id)
  queryTarget.value = ''
}

async function saveEdit(entry: DraftEntry) {
  await flow.edit(entry)
  if (!state.error) editId.value = null
}

/** 正式详情跳转触发卸载清理，详情仍核对原访问权限。 */
function openEntry(entryId: string) {
  uni.redirectTo({ url: `/subpackages/ledger/ledger-detail/index?entryId=${encodeURIComponent(entryId)}` })
}

function endBatch() {
  uni.showModal({
    title: '结束本批记账？',
    content: '未完成的内容会清空，仍可核对原保存结果。',
    success: (result) => {
      if (result.confirm) flow.restart()
    },
  })
}

function back() {
  uni.navigateBack()
}

onLoad(() => {
  if (!pageError.value) void flow.initialize()
})
onReady(measureScroll)
onUnload(() => {
  disposed = true
  flow.dispose()
})
/** 登录或家庭变动撤回聊天和回执，旧响应不能恢复页面。 */
watch(
  () => household.household?.id ?? '',
  (id) => {
    if (id !== householdId) {
      flow.dispose()
      editId.value = null
      pageError.value = '家庭状态已变化，请返回后重新进入。'
    }
  },
)
</script>

<style lang="scss" scoped>
/* 原导航下的聊天以滚动区和固定输入区划分。 */
.ledger-smart-add {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: calc(
    100vh - var(--window-top, 0px) - var(--window-bottom, 0px) - var(--bookkeeping-keyboard-height, 0px)
  );
  overflow: hidden;
  background: $brand-color-background;
  color: $brand-color-text;
  box-sizing: border-box;
  &__initial {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 20rpx;
    padding: 36rpx;
    text-align: center;
    font-size: 28rpx;
  }
  &__scroll {
    flex: 1;
    height: 0;
    min-height: 0;
  }
  &__timeline {
    padding: 32rpx 28rpx 20rpx;
  }
  &__message {
    display: flex;
    flex-direction: column;
    margin-bottom: 22rpx;
  }
  &__sender {
    display: flex;
    align-items: center;
    gap: 10rpx;
    margin-bottom: 10rpx;
    color: #536b60;
    font-size: 23rpx;
    font-weight: 600;
  }
  &__avatar {
    width: 42rpx;
    height: 42rpx;
  }
  &__bubble,
  &__progress,
  &__notice {
    border: 1rpx solid $brand-color-border;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
  }
  &__bubble {
    max-width: 84%;
    padding: 18rpx 22rpx;
    font-size: 28rpx;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  &__bubble--assistant,
  &__progress {
    align-self: flex-start;
  }
  &__bubble--user {
    align-self: flex-end;
    background: #e2f1e8;
    border-color: transparent;
  }
  &__example {
    display: block;
    margin-top: 8rpx;
    font-size: 24rpx;
    color: #536b60;
  }
  &__progress {
    display: flex;
    align-items: center;
    gap: 14rpx;
    padding: 17rpx 22rpx;
    font-size: 26rpx;
    color: $brand-color-action;
  }
  &__notice {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 16rpx;
    margin-bottom: 20rpx;
    padding: 22rpx;
    font-size: 26rpx;
    line-height: 1.6;
  }
  &__notice-title {
    font-weight: 700;
    font-size: 29rpx;
  }
  &__notice--error {
    background: #fcf0e8;
    color: #814532;
  }
  &__history {
    margin-bottom: 16rpx;
    font-size: 24rpx;
    color: #536b60;
  }
  &__footer {
    position: relative;
    padding: 16rpx 24rpx calc(14rpx + env(safe-area-inset-bottom));
    border-top: 1rpx solid $brand-color-border;
    background: $brand-color-surface;
  }
  &__footer--keyboard {
    padding-bottom: 14rpx;
  }
  &__jump {
    position: absolute;
    right: 24rpx;
    bottom: calc(100% + 12rpx);
  }
  &__anchor {
    height: 1px;
  }
}
</style>
