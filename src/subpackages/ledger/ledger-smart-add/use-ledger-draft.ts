/** 文件用途：管理当前页的补问、编辑、确认和结果核对，退出使迟到响应失效并清空原话。 */
import { computed, reactive, readonly } from 'vue'
import type { DraftCloud } from '../../../services/ledger-draft-cloud'
import { DraftCloudError } from '../../../services/ledger-draft-cloud'
import type { BatchResult, DraftEntry, DraftView } from '../../../types/ledger-draft'

/** 仅产生不授予权限的请求引用，正式身份、签名和保存许可均由云端决定。 */
export function draftRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
    /[xy]/g,
    /**
     * 把请求引用占位符转成随机十六进制字符，不生成身份或保存许可。
     */
    (
      /**
       * 请求引用模板中的一个占位符，只生成不授予权限的随机编号。
       */
      char,
    ) => {
      /**
       * 当前待检查或转换的值，通过对应规则后才能使用。
       */
      const value = Math.floor(Math.random() * 16)
      return (char === 'x' ? value : (value & 3) | 8).toString(16)
    },
  )
}
/** 页面使用的有限状态，不写入全局存储或自动发送队列。 */
type Phase = 'loading' | 'input' | 'understanding' | 'review' | 'editing' | 'saving' | 'querying' | 'result'
/** 每个页面实例持有自己的资料与交付资格。 */
export function useLedgerDraft(
  /**
   * 本页专属云端客户端，不提供全局可恢复草稿。
   */
  client: DraftCloud,
) {
  /** 所有消费正文只存在本页，派生值通过计算取得。 */
  const state = reactive({
    // 明确停止后不会显示可继续保存的操作，另一次新输入才重置。
    stopped: false,
    text: '',
    consent: false,
    available: false,
    phase: 'loading' as Phase,
    view: null as DraftView | null,
    batch: null as BatchResult | null,
    history: [] as BatchResult[],
    error: '',
    lastInput: '',
  })
  /** 每次新操作撤回旧响应的显示资格。 */
  let generation = 0
  /** 页面卸载后禁止重新恢复内容。 */
  let closed = false
  /** 当前理解请求的非正文引用，供真实取消使用。 */
  let active: { draftId: string; requestId: string } | null = null
  /** 同次形成确认时重用编号，返回丢失不能另建批次。 */
  let confirmationId = draftRequestId()
  /** 用户明确停止与普通退出分别处理。 */
  let stopRequested = false
  /** 页面正在发生会改变当前内容的操作。 */
  const busy = computed(
    /**
     * 从本页只读状态计算显示或操作条件，不在计算中调用云端。
     */
    () => ['loading', 'understanding', 'editing', 'saving', 'querying'].includes(state.phase),
  )
  /** 已成功项在本页保持不可编辑。 */
  const successful = computed(
    /**
     * 从本页只读状态计算显示或操作条件，不在计算中调用云端。
     */
    () =>
      new Set(
        state.batch?.items
          .filter(
            /**
             * 按当前类型、范围或状态保留符合条件的项，返回独立列表。
             */
            (
              /**
               * 当前集合中的单项，使用所在集合的既有范围和检查规则。
               */
              item,
            ) => item.status === 'success',
          )
          .map(
            /**
             * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
             */
            (
              /**
               * 当前集合中的单项，使用所在集合的既有范围和检查规则。
               */
              item,
            ) => item.itemId,
          ) || [],
      ),
  )
  /** 未知结果必须先核对，不能直接改内容再保存。 */
  const hasUnknown = computed(
    /**
     * 从本页只读状态计算显示或操作条件，不在计算中调用云端。
     */
    () =>
      Boolean(
        state.batch?.items.some(
          /**
           * 核对集合中是否存在符合当前条件的项，返回布尔结果。
           */
          (
            /**
             * 当前集合中的单项，使用所在集合的既有范围和检查规则。
             */
            item,
          ) => item.status === 'unknown',
        ),
      ),
  )
  /** 收入支出分别合计，不能用净额掩盖混合收支。 */
  const totals = computed(
    /**
     * 从本页只读状态计算显示或操作条件，不在计算中调用云端。
     */
    () => ({
      expense:
        state.view?.draft.entries
          .filter(
            /**
             * 按当前类型、范围或状态保留符合条件的项，返回独立列表。
             */
            (
              /**
               * 当前集合中的单项，使用所在集合的既有范围和检查规则。
               */
              item,
            ) => item.type === 'expense',
          )
          .reduce(
            /**
             * 累计已检查的整数分，返回对应收入或支出的合计。
             */
            (
              /**
               * 当前已经累加的整数分，用于分别显示收入和支出合计。
               */
              sum,
              /**
               * 当前集合中的单项，使用所在集合的既有范围和检查规则。
               */
              item,
            ) => sum + (item.amountCents || 0),
            0,
          ) || 0,
      income:
        state.view?.draft.entries
          .filter(
            /**
             * 按当前类型、范围或状态保留符合条件的项，返回独立列表。
             */
            (
              /**
               * 当前集合中的单项，使用所在集合的既有范围和检查规则。
               */
              item,
            ) => item.type === 'income',
          )
          .reduce(
            /**
             * 累计已检查的整数分，返回对应收入或支出的合计。
             */
            (
              /**
               * 当前已经累加的整数分，用于分别显示收入和支出合计。
               */
              sum,
              /**
               * 当前集合中的单项，使用所在集合的既有范围和检查规则。
               */
              item,
            ) => sum + (item.amountCents || 0),
            0,
          ) || 0,
    }),
  )
  /** 只显示客户端固定错误，不显示后端原异常。 */
  function message(
    /**
     * 本次捕获的异常，只允许固定分类进入显示或控制记录。
     */
    error: unknown,
  ): string {
    return error instanceof DraftCloudError ? error.message : '本次处理未完成，请稍后手动再试。'
  }
  /** 核对本页版本与所属仍然有效。 */
  function current(
    /**
     * 本次接受时的版本，用于拒绝迟到响应和旧确认。
     */
    version: number,
  ): boolean {
    return !closed && version === generation
  }
  /** 当前页第一次显示时只核对可用性和无正文历史，不发送模型。 */
  async function initialize(): Promise<void> {
    /**
     * 本次接受时的版本，用于拒绝迟到响应和旧确认。
     */
    const version = ++generation

    /**
     * 本次并行或逐项检查的实际结果，每项分别核对。
     */
    const results = await Promise.allSettled([client.available(), client.list()])
    if (!current(version)) return
    state.available = results[0].status === 'fulfilled' && results[0].value
    if (results[1].status === 'fulfilled') state.history = results[1].value
    state.phase = 'input'
    if (!state.available) state.error = '一句话记账尚未连接，可返回手动记账。'
  }
  /** 输入只能在空闲时改变，避免显示值和发送内容不同。 */
  function setText(
    /**
     * 本次固定输入的完整原话，不因截断或补默认值而改变含义。
     */
    text: string,
  ): void {
    if (!busy.value && !closed) state.text = text
  }
  /** 同意只作用于本页本次发送，退出后不保存消费草稿。 */
  function setConsent(
    /**
     * 当前待检查或转换的值，通过对应规则后才能使用。
     */
    value: boolean,
  ): void {
    if (!busy.value && !closed) state.consent = value
  }
  /** 发送一次输入或补充，保留已有明确字段，不自动重试。 */
  async function send(): Promise<void> {
    if (closed || busy.value || state.batch) return
    if (!state.available || !state.consent || !state.text.trim()) {
      state.error = !state.consent ? '请先确认下方信息用途说明。' : '请先填写要记录的收支。'
      return
    }
    if ([...state.text].length > 4000) {
      state.error = '单次描述不能超过4000字，请分开描述。'
      return
    }

    /**
     * 本次接受时的版本，用于拒绝迟到响应和旧确认。
     */
    const version = ++generation

    /**
     * 本次固定请求内容或引用，网络处理期间不再读取可变页面值。
     */
    const request = { draftId: state.view?.draft.id || draftRequestId(), requestId: draftRequestId() }
    active = request

    /**
     * 本次固定输入的完整原话，不因截断或补默认值而改变含义。
     */
    const text = state.text
    state.error = ''
    state.phase = 'understanding'
    try {
      /**
       * 服务检查后的完整页面资料，不显示接收中的半份候选。
       */
      const view = await client.understand({
        ...request,
        text,
        consent: state.consent,
        sealed: state.view?.sealed || null,
      })
      if (!current(version)) return
      state.view = view
      state.lastInput = text
      state.text = ''
      state.phase = view.status === 'DRAFT_READY' ? 'review' : 'input'
      confirmationId = draftRequestId()
    } catch (
      /**
       * 本次捕获的异常，只允许固定分类进入显示或控制记录。
       */
      error
    ) {
      if (!current(version)) return
      state.error = message(error)
      state.phase = state.view?.status === 'DRAFT_READY' ? 'review' : 'input'
      // 外层超时并不等于实际模型取消，另行发送仅针对本人的取消动作。
      try {
        await client.cancel(request.draftId, request.requestId)
      } catch {
        /* 原请求仍受服务端原60秒期限约束，页面不接受迟到结果。 */
      }
    } finally {
      if (active?.requestId === request.requestId) active = null
    }
  }
  /** 编辑或移除只能针对当前未成功项，后台重新检查后再显示。 */
  async function changeEntries(
    /**
     * 当前完整待核对清单，必须保留每笔稳定编号并遵守十笔上限。
     */
    entries: DraftEntry[],
  ): Promise<void> {
    if (closed || busy.value || !state.view || hasUnknown.value) return

    /**
     * 本次接受时的版本，用于拒绝迟到响应和旧确认。
     */
    const version = ++generation

    /**
     * 本次操作前已经核对的状态或阶段，用于保持旧值和失败恢复。
     */
    const previous = state.phase
    state.phase = 'editing'
    state.error = ''
    try {
      /**
       * 服务检查后的完整页面资料，不显示接收中的半份候选。
       */
      const view = await client.edit(
        state.view.sealed,
        entries,
        state.batch ? { batchId: state.batch.batchId, version: state.batch.version } : undefined,
      )
      if (!current(version)) return
      state.view = view
      state.phase = view.status === 'DRAFT_READY' ? 'review' : 'input'
      confirmationId = draftRequestId()
    } catch (
      /**
       * 本次捕获的异常，只允许固定分类进入显示或控制记录。
       */
      error
    ) {
      if (current(version)) {
        state.error = message(error)
        state.phase = previous
      }
    }
  }
  /** 删除只影响当前未保存清单，已成功项不解锁。 */
  async function remove(
    /**
     * 当前记录的稳定编号，只在已经核对的范围内查回。
     */
    id: string,
  ): Promise<void> {
    if (successful.value.has(id) || !state.view) return
    await changeEntries(
      state.view.draft.entries.filter(
        /**
         * 按当前类型、范围或状态保留符合条件的项，返回独立列表。
         */
        (
          /**
           * 当前集合中的单项，使用所在集合的既有范围和检查规则。
           */
          item,
        ) => item.id !== id,
      ),
    )
  }
  /** 单项编辑仍保存完整最终清单，不让子组件直接写账本。 */
  async function edit(
    /**
     * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
     */
    entry: DraftEntry,
  ): Promise<void> {
    if (successful.value.has(entry.id) || !state.view) return
    await changeEntries(
      state.view.draft.entries.map(
        /**
         * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
         */
        (
          /**
           * 当前集合中的单项，使用所在集合的既有范围和检查规则。
           */
          item,
        ) => (item.id === entry.id ? entry : { ...item }),
      ),
    )
  }
  /** 先核对原事实，再允许处理明确未成功项。 */
  async function query(
    /**
     * 原保存批次的非正文引用，缺失时不能重建原批次。
     */
    batchId = state.batch?.batchId,
  ): Promise<void> {
    if (closed || busy.value || !batchId) return

    /**
     * 本次接受时的版本，用于拒绝迟到响应和旧确认。
     */
    const version = ++generation
    state.phase = 'querying'
    state.error = ''
    try {
      /**
       * 当前请求、选择或事务返回的结果，不能仅凭文字宣称已保存。
       */
      const result = await client.query(batchId)
      if (current(version)) {
        state.batch = result
        state.phase = 'result'
      }
    } catch (
      /**
       * 本次捕获的异常，只允许固定分类进入显示或控制记录。
       */
      error
    ) {
      if (current(version)) {
        state.error = message(error)
        state.phase = 'result'
      }
    }
  }
  /** 一次点击确认最终清单，退出后已确认任务仍按原资格执行。 */
  async function save(): Promise<void> {
    if (
      closed ||
      busy.value ||
      !state.view ||
      state.view.status !== 'DRAFT_READY' ||
      !state.view.draft.entries.length ||
      hasUnknown.value ||
      stopRequested
    )
      return

    /**
     * 本次接受时的版本，用于拒绝迟到响应和旧确认。
     */
    const version = ++generation

    /**
     * 仅在当前页往返的不透明状态，页面不能修改其中身份或期限。
     */
    const sealed = state.view.sealed

    /**
     * 本次确认的固定清单证明与原批次引用，等待期间不改变。
     */
    const prepareInput = {
      sealed,
      confirmationId,
      ...(state.batch ? { batchId: state.batch.batchId, version: state.batch.version } : {}),
    }
    state.error = ''
    state.phase = 'saving'

    /**
     * 当前批次的控制资料和逐项结果，不包含未保存消费正文。
     */
    let batch = state.batch
    try {
      batch = await client.prepare(prepareInput)
      if (current(version)) state.batch = batch
      if (stopRequested) {
        /** 在确认返回后仍须提交已经提出的停止要求，再显示正式停止结果。 */
        const result = await client.stop(batch.batchId)
        if (current(version)) state.batch = result
        return
      }

      /**
       * 当前请求、选择或事务返回的结果，不能仅凭文字宣称已保存。
       */
      const result = await client.save({
        sealed,
        batchId: batch.batchId,
        version: batch.version,
        attemptRevision: batch.attemptRevision,
        attemptId: draftRequestId(),
      })
      if (current(version)) {
        state.batch = result
        state.phase = 'result'
      }
    } catch (
      /**
       * 本次捕获的异常，只允许固定分类进入显示或控制记录。
       */
      error
    ) {
      if (!current(version)) return
      state.error = message(error)
      // 已形成批次但未拿到结果时，只允许核对；不能把它们全报为失败。
      if (batch)
        state.batch = {
          ...batch,
          items: batch.items.map(
            /**
             * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
             */
            (
              /**
               * 当前集合中的单项，使用所在集合的既有范围和检查规则。
               */
              item,
            ) =>
              item.status === 'success'
                ? { ...item }
                : { ...item, status: 'unknown', code: 'LEDGER_BATCH_CHECK_FIRST' },
          ),
        }
      state.phase = batch ? 'result' : 'review'
    } finally {
      if (current(version) && state.phase === 'saving') state.phase = 'result'
    }
  }
  /** 明确取消保存与普通返回分开，已经成功的账目不回滚。 */
  async function stop(): Promise<void> {
    stopRequested = true
    state.stopped = true
    // 明确取消后撤掉未完成正文，只保留核对原保存所需的非正文控制。
    state.text = ''
    state.lastInput = ''
    state.view = null

    /**
     * 当前记录的稳定编号，只在已经核对的范围内查回。
     */
    const id = state.batch?.batchId
    if (!id) return
    try {
      /**
       * 当前请求、选择或事务返回的结果，不能仅凭文字宣称已保存。
       */
      const result = await client.stop(id)
      if (!closed) state.batch = result
    } catch (
      /**
       * 本次捕获的异常，只允许固定分类进入显示或控制记录。
       */
      error
    ) {
      if (!closed) state.error = message(error)
    }
  }
  /** 取消整理时真正发送取消动作，并立即清空本页原话与草稿。 */
  async function cancelUnderstanding(): Promise<void> {
    /**
     * 本次固定请求内容或引用，网络处理期间不再读取可变页面值。
     */
    const request = active
    generation++
    active = null
    state.text = ''
    state.lastInput = ''
    state.view = null
    state.error = ''
    state.phase = 'input'
    if (request) {
      try {
        await client.cancel(request.draftId, request.requestId)
      } catch {
        if (!closed) state.error = '取消消息未送达，原处理会在原时限内结束；结果不会恢复到本页。'
      }
    }
  }
  /** 原结果保留在云端，另一次新输入不复用原未成功清单。 */
  function restart(): void {
    if (busy.value || closed) return
    generation++
    state.text = ''
    state.lastInput = ''
    state.view = null
    state.batch = null
    state.error = ''
    state.phase = 'input'
    confirmationId = draftRequestId()
    stopRequested = false
    state.stopped = false
  }
  /** 卸载清空所有本页内容，普通退出不撤销已经确认的保存。 */
  function dispose(): void {
    if (closed) return
    closed = true
    generation++

    /**
     * 本次固定请求内容或引用，网络处理期间不再读取可变页面值。
     */
    const request = active
    active = null
    state.text = ''
    state.lastInput = ''
    state.view = null
    state.batch = null
    state.history = []
    state.consent = false
    if (request)
      client.cancel(request.draftId, request.requestId).catch(
        /**
         * 收拢已经退出的请求错误，不恢复页面、不重发原话。
         */
        () => {
          /* 后台仍有原期限，迟到响应没有显示资格。 */
        },
      )
  }
  return {
    state: readonly(state),
    busy,
    totals,
    successful,
    hasUnknown,
    initialize,
    setText,
    setConsent,
    send,
    edit,
    remove,
    query,
    save,
    stop,
    cancelUnderstanding,
    restart,
    dispose,
  }
}
