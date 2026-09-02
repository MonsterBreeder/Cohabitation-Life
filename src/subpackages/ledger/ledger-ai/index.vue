<template>
  <view class="ledger-ai-page">
    <wd-toast />

    <view v-if="loadingStatus" class="ledger-ai-page__state" data-testid="ledger-ai-loading">
      <wd-loading color="#267A5A" size="40rpx" />
      <text class="ledger-ai-page__state-title">正在加载账本问答。</text>
    </view>

    <view v-else-if="!householdId" class="ledger-ai-page__state">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="ledger-ai-page__state-title">需要先有家</text>
      <text class="ledger-ai-page__state-copy">问账本只会查询当前家庭的共同账目。</text>
    </view>

    <view v-else-if="!consentAccepted" class="ledger-ai-page__consent" data-testid="ledger-ai-consent">
      <wd-icon name="message" size="72rpx" color="#267A5A" />
      <text class="ledger-ai-page__consent-title">开始前，请了解数据用途</text>
      <text class="ledger-ai-page__consent-copy">为了回答问题，会把本次问题和已找到的最少量账目摘要发送给腾讯云模型；不包含家庭编号、成员内部编号和凭证图片。不同意也不影响记账、筛选和统计。</text>
      <view class="ledger-ai-page__consent-actions">
        <wd-button block plain @click="declineConsent">暂不使用</wd-button>
        <wd-button block @click="acceptConsent">同意并继续</wd-button>
      </view>
    </view>

    <view v-else class="ledger-ai-page__content">
      <view class="ledger-ai-page__intro">
        <view class="ledger-ai-page__intro-title-row">
          <text class="ledger-ai-page__intro-title">说出你记得的线索</text>
          <text class="ledger-ai-page__remaining">今天还可问 {{ remainingQuestions }} 次</text>
        </view>
        <text class="ledger-ai-page__intro-copy">金额、用途、时间只记得一部分也可以。我会给出最多 5 笔候选，不会替你强行选中一笔。</text>
        <view class="ledger-ai-page__examples">
          <view v-for="example in ledgerAiExamples" :key="example" class="ledger-ai-page__example" @click="fillExample(example)">
            <text>{{ example }}</text>
          </view>
        </view>
      </view>

      <view v-if="serviceMessage" class="ledger-ai-page__notice" data-testid="ledger-ai-service-message">
        <wd-icon name="warning" size="36rpx" color="#BA564B" />
        <text class="ledger-ai-page__notice-copy">{{ serviceMessage }}</text>
      </view>

      <scroll-view scroll-y class="ledger-ai-page__messages" :scroll-into-view="scrollTarget">
        <view v-for="message in messages" :id="message.id" :key="message.id" class="ledger-ai-page__message" :class="`ledger-ai-page__message--${message.role}`">
          <text class="ledger-ai-page__message-text">{{ message.text }}</text>
          <view v-if="message.answer?.kind === 'amount'" class="ledger-ai-page__amount-facts">
            <text class="ledger-ai-page__amount-total">{{ formatYuan(message.answer.totalCents, { sign: 'none' }) }}</text>
            <text class="ledger-ai-page__amount-scope">共统计 {{ message.answer.sourceCount }} 笔账目</text>
            <text v-if="message.answer.range" class="ledger-ai-page__amount-scope">{{ message.answer.range.start }} 至 {{ message.answer.range.end }}</text>
          </view>
          <template v-if="message.answer?.kind === 'candidates' || message.answer?.kind === 'amount' || message.answer?.kind === 'comparison'">
            <view class="ledger-ai-page__candidates">
              <LedgerAiCandidateCard v-for="(candidate, index) in message.answer.candidates" :key="candidate.sourceRef" :candidate="candidate" :index="index + 1" :active="message.id === latestCandidateMessageId" @press="openCandidate" />
            </view>
            <text v-if="message.answer.hasMore" class="ledger-ai-page__more-hint">还有其他相关账目，查看全部不会再消耗提问次数。</text>
            <wd-button
              v-if="message.answer.hasMore && message.id === latestCandidateMessageId"
              size="small"
              plain
              :loading="loadingMoreMessageId === message.id"
              data-testid="ledger-ai-view-all"
              @click="loadMoreSources(message)"
            >查看全部</wd-button>
          </template>
          <view v-if="message.answer?.kind === 'comparison'" class="ledger-ai-page__comparison">
            <view v-for="group in message.answer.groups" :key="group.label" class="ledger-ai-page__comparison-item">
              <text>{{ group.label }}</text><text>{{ formatYuan(group.totalCents, { sign: 'none' }) }}</text>
            </view>
          </view>
          <wd-button v-if="message.answer?.kind === 'stats_redirect'" size="small" plain @click="goStats">查看统计</wd-button>
        </view>
        <view v-if="submitting" id="ledger-ai-loading-message" class="ledger-ai-page__message ledger-ai-page__message--assistant">
          <wd-loading color="#267A5A" size="30rpx" />
          <text class="ledger-ai-page__message-text">正在核对账目…</text>
        </view>
      </scroll-view>

      <LedgerAiComposer v-if="serviceReady" v-model="question" :submitting="submitting" @submit="submitQuestion" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'
import { onLoad } from '@dcloudio/uni-app'
import LedgerAiCandidateCard from './components/LedgerAiCandidateCard.vue'
import LedgerAiComposer from './components/LedgerAiComposer.vue'
import { useHouseholdStore } from '../../../store/modules/household'
import { askLedgerAi, getLedgerAiStatus, LedgerAiCloudError, loadLedgerAiSources, resolveLedgerAiSource, setLedgerAiCloudContext } from '../../../services/ledger-ai-cloud'
import { formatYuan } from '../../../utils/format'
import type { LedgerAiAnswer } from '../../../types/ledger-ai'
import { describeLedgerAiError, LEDGER_AI_CONSENT_VERSION, LEDGER_AI_STATS_URL, ledgerAiExamples, validateLedgerAiQuestion } from './ledger-ai-view'

interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string; answer?: LedgerAiAnswer; sourceOffset?: number }
const householdStore = useHouseholdStore()
const { household } = storeToRefs(householdStore)
const householdId = computed(() => household.value?.id || '')
const consentAccepted = shallowRef(false)
const loadingStatus = shallowRef(true)
const serviceReady = shallowRef(false)
const serviceMessage = shallowRef('')
const remainingQuestions = shallowRef(10)
const submitting = shallowRef(false)
const loadingMoreMessageId = shallowRef('')
const question = ref('')
const messages = ref<ChatMessage[]>([])
// 旧回答只用于阅读，候选临时编号始终只指向最近一轮，防止旧 S1 打开新 S1。
const latestCandidateMessageId = computed(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    const answer = messages.value[index].answer
    if (answer?.kind === 'candidates' || answer?.kind === 'amount' || answer?.kind === 'comparison') return messages.value[index].id
  }
  return ''
})
const scrollTarget = shallowRef('')
const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
let retryRequestId = ''

function token(prefix: string): string { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 12)}` }
function fillExample(example: string): void { question.value = example }
function declineConsent(): void { uni.navigateBack() }
async function acceptConsent(): Promise<void> {
  uni.setStorageSync(LEDGER_AI_CONSENT_VERSION, true)
  consentAccepted.value = true
  await loadStatus()
}
async function loadStatus(): Promise<void> {
  if (!householdId.value) return
  setLedgerAiCloudContext(householdId.value)
  loadingStatus.value = true
  serviceMessage.value = ''
  try {
    const result = await getLedgerAiStatus()
    serviceReady.value = result.status === 'READY'
    if (typeof result.remainingQuestions === 'number') remainingQuestions.value = result.remainingQuestions
    if (!serviceReady.value) serviceMessage.value = describeLedgerAiError(result.status)
  } catch (error) {
    serviceReady.value = false
    serviceMessage.value = error instanceof LedgerAiCloudError && error.code === 'TIMEOUT' ? '问账本连接超时，原账本仍可正常使用。' : '问账本暂时不可用，原账本仍可正常使用。'
  } finally { loadingStatus.value = false }
}
async function scrollToLatest(): Promise<void> {
  await nextTick()
  scrollTarget.value = submitting.value ? 'ledger-ai-loading-message' : messages.value[messages.value.length - 1]?.id || ''
}
async function submitQuestion(): Promise<void> {
  if (submitting.value || !serviceReady.value) return
  const validation = validateLedgerAiQuestion(question.value)
  if (!validation.valid) { uni.showToast({ title: validation.message, icon: 'none' }); return }
  const submittedQuestion = validation.value
  const isRetry = Boolean(retryRequestId)
  const requestId = retryRequestId || token('request')
  retryRequestId = requestId
  // 网络失败重试沿用原请求号和已有用户气泡，避免重复显示、重复扣次。
  if (!isRetry) messages.value.push({ id: token('message-user'), role: 'user', text: submittedQuestion })
  question.value = ''
  submitting.value = true
  await scrollToLatest()
  try {
    const result = await askLedgerAi({ question: submittedQuestion, sessionId, requestId })
    if (result.status === 'ANSWERED') {
      messages.value.push({ id: token('message-ai'), role: 'assistant', text: result.answer.message, answer: result.answer, sourceOffset: 'candidates' in result.answer ? result.answer.candidates.length : 0 })
      remainingQuestions.value = result.remainingQuestions
      retryRequestId = ''
    } else {
      const text = describeLedgerAiError(result.status)
      messages.value.push({ id: token('message-error'), role: 'assistant', text })
      if (typeof result.remainingQuestions === 'number') remainingQuestions.value = result.remainingQuestions
      if (!result.retryable) retryRequestId = ''
      if (['DISABLED', 'DAILY_LIMIT_REACHED', 'PLATFORM_QUOTA_EXHAUSTED'].includes(result.status)) serviceReady.value = false
    }
  } catch (error) {
    question.value = submittedQuestion
    messages.value.push({ id: token('message-error'), role: 'assistant', text: error instanceof LedgerAiCloudError && error.code === 'TIMEOUT' ? '这次连接超时，问题已保留，可以再次发送。' : '这次没有发送成功，问题已保留，可以重试。' })
  } finally { submitting.value = false; await scrollToLatest() }
}
function goStats(): void { uni.navigateTo({ url: LEDGER_AI_STATS_URL }) }
async function loadMoreSources(message: ChatMessage): Promise<void> {
  const answer = message.answer
  if (!answer || (answer.kind !== 'candidates' && answer.kind !== 'amount' && answer.kind !== 'comparison') || loadingMoreMessageId.value) return
  loadingMoreMessageId.value = message.id
  try {
    const result = await loadLedgerAiSources({ sessionId, offset: message.sourceOffset || answer.candidates.length })
    if (result.status !== 'SOURCES_RESOLVED') {
      uni.showToast({ title: describeLedgerAiError(result.status), icon: 'none' })
      return
    }
    // 删除或变更的账目可能被云端跳过，以 nextOffset 推进而不用已展示数量猜下一页。
    answer.candidates.push(...result.candidates)
    answer.hasMore = result.hasMore
    message.sourceOffset = result.nextOffset
    await scrollToLatest()
  } catch {
    uni.showToast({ title: '暂时无法查看更多账目。', icon: 'none' })
  } finally { loadingMoreMessageId.value = '' }
}
async function openCandidate(sourceRef: string): Promise<void> {
  try {
    const result = await resolveLedgerAiSource({ sessionId, sourceRef })
    if (result.status === 'SOURCE_RESOLVED') {
      uni.navigateTo({ url: `/subpackages/ledger/ledger-detail/index?entryId=${encodeURIComponent(result.entryId)}` })
      return
    }
    uni.showToast({ title: describeLedgerAiError(result.status), icon: 'none' })
  } catch {
    uni.showToast({ title: '暂时无法打开这笔账。', icon: 'none' })
  }
}

onLoad(async () => {
  loadingStatus.value = true
  // 正常从账本首页进入时家庭已存在；直接打开分包页时主动补读，避免误显示“需要先有家”。
  if (!householdId.value) await householdStore.loadCurrent({ preserveExisting: true })
  consentAccepted.value = uni.getStorageSync(LEDGER_AI_CONSENT_VERSION) === true
  if (consentAccepted.value && householdId.value) await loadStatus()
  else loadingStatus.value = false
})
</script>

<style lang="scss" scoped>
.ledger-ai-page {
  min-height: 100vh;
  padding: 28rpx 28rpx 48rpx;
  box-sizing: border-box;
  background: $brand-color-background;
  &__state, &__consent { display: flex; min-height: 70vh; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  &__state-title, &__consent-title { margin-top: 24rpx; color: $brand-color-text; font-size: 32rpx; font-weight: 700; }
  &__state-copy, &__consent-copy { max-width: 590rpx; margin-top: 14rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.7; }
  &__consent-actions { display: flex; width: 100%; gap: 16rpx; margin-top: 36rpx; }
  &__content { display: flex; flex-direction: column; gap: 22rpx; }
  &__intro { display: flex; flex-direction: column; gap: 14rpx; padding: 24rpx; border-radius: $brand-radius-card; background: $brand-color-surface; }
  &__intro-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
  &__intro-title { color: $brand-color-text; font-size: 30rpx; font-weight: 700; }
  &__remaining { color: $brand-color-action; font-size: 22rpx; white-space: nowrap; }
  &__intro-copy { color: $brand-color-text-secondary; font-size: 24rpx; line-height: 1.6; }
  &__examples { display: flex; flex-wrap: wrap; gap: 10rpx; }
  &__example { padding: 12rpx 18rpx; border-radius: 999rpx; background: #effbf5; color: $brand-color-action; font-size: 23rpx; &:active { opacity: .65; } }
  &__notice { display: flex; align-items: center; gap: 12rpx; padding: 20rpx; border-radius: 18rpx; background: #fff1ee; }
  &__notice-copy { flex: 1; color: $brand-color-accent; font-size: 24rpx; line-height: 1.5; }
  &__messages { max-height: 58vh; }
  &__message { display: flex; max-width: 88%; flex-direction: column; gap: 14rpx; margin-bottom: 18rpx; padding: 20rpx 22rpx; border-radius: 22rpx; background: $brand-color-surface; }
  &__message--user { margin-left: auto; background: #e8f8f1; }
  &__message--assistant { margin-right: auto; }
  &__message-text { color: $brand-color-text; font-size: 26rpx; line-height: 1.6; }
  &__amount-facts { display: flex; flex-direction: column; gap: 6rpx; padding: 16rpx; border-radius: 16rpx; background: #effbf5; }
  &__amount-total { color: $brand-color-action; font-size: 34rpx; font-weight: 700; }
  &__amount-scope { color: $brand-color-text-secondary; font-size: 22rpx; line-height: 1.5; }
  &__candidates { display: flex; flex-direction: column; gap: 12rpx; }
  &__more-hint { color: $brand-color-text-secondary; font-size: 23rpx; line-height: 1.5; }
  &__comparison { display: flex; flex-direction: column; gap: 8rpx; }
  &__comparison-item { display: flex; justify-content: space-between; color: $brand-color-text; font-size: 25rpx; }
}
</style>
