/** 文件用途：在本页内存管理聊天、草稿与正式回执，并拦截旧卡和迟到响应。 */
import { computed, reactive, readonly } from 'vue'
import type { DraftCloud } from '../../../services/ledger-draft-cloud'
import { DraftCloudError } from '../../../services/ledger-draft-cloud'
import type { BatchResult, DraftChoice, DraftEntry, DraftView } from '../../../types/ledger-draft'

/** 请求编号只作关联，正式身份和写入资格由云端核对。 */
export function draftRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16)
    return (char === 'x' ? value : (value & 3) | 8).toString(16)
  })
}

/** 页面操作互斥，消息和回执独立于当前操作显示。 */
type Phase = 'loading' | 'input' | 'understanding' | 'review' | 'editing' | 'saving' | 'querying' | 'result'

/** 仅保存可读快照，消息里的旧卡不持有可保存的草稿证明。 */
export interface DraftDisplay {
  entries: readonly DraftEntry[]
  categories: readonly DraftChoice[]
  members: readonly DraftChoice[]
}

/** 聊天里的历史卡和回执只用于显示，动作始终交回当前流程。 */
export type BookkeepingMessage =
  | { id: string; kind: 'user' | 'assistant'; text: string }
  | { id: string; kind: 'draft'; display: DraftDisplay }
  | { id: string; kind: 'receipt'; result: BatchResult; display: DraftDisplay | null }

/** 金额按收入和支出分别核对。 */
export function draftTotals(entries: readonly DraftEntry[]) {
  const totals = { income: 0, expense: 0 }
  for (const entry of entries) {
    if (entry.type) totals[entry.type] += entry.amountCents ?? 0
  }
  return totals
}

/** 将草稿与可执行证明分开，保留当时展示的明细。 */
function displayOf(view: DraftView): DraftDisplay {
  return { entries: view.draft.entries, categories: view.categories, members: view.members }
}

/** 只展示已固定的安全错误。 */
function errorText(error: unknown): string {
  return error instanceof DraftCloudError ? error.message : '本次处理未完成，请稍后手动再试。'
}

/** 只拦截完整的确认短句，带金额等补充的句子仍交给整理。 */
const confirmationReply = /^(确认(?:记账|保存)?|保存(?:吧|这\d+笔)?|记吧|记账吧|好的|好|可以)[。！!\s]*$/u

/** 一个页面只处理一份活动草稿；旧回执的查回只读。 */
export function useLedgerDraft(client: DraftCloud) {
  const state = reactive({
    stopped: false,
    text: '',
    consent: false,
    consentText: '',
    available: false,
    phase: 'loading' as Phase,
    view: null as DraftView | null,
    batch: null as BatchResult | null,
    history: [] as BatchResult[],
    historyError: '',
    messages: [] as BookkeepingMessage[],
    activeCard: '',
    failedMessage: '',
    preparePending: false,
    error: '',
  })
  /** 版本隔离当前操作，卸载后的查询和整理均不得写回。 */
  let generation = 0
  let closed = false
  let active: { draftId: string; requestId: string } | null = null
  /** 同一确认的准备回包丢失时，沿用原编号，不生成第二批。 */
  let confirmationId = draftRequestId()
  let stopRequested = false

  const busy = computed(() =>
    ['loading', 'understanding', 'editing', 'saving', 'querying'].includes(state.phase),
  )
  const successful = computed(
    () => new Set(state.batch?.items.filter((item) => item.status === 'success').map((item) => item.itemId)),
  )
  const hasUnknown = computed(() => state.batch?.items.some((item) => item.status === 'unknown') ?? false)
  const totals = computed(() => draftTotals(state.view?.draft.entries ?? []))
  const complete = computed(() =>
    Boolean(state.batch?.items.length && state.batch.items.every((item) => item.status === 'success')),
  )
  const canCompose = computed(
    () => state.available && !busy.value && !state.preparePending && (!state.batch || complete.value),
  )
  const canRetry = computed(() =>
    Boolean(
      state.batch &&
      state.view?.status === 'DRAFT_READY' &&
      !state.stopped &&
      !hasUnknown.value &&
      state.view.draft.entries.some((item) => !successful.value.has(item.id)),
    ),
  )
  const canConfirm = computed(() =>
    Boolean(
      state.activeCard &&
      state.view?.status === 'DRAFT_READY' &&
      state.view.draft.entries.length &&
      !state.failedMessage &&
      !state.preparePending &&
      !state.stopped &&
      !state.batch &&
      !busy.value,
    ),
  )

  /** 过期的草稿不能继续补问或确认，用户下一次发送从新草稿开始。 */
  function clearExpired(error: unknown): void {
    if (error instanceof DraftCloudError && error.code === 'LEDGER_DRAFT_EXPIRED') {
      state.activeCard = ''
      state.view = null
    }
  }

  function current(version: number): boolean {
    return !closed && version === generation
  }

  /** 仅在实际整理或编辑成功后添加新卡。 */
  function showView(view: DraftView): void {
    state.view = view
    confirmationId = draftRequestId()
    state.activeCard = ''
    state.phase = view.status === 'DRAFT_READY' ? 'review' : 'input'
    if (state.batch) {
      state.phase = 'result'
      showReceipt(state.batch, displayOf(view))
    } else if (view.status === 'DRAFT_READY' && view.draft.entries.length) {
      state.activeCard = confirmationId
      state.messages.push({ id: confirmationId, kind: 'draft', display: displayOf(view) })
    } else {
      say(view.question || '清单已空，可以继续告诉我要记的账。')
    }
  }

  function say(text: string): void {
    state.messages.push({ id: draftRequestId(), kind: 'assistant', text })
  }

  /** 同一批次始终更新原回执。查历史时不替换当前草稿的批次。 */
  function showReceipt(result: BatchResult, display: DraftDisplay | null): void {
    const id = `receipt-${result.batchId}`
    const index = state.messages.findIndex((item) => item.id === id)
    const receipt: BookkeepingMessage = { id, kind: 'receipt', result, display }
    if (index < 0) state.messages.push(receipt)
    else state.messages[index] = receipt
    const historyIndex = state.history.findIndex((item) => item.batchId === result.batchId)
    if (historyIndex >= 0) state.history[historyIndex] = result
  }

  /** 回执列表在后台读，慢或失败都不影响已经确认可用的输入。 */
  async function initialize(): Promise<void> {
    const version = ++generation
    const history = client.list().then(
      (batches) => {
        if (closed) return
        state.history = batches
      },
      () => {
        if (closed) return
        state.historyError = '暂时无法读取原保存结果。'
      },
    )
    try {
      const available = await client.available()
      if (!current(version)) return
      state.available = available
      if (!available) state.error = '一句话记账尚未连接，可返回手动记账。'
    } catch (error) {
      if (current(version)) state.error = errorText(error)
    } finally {
      if (current(version)) state.phase = 'input'
    }
    await history
  }

  /** 修改输入会撤回此前对应另一段原话的同意卡。 */
  function setText(text: string): void {
    if (closed || !canCompose.value) return
    if (state.consentText && state.consentText !== text) state.consentText = ''
    state.text = text
  }

  function declineConsent(): void {
    state.consentText = ''
  }

  /** 只有说明卡上的同意动作能第一次发送原话。 */
  async function acceptConsent(): Promise<void> {
    if (!canCompose.value || !state.consentText || state.consentText !== state.text) return
    state.consent = true
    state.consentText = ''
    await send()
  }

  /** 发出或重试一条气泡。用已验证的当前草稿续接，聊天记录本身不发送。 */
  async function send(retryId?: string): Promise<void> {
    if (closed || !canCompose.value) return
    const failed =
      retryId && retryId === state.failedMessage
        ? state.messages.find((item) => item.id === retryId && item.kind === 'user')
        : undefined
    if (retryId && (!failed || failed.kind !== 'user' || state.text.trim())) return
    const text = failed?.kind === 'user' ? failed.text : state.text
    if (!text.trim()) return
    if ([...text].length > 4000) {
      state.error = '单次描述不能超过4000字，请分开描述。'
      return
    }
    if (!state.consent) {
      state.consentText = text
      return
    }
    if (confirmationReply.test(text.trim())) {
      state.messages.push({ id: draftRequestId(), kind: 'user', text })
      state.text = ''
      say(canConfirm.value ? '核对后，请点账单里的「确认记账」。' : '请告诉我要记的收支，或先处理当前账单。')
      return
    }
    if (complete.value || state.stopped) resetBatch()
    const version = ++generation
    const request = { draftId: state.view?.draft.id || draftRequestId(), requestId: draftRequestId() }
    const messageId = retryId || draftRequestId()
    active = request
    if (!retryId) state.messages.push({ id: messageId, kind: 'user', text })
    state.text = ''
    state.failedMessage = ''
    state.activeCard = ''
    state.error = ''
    state.phase = 'understanding'
    try {
      const view = await client.understand({
        ...request,
        text,
        consent: true,
        sealed: state.view?.sealed || null,
      })
      if (current(version)) showView(view)
    } catch (error) {
      if (!current(version)) return
      state.error = errorText(error)
      clearExpired(error)
      state.failedMessage = messageId
      state.phase = state.view?.status === 'DRAFT_READY' ? 'review' : 'input'
      // 外层超时不等于请求终止，撤回该请求，迟到结果仍不可见。
      void client.cancel(request.draftId, request.requestId).catch(() => {})
    } finally {
      if (active?.requestId === request.requestId) active = null
    }
  }

  /** 失败的纠正须明确放弃，再给保留的草稿发一张可确认的新卡。 */
  function discardFailed(): void {
    if (closed || busy.value || !state.failedMessage) return
    state.failedMessage = ''
    state.error = ''
    say('已放弃这次整理。')
    if (state.view?.status === 'DRAFT_READY') showView(state.view)
  }

  /** 人工编辑复用云端核对，旧卡只有在操作成功后才被替换。 */
  async function changeEntries(entries: DraftEntry[]): Promise<void> {
    if (
      closed ||
      busy.value ||
      !state.view ||
      hasUnknown.value ||
      state.preparePending ||
      state.failedMessage ||
      state.stopped
    )
      return
    const version = ++generation
    const previous = state.phase
    state.phase = 'editing'
    state.error = ''
    try {
      const view = await client.edit(
        state.view.sealed,
        entries,
        state.batch ? { batchId: state.batch.batchId, version: state.batch.version } : undefined,
      )
      if (current(version)) showView(view)
    } catch (error) {
      if (current(version)) {
        state.error = errorText(error)
        clearExpired(error)
        state.phase = state.view || state.batch ? previous : 'input'
      }
    }
  }

  /** 移除或修改只可作用于仍在本页的未保存项。 */
  async function remove(id: string): Promise<void> {
    if (!state.view?.draft.entries.some((item) => item.id === id) || successful.value.has(id)) return
    await changeEntries(state.view.draft.entries.filter((item) => item.id !== id))
  }

  async function edit(entry: DraftEntry): Promise<void> {
    if (!state.view?.draft.entries.some((item) => item.id === entry.id) || successful.value.has(entry.id))
      return
    await changeEntries(state.view.draft.entries.map((item) => (item.id === entry.id ? entry : item)))
  }

  /** 先查原批，再由真实回执决定是否允许补存。 */
  async function query(batchId = state.batch?.batchId): Promise<void> {
    if (closed || busy.value || !batchId || state.preparePending) return
    const version = ++generation
    const previous = state.phase
    const isCurrent = batchId === state.batch?.batchId
    state.phase = 'querying'
    state.error = ''
    try {
      const result = await client.query(batchId)
      if (!current(version)) return
      if (isCurrent) state.batch = result
      const previousReceipt = state.messages.find((item) => item.id === `receipt-${batchId}`)
      showReceipt(
        result,
        isCurrent && state.view
          ? displayOf(state.view)
          : previousReceipt?.kind === 'receipt'
            ? previousReceipt.display
            : null,
      )
    } catch (error) {
      if (current(version)) state.error = errorText(error)
    } finally {
      if (current(version)) state.phase = previous
    }
  }

  /** 只有当前卡的编号能确认，准备中断和同批补存使用各自明确入口。 */
  async function save(cardId: string): Promise<void> {
    if (!canConfirm.value || cardId !== confirmationId) return
    await saveConfirmed()
  }

  /** 对已确认却没拿到准备结果的同一批查回，或明确补存当前未成功项。 */
  async function retrySave(batchId?: string): Promise<void> {
    if (state.preparePending ? batchId !== undefined : !canRetry.value || batchId !== state.batch?.batchId)
      return
    await saveConfirmed()
  }

  async function saveConfirmed(): Promise<void> {
    if (closed || busy.value || !state.view || state.stopped || hasUnknown.value) return
    const version = ++generation
    const sealed = state.view.sealed
    const display = displayOf(state.view)
    const prepareInput = {
      sealed,
      confirmationId,
      ...(state.batch ? { batchId: state.batch.batchId, version: state.batch.version } : {}),
    }
    state.error = ''
    state.phase = 'saving'
    let prepared: BatchResult | null = null
    try {
      prepared = await client.prepare(prepareInput)
      if (current(version)) {
        state.preparePending = false
        state.batch = prepared
        state.activeCard = ''
      }
      if (stopRequested) {
        // 等到准备回包才有批次引用。主动停止后绝不开始新的写入。
        const result = await client.stop(prepared.batchId)
        if (current(version)) {
          state.batch = result
          showReceipt(result, null)
        }
        return
      }
      const result = await client.save({
        sealed,
        batchId: prepared.batchId,
        version: prepared.version,
        attemptRevision: prepared.attemptRevision,
        attemptId: draftRequestId(),
      })
      if (current(version)) {
        state.batch = result
        showReceipt(result, state.stopped ? null : display)
      }
    } catch (error) {
      if (!current(version)) return
      state.error = errorText(error)
      clearExpired(error)
      const original =
        prepared ||
        (error instanceof DraftCloudError && error.code === 'LEDGER_BATCH_CHECK_FIRST' ? state.batch : null)
      if (original) {
        const uncertain: BatchResult = {
          ...original,
          items: original.items.map((item) =>
            item.status === 'success'
              ? item
              : { ...item, status: 'unknown', code: 'LEDGER_BATCH_CHECK_FIRST' },
          ),
        }
        state.batch = uncertain
        showReceipt(uncertain, state.stopped ? null : display)
      } else {
        // 明确的业务拒绝可退回原清单，通信失败仍绑定原确认编号。
        state.preparePending =
          !state.stopped &&
          (!(error instanceof DraftCloudError) ||
            ['TIMEOUT', 'FAILED', 'INVALID_RESPONSE'].includes(error.code))
        if (!state.preparePending && !state.stopped && !state.batch && state.view) showView(state.view)
      }
    } finally {
      if (current(version)) state.phase = state.batch ? 'result' : state.view ? 'review' : 'input'
    }
  }

  /** 主动停止和普通退出不同。停止时清除全部临时正文，只显示原回执。 */
  async function stop(): Promise<void> {
    if (closed || stopRequested || state.phase !== 'saving') return
    stopRequested = true
    state.stopped = true
    clearConversation()
    const id = state.batch?.batchId
    if (!id) return
    const version = generation
    try {
      const result = await client.stop(id)
      if (current(version)) {
        state.batch = result
        showReceipt(result, null)
      }
    } catch (error) {
      if (current(version)) state.error = errorText(error)
    }
  }

  /** 清除用户文字和派生清单，仅留下不含正文的正式回执。 */
  function clearConversation(): void {
    state.text = ''
    state.consentText = ''
    state.failedMessage = ''
    state.activeCard = ''
    state.view = null
    state.messages = state.messages.flatMap((item) =>
      item.kind === 'receipt' ? [{ ...item, display: null }] : [],
    )
  }

  async function cancelUnderstanding(): Promise<void> {
    if (!active || closed || state.phase !== 'understanding') return
    const request = active
    const version = ++generation
    active = null
    clearConversation()
    state.error = ''
    state.phase = 'input'
    try {
      await client.cancel(request.draftId, request.requestId)
    } catch {
      if (current(version)) state.error = '取消消息未送达，原处理会在原时限内结束。'
    }
  }

  /** 新一批使用新草稿和新确认号，前一批结果仍能查回。 */
  function resetBatch(): void {
    state.view = null
    state.batch = null
    state.activeCard = ''
    state.preparePending = false
    state.error = ''
    state.phase = 'input'
    confirmationId = draftRequestId()
    stopRequested = false
    state.stopped = false
  }

  function restart(): void {
    if (busy.value || closed || state.preparePending) return
    generation++
    clearConversation()
    resetBatch()
  }

  /** 卸载撤回显示资格。普通退出保留已经明确确认的在途保存。 */
  function dispose(): void {
    if (closed) return
    closed = true
    generation++
    const request = active
    active = null
    clearConversation()
    state.messages = []
    state.batch = null
    state.history = []
    state.historyError = ''
    state.available = false
    state.consent = false
    state.error = ''
    if (request) void client.cancel(request.draftId, request.requestId).catch(() => {})
  }

  return {
    state: readonly(state),
    busy,
    totals,
    successful,
    hasUnknown,
    canCompose,
    canConfirm,
    canRetry,
    complete,
    initialize,
    setText,
    acceptConsent,
    declineConsent,
    send,
    discardFailed,
    edit,
    remove,
    query,
    save,
    retrySave,
    stop,
    cancelUnderstanding,
    restart,
    dispose,
  }
}
