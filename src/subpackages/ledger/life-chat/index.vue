<!-- 文件用途：同一聊天页组合三个业务的入口、卡片和已有多笔记账流程。 -->
<template>
  <view class="life-chat" :style="keyboard ? { '--life-keyboard': `${keyboard}px` } : undefined">
    <view v-if="booting || !ready" class="life-chat__initial">
      <wd-loading v-if="booting" color="#267A5A" size="40rpx" />
      <text>{{ booting ? '正在加载聊天助手。' : error }}</text>
      <template v-if="!booting">
        <LifeChatCard
          v-if="recoveredWhileClosed"
          :result="recoveredWhileClosed"
          :notice="resultNotice(recoveredWhileClosed)"
          :active="false"
          :busy="busy"
          @details="openDetails(recoveredWhileClosed.domain, recoveredWhileClosed.id)"
        />
        <wd-button v-if="pendingOperation" plain :disabled="busy" @click="recover()">
          {{ busy ? status : '查回保存结果' }}
        </wd-button>
        <wd-button v-if="pendingOperation && !busy" variant="text" @click="recover(true)">
          停止未完成的保存
        </wd-button>
      </template>
      <wd-button v-if="!booting" plain @click="back">返回原页面</wd-button>
    </view>
    <template v-else>
      <scroll-view class="life-chat__scroll" scroll-y :scroll-into-view="anchor" @scroll="trackScroll">
        <view class="life-chat__timeline">
          <!-- 开场和逐条回复沿用原记账对话，示例收进气泡，避免开场变成按钮列表。 -->
          <view class="life-chat__message">
            <view class="life-chat__sender">
              <image class="life-chat__logo" src="/static/brand/logo.png" mode="aspectFit" />
              <text>睦录</text>
            </view>
            <view class="life-chat__bubble life-chat__bubble--assistant">
              <text>{{ introduction }}</text>
              <view class="life-chat__examples">
                <text class="life-chat__example-label">比如，你可以说</text>
                <wd-button
                  v-for="example in examples"
                  :key="example"
                  variant="text"
                  size="small"
                  custom-class="life-chat__example-button"
                  :disabled="busy || !!ledger"
                  @click="text = example"
                >
                  <view class="life-chat__example-content">
                    <text>{{ example }}</text>
                    <wd-icon name="arrow-right" size="24rpx" />
                  </view>
                </wd-button>
              </view>
            </view>
          </view>
          <view v-for="item in messages" :key="item.id" class="life-chat__message">
            <view v-if="item.text" class="life-chat__bubble life-chat__bubble--mine">{{ item.text }}</view>
            <template v-else-if="item.result">
              <view class="life-chat__sender">
                <image class="life-chat__logo" src="/static/brand/logo.png" mode="aspectFit" />
                <text>睦录</text>
              </view>
              <LifeChatCard
                :result="item.result"
                :notice="resultNotice(item.result)"
                :active="!!item.result.credential && item.result.credential === activeCard"
                :busy="busy"
                @source="openSource(item.result, $event)"
                @more="loadMore(item.id, item.result)"
                @stats="openStats"
                @choose="chat.card('choose', item.result, { index: $event })"
                @cancel="chat.card('cancel', item.result)"
                @confirm="confirm(item.result)"
                @place="pickPlace(item.result)"
                @details="openDetails(item.result.domain, item.result.id)"
              />
            </template>
          </view>
          <template v-if="ledger && ledgerState">
            <view v-for="item in ledgerState.messages" :key="item.id" class="life-chat__message">
              <view v-if="item.kind !== 'user'" class="life-chat__sender">
                <image class="life-chat__logo" src="/static/brand/logo.png" mode="aspectFit" />
                <text>睦录</text>
              </view>
              <view
                v-if="item.kind === 'assistant' || item.kind === 'user'"
                class="life-chat__bubble"
                :class="{ 'life-chat__bubble--mine': item.kind === 'user' }"
              >
                {{ item.text }}
              </view>
              <DraftEntryList
                v-else-if="item.kind === 'draft'"
                :display="item.display"
                :active="item.id === ledgerState.activeCard"
                :disabled="!ledger.canConfirm.value || !!editing"
                @edit="editId = $event"
                @remove="ledger.remove"
                @confirm="ledger.save(item.id)"
              />
              <BatchResults
                v-else-if="item.kind === 'receipt'"
                :result="item.result"
                :display="item.display"
                :busy="ledgerBusy || !!editing || ledgerState.preparePending"
                :can-retry="item.result.batchId === ledgerState.batch?.batchId && ledger.canRetry.value"
                :can-edit="item.result.batchId === ledgerState.batch?.batchId && ledger.canRetry.value"
                @edit="editId = $event"
                @remove="ledger.remove"
                @query="ledger.query(item.result.batchId)"
                @retry="ledger.retrySave(item.result.batchId)"
                @open="openDetails('ledger', $event)"
              />
            </view>
            <view
              v-if="ledgerState.error || ledgerState.failedMessage"
              class="life-chat__notice life-chat__notice--error"
            >
              <text>{{ ledgerState.error || '这笔账暂时没能整理。' }}</text>
              <wd-button
                v-if="ledgerState.failedMessage"
                size="small"
                plain
                :disabled="ledgerBusy"
                @click="ledger.send(ledgerState.failedMessage)"
              >
                重试整理
              </wd-button>
              <wd-button
                v-if="ledgerState.preparePending"
                size="small"
                plain
                :disabled="ledgerBusy"
                @click="ledger.retrySave()"
              >
                核对原确认
              </wd-button>
            </view>
            <wd-button
              v-if="ledgerState.phase === 'understanding'"
              size="small"
              variant="text"
              @click="ledger.cancelUnderstanding()"
            >
              取消整理
            </wd-button>
            <wd-button
              v-if="ledgerState.phase === 'saving' && !ledgerState.stopped"
              size="small"
              variant="text"
              @click="ledger.stop()"
            >
              停止后续保存
            </wd-button>
            <wd-button
              v-if="!ledgerBusy && !ledgerState.preparePending"
              size="small"
              variant="text"
              @click="finishDraft"
            >
              结束记账并返回聊天
            </wd-button>
          </template>
          <view v-if="consenting" class="life-chat__notice">
            <text class="life-chat__notice-title">发送前了解数据用途</text>
            <text>这句话和完成本次操作所需的资料会交给模型处理。未确认的内容退出后清空。</text>
            <wd-button block round data-testid="life-chat-consent" @click="chat.send(true)">
              同意并发送
            </wd-button>
            <wd-button size="small" variant="text" @click="consenting = false">暂不发送</wd-button>
          </view>
          <view v-if="activity" class="life-chat__message" role="status">
            <view class="life-chat__progress" data-testid="life-chat-progress">
              <wd-loading color="#267A5A" size="32rpx" />
              <text>{{ activity }}</text>
            </view>
          </view>
          <wd-button
            v-if="status === '正在处理这条消息…'"
            size="small"
            variant="text"
            @click="chat.cancelWait"
          >
            取消处理
          </wd-button>
          <view v-if="error" class="life-chat__notice life-chat__notice--error" role="alert">
            <text>{{ error }}</text>
          </view>
          <wd-button
            v-if="pendingOperation && !busy"
            size="small"
            plain
            data-testid="life-chat-recover"
            @click="recover()"
          >
            查回保存结果
          </wd-button>
          <wd-button v-if="pendingOperation && !busy" size="small" variant="text" @click="recover(true)">
            停止未完成的保存
          </wd-button>
          <wd-button
            v-if="remainingActions && !busy && !activeCard && !pendingOperation && !ledger && !consenting"
            size="small"
            plain
            data-testid="life-chat-resume"
            @click="chat.resumeActions"
          >
            继续处理剩余 {{ remainingActions.count }} 项
          </wd-button>
          <view id="life-chat-end-a" class="life-chat__anchor" />
          <view id="life-chat-end-b" class="life-chat__anchor" />
        </view>
      </scroll-view>
      <view class="life-chat__footer" :class="{ 'life-chat__footer--keyboard': keyboard }">
        <view v-if="hasNew" class="life-chat__jump">
          <wd-button size="small" plain round @click="jumpLatest">查看新消息</wd-button>
        </view>
        <DraftComposer
          :text="ledgerState?.text ?? text"
          placeholder="说一句…"
          :disabled="composerDisabled"
          @text="setText"
          @send="send"
          @keyboard="updateKeyboard"
        />
      </view>
      <DraftEntryEditor
        v-if="editing && ledgerState?.view"
        :key="editing.id"
        :entry="editing"
        :categories="ledgerState.view.categories"
        :members="ledgerState.view.members"
        :busy="ledgerBusy"
        :error="ledgerState.error"
        @close="editId = ''"
        @save="saveEdit"
      />
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, shallowRef, watch } from 'vue'
import { onLoad, onReady, onUnload } from '@dcloudio/uni-app'
import { useHouseholdStore } from '../../../store/modules/household'
import { createLifeChatClient, type LifeChatResult } from '../../../services/life-chat-cloud'
import { createDraftCloud } from '../../../services/ledger-draft-cloud'
import type { DraftEntry } from '../../../types/ledger-draft'
import { lifeChatEnabled, lifeChatPreview, type LifeChatScope } from '../../../utils/life-chat-entry'
// #ifdef H5
import { lifeChatPresented } from '../../../utils/life-chat-entry'
// #endif
import { chooseFootprintLocation } from '../../../utils/footprint-location'
import { useLedgerDraft } from '../ledger-smart-add/use-ledger-draft'
import DraftComposer from '../ledger-smart-add/components/DraftComposer.vue'
import DraftEntryEditor from '../ledger-smart-add/components/DraftEntryEditor.vue'
import DraftEntryList from '../ledger-smart-add/components/DraftEntryList.vue'
import BatchResults from '../ledger-smart-add/components/BatchResults.vue'
import { resultNotice, useLifeChat } from './use-life-chat'
import LifeChatCard from './components/LifeChatCard.vue'

// 使用进入页面时的家庭状态，观察切换并撤回原对话。
const household = useHouseholdStore()
const homeId = household.household?.id ?? ''
const scope = shallowRef<LifeChatScope>('all')
const enabled = lifeChatEnabled && Boolean(homeId)
const client = createLifeChatClient(homeId, undefined, lifeChatPreview)
const chat = useLifeChat(client, () => scope.value)
const {
  booting,
  ready,
  text,
  consenting,
  status,
  busy,
  error,
  messages,
  activeCard,
  pendingOperation,
  remainingActions,
} = chat
const recoveredWhileClosed = computed(() => messages.value.at(-1)?.result)
const ledger = shallowRef<ReturnType<typeof useLedgerDraft> | null>(null)
const ledgerState = computed(() => ledger.value?.state)
const ledgerBusy = computed(() => ledger.value?.busy.value ?? false)
const editId = shallowRef('')
const keyboard = shallowRef(0)
const anchor = shallowRef('')
const hasNew = shallowRef(false)
const instance = getCurrentInstance()
let scrollHeight = 0
let nearBottom = true
let disposed = false
let paging = false
const selectingPlace = shallowRef(false)

const introductions: Record<LifeChatScope, string> = {
  all: '想查账，还是记点什么？',
  ledger: '可以查账、记账，也可以修改自己记的账。',
  task: '把想记的事告诉我。也可以修改或删除已有事项。',
  footprint: '最近去了哪里？也可以修改或删除已有足迹。',
}
const sampleText: Record<LifeChatScope, string[]> = {
  all: ['本月餐饮花了多少', '记一下周五交电费', '记一下昨天去了西湖'],
  ledger: ['本月餐饮花了多少', '昨天我午饭花了 50 元'],
  task: ['记一下周五交电费'],
  footprint: ['记一下昨天去了西湖'],
}
const introduction = computed(() => introductions[scope.value])
const examples = computed(() => sampleText[scope.value])
const editing = computed(
  () =>
    ledgerState.value?.view?.draft.entries.find(
      (entry) =>
        entry.id === editId.value &&
        !ledger.value?.successful.value.has(entry.id) &&
        !ledger.value?.hasUnknown.value,
    ) ?? null,
)
const composerDisabled = computed(
  () =>
    selectingPlace.value ||
    (ledger.value ? !ledger.value.canCompose.value || !!editing.value : !chat.canSend.value),
)
const activity = computed(
  () =>
    status.value ||
    (ledgerBusy.value
      ? (
          {
            loading: '正在加载记账…',
            understanding: '正在整理账目…',
            editing: '正在更新清单…',
            saving: '正在保存账目…',
            querying: '正在核对保存结果…',
          } as Record<string, string>
        )[ledgerState.value?.phase || '']
      : ''),
)

// 同一输入栏在原记账草稿有效期间继续补问原清单。
function setText(value: string) {
  if (ledger.value) ledger.value.setText(value)
  else text.value = value.slice(0, 2000)
}
async function send() {
  jumpLatest()
  if (ledger.value) await ledger.value.send()
  else await chat.send()
}

// 统一入口的数据用途同意后，原记账仍使用已有草稿、确认和批次保存。
watch(chat.draftInput, async (input) => {
  if (!input || disposed) return
  try {
    const flow = useLedgerDraft(createDraftCloud(homeId, undefined, lifeChatPreview))
    ledger.value?.dispose()
    ledger.value = flow
    await flow.initialize()
    if (disposed || ledger.value !== flow) return
    flow.setText(input)
    await flow.send()
    if (flow.state.consentText) await flow.acceptConsent()
  } catch {
    error.value = '一句话记账暂时不可用，可以回到原页面手动记账。'
  }
})
function finishDraft() {
  ledger.value?.dispose()
  ledger.value = null
  editId.value = ''
  chat.draftInput.value = ''
}
async function saveEdit(value: DraftEntry) {
  await ledger.value?.edit(value)
  if (!ledgerState.value?.error) editId.value = ''
}

// 普通详情临时覆盖聊天，原页继续持有会话，不把引用传给其他家庭。
function openDetails(domain: LifeChatResult['domain'], id?: string) {
  if (!domain || !id || disposed) return
  const destinations = {
    ledger: 'ledger/ledger-detail/index?entryId=',
    task: 'task/task-detail/index?taskId=',
    footprint: 'footprint/footprint-detail/index?entryId=',
  }
  uni.navigateTo({ url: `/subpackages/${destinations[domain]}${encodeURIComponent(id)}` })
}
function openStats() {
  uni.navigateTo({ url: '/subpackages/ledger/ledger-stats/index' })
}
async function openSource(item: LifeChatResult, ref: string) {
  const result = await chat.read('source', { ref, referenceVersion: item.referenceVersion })
  if (disposed) return
  if (result.kind === 'source') openDetails('ledger', result.entryId)
  else error.value = resultNotice(result)
}
async function loadMore(id: number, item: LifeChatResult) {
  if (paging) return
  paging = true
  const result = await chat.read('sources', {
    offset: item.nextOffset ?? 5,
    referenceVersion: item.referenceVersion,
  })
  paging = false
  if (disposed) return
  if (result.kind === 'sources') {
    messages.value = messages.value.map((message) =>
      message.id === id
        ? {
            ...message,
            result: {
              ...item,
              candidates: [...(item.candidates || []), ...(result.candidates || [])],
              hasMore: result.hasMore,
              nextOffset: result.nextOffset,
            },
          }
        : message,
    )
  } else error.value = resultNotice(result)
}

// 用户主动选点，没有定位权限或选择取消时继续留在原聊天。
async function pickPlace(item: LifeChatResult) {
  if (selectingPlace.value || busy.value) return
  selectingPlace.value = true
  try {
    const result = await chooseFootprintLocation()
    if (disposed || item.credential !== activeCard.value) return
    if (result.ok) await chat.card('pick_place', item, { place: result.place })
    else if (result.message) error.value = result.message
  } catch {
    if (!disposed) error.value = '暂时无法选择地点，请稍后再试。'
  } finally {
    selectingPlace.value = false
  }
}

// 本机只记确切的已确认操作编号，返回后可查回，聊天正文不会写入本机。
const receiptKey = `mulu-life-receipt:${homeId}`
async function confirm(item: LifeChatResult) {
  if (!item.operationId || !item.credential || item.credential !== activeCard.value || busy.value) return
  try {
    uni.setStorageSync(receiptKey, item.operationId)
  } catch {
    /* 存储失败时仍可在本次聊天查询。 */
  }
  const result = await chat.card('confirm', item)
  if (result && !['unknown', 'unavailable'].includes(result.kind)) uni.removeStorageSync(receiptKey)
}
async function recover(stop = false) {
  await chat.recover(stop)
  if (!pendingOperation.value) uni.removeStorageSync(receiptKey)
}

// 只在接近末尾时跟随新结果，翻看旧消息时提供手动定位。
function measure() {
  if (!instance || disposed) return
  uni
    .createSelectorQuery()
    .in(instance)
    .select('.life-chat__scroll')
    .boundingClientRect((result) => {
      if (result && !Array.isArray(result)) scrollHeight = result.height ?? 0
    })
    .exec()
}
function trackScroll(event: { detail: { scrollTop: number; scrollHeight: number } }) {
  if (!scrollHeight) return
  nearBottom = event.detail.scrollHeight - event.detail.scrollTop - scrollHeight < 56
  if (nearBottom) hasNew.value = false
}
function jumpLatest() {
  nearBottom = true
  hasNew.value = false
  anchor.value = anchor.value === 'life-chat-end-a' ? 'life-chat-end-b' : 'life-chat-end-a'
}
async function updateKeyboard(value: number) {
  keyboard.value = value
  await nextTick()
  measure()
  if (nearBottom) jumpLatest()
}
watch([messages, activity, consenting, () => ledgerState.value?.messages.length], async () => {
  await nextTick()
  if (disposed) return
  if (nearBottom) jumpLatest()
  else hasNew.value = true
})
onReady(measure)
onLoad(async (query) => {
  // #ifdef H5
  lifeChatPresented.value = true
  // #endif
  if (query?.scope === 'ledger' || query?.scope === 'task' || query?.scope === 'footprint')
    scope.value = query.scope
  if (query?.example === 'ledger-create' && scope.value === 'ledger') text.value = '昨天我午饭花了 50 元'
  uni.setNavigationBarTitle({
    title: { all: '睦录助手', ledger: '账本助手', task: '事项助手', footprint: '足迹助手' }[scope.value],
  })
  if (homeId) {
    const known = uni.getStorageSync(receiptKey)
    if (typeof known === 'string' && /^[a-f0-9-]{36}$/i.test(known)) pendingOperation.value = known
  }
  if (enabled) await chat.initialize()
  else {
    booting.value = false
    error.value = resultNotice({ kind: 'disabled' })
  }
  await nextTick()
  measure()
})
function back() {
  uni.navigateBack()
}
function dispose() {
  disposed = true
  chat.dispose()
  ledger.value?.dispose()
  ledger.value = null
}
onUnload(() => {
  // #ifdef H5
  lifeChatPresented.value = false
  // #endif
  dispose()
})
watch(
  () => household.household?.id,
  (current) => {
    if (current !== homeId) {
      dispose()
      error.value = '家庭已切换，请重新打开聊天。'
    }
  },
)
</script>

<style lang="scss" scoped>
.life-chat {
  // 与原记账页使用相同的导航、纸白底色和气泡比例，底栏只避让一次键盘。
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--window-top, 0px) - var(--window-bottom, 0px) - var(--life-keyboard, 0px));
  overflow: hidden;
  box-sizing: border-box;
  background: $brand-color-background;
  color: $brand-color-text;
  font-size: 28rpx;
  &__initial {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 20rpx;
    padding: 36rpx;
    text-align: center;
  }
  &__scroll {
    flex: 1;
    min-height: 0;
    height: 0;
  }
  &__timeline {
    padding: 32rpx 28rpx 20rpx;
  }
  &__message {
    display: flex;
    flex-direction: column;
    align-items: stretch;
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
  &__logo {
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
    align-self: flex-start;
    max-width: 84%;
    padding: 18rpx 22rpx;
    line-height: 1.55;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  &__bubble--mine {
    align-self: flex-end;
    background: #e2f1e8;
    border-color: transparent;
  }
  // 示例保留原气泡里的次要文字层级，点击仍只填入，不触发发送。
  &__examples {
    display: flex;
    flex-direction: column;
    margin-top: 14rpx;
    padding-top: 14rpx;
    border-top: 1rpx solid $brand-color-border;
  }
  &__example-label {
    color: #536b60;
    font-size: 24rpx;
  }
  :deep(.life-chat__example-button) {
    display: block;
    height: auto;
    min-height: 72rpx;
    padding: 12rpx 0;
    font-size: 24rpx;
    font-weight: 400;
    line-height: 1.55;
    white-space: normal;
    text-align: left;
    border-radius: 8rpx;
    &:focus-visible {
      outline: 2rpx solid $brand-color-action;
      outline-offset: 4rpx;
    }
  }
  &__example-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
  }
  &__progress {
    display: flex;
    align-items: center;
    gap: 14rpx;
    align-self: flex-start;
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
