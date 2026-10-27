/** 文件用途：调用固定账本草稿动作并严格检查返回，保持原单笔客户端和时限不变。 */
import { cloudEnvironmentId } from '../config/cloud'
import type { BatchResult, DraftEntry, DraftView } from '../types/ledger-draft'

/** 单次云端调用能力，可注入测试，不含身份或服务凭据。 */
export interface DraftCloudRuntime {
  /** 微信云端调用，不允许页面决定函数名称。 */
  callFunction(
    /**
     * 当前调用的固定设置，只允许本接口已有字段。
     */
    options: {
      /**
       * 固定云函数名称或显示名称，不作为执行权限。
       */
      name: string
      /**
       * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
       */
      data: Record<string, unknown>
    },
  ): Promise<{ result: unknown }>
  /** 明确使用当前云环境。 */
  init(
    /**
     * 当前调用的固定设置，只允许本接口已有字段。
     */
    options: {
      /**
       * 已经配置的云环境引用，不是登录或身份凭据。
       */
      env: string
    },
  ): void
}
/** 固定可展示失败，禁止将云端原异常写进页面。 */
export class DraftCloudError extends Error {
  /** 仅保留安全编号。 */
  constructor(
    /**
     * 程序固定的错误编号，不包含原话或第三方异常。
     */
    public readonly code: string,

    /**
     * 可以显示的固定说明，不接收原始供应方异常作为页面文案。
     */
    message: string,
  ) {
    super(message)
  }
}
/** 检查普通对象与固定键，额外字段不能进入当前页。 */
function object(
  /**
   * 当前待检查或转换的值，通过对应规则后才能使用。
   */
  value: unknown,
  /**
   * 当前结构允许的字段名称，额外操作字段必须拒绝。
   */
  keys: string[],
): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every(
      /**
       * 逐项检查固定结构或最终状态，任一不符即返回否。
       */
      (
        /**
         * 当前比较或查回使用的键，具体含义由所在集合或结构限定。
         */
        key,
      ) => keys.includes(key),
    ),
  )
}
/** 核对页面完整账目，不能以类型断言代替网络检查。 */
function entry(
  /**
   * 当前待检查或转换的值，通过对应规则后才能使用。
   */
  value: unknown,
): value is DraftEntry {
  if (!object(value, ['id', 'type', 'amountCents', 'date', 'categoryKey', 'memberKey', 'note', 'mealPeriod']))
    return false
  return (
    typeof value.id === 'string' &&
    value.id.length <= 64 &&
    (value.type === null || value.type === 'income' || value.type === 'expense') &&
    (value.amountCents === null ||
      (Number.isSafeInteger(value.amountCents) &&
        Number(value.amountCents) > 0 &&
        Number(value.amountCents) <= 999999999)) &&
    (value.date === null || (typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date))) &&
    (value.categoryKey === null ||
      (typeof value.categoryKey === 'string' && /^c\d{1,3}$/.test(value.categoryKey))) &&
    (value.memberKey === null ||
      (typeof value.memberKey === 'string' && /^m\d{1,2}$/.test(value.memberKey))) &&
    typeof value.note === 'string' &&
    value.note.length <= 100 &&
    (value.mealPeriod === null || ['breakfast', 'lunch', 'dinner'].includes(String(value.mealPeriod)))
  )
}
/** 严格接收草稿、补问及可选资料，不接收额外执行指令。 */
function draftView(
  /**
   * 当前待检查或转换的值，通过对应规则后才能使用。
   */
  value: unknown,
): value is DraftView {
  if (
    !object(value, ['status', 'retryable', 'sealed', 'draft', 'categories', 'members', 'question']) ||
    !object(value.draft, ['id', 'revision', 'anchorDay', 'expiresAt', 'entries'])
  )
    return false

  /**
   * 当前页未确认的有限状态，不能直接当作正式账目。
   */
  const draft = value.draft
  return (
    ['DRAFT_READY', 'DRAFT_CLARIFY'].includes(String(value.status)) &&
    typeof value.sealed === 'string' &&
    value.sealed.length <= 22000 &&
    typeof value.question === 'string' &&
    value.question.length <= 300 &&
    typeof draft.id === 'string' &&
    Number.isSafeInteger(draft.revision) &&
    typeof draft.anchorDay === 'string' &&
    typeof draft.expiresAt === 'number' &&
    Array.isArray(draft.entries) &&
    draft.entries.length <= 10 &&
    draft.entries.every(entry) &&
    [value.categories, value.members].every(
      /**
       * 逐项检查固定结构或最终状态，任一不符即返回否。
       */
      (
        /**
         * 当前范围中可选择的显示项目，不增加新的类目或成员。
         */
        choices,
      ) =>
        Array.isArray(choices) &&
        choices.length <= 128 &&
        choices.every(
          /**
           * 逐项检查固定结构或最终状态，任一不符即返回否。
           */
          (
            /**
             * 正在检查的一个显示选项，必须符合固定字段规则。
             */
            choice,
          ) =>
            object(choice, ['key', 'name', 'dining', 'self']) &&
            typeof choice.key === 'string' &&
            typeof choice.name === 'string' &&
            choice.name.length <= 64 &&
            (choice.self === undefined || typeof choice.self === 'boolean') &&
            (choice.dining === undefined || typeof choice.dining === 'boolean'),
        ),
    )
  )
}
/** 保存结果仅包含有限项目和正式成功引用。 */
function batchResult(
  /**
   * 当前待检查或转换的值，通过对应规则后才能使用。
   */
  value: unknown,
): value is BatchResult {
  return (
    object(value, ['status', 'retryable', 'batchId', 'version', 'attemptRevision', 'expiresAt', 'items']) &&
    value.status === 'BATCH_RESULT' &&
    typeof value.batchId === 'string' &&
    /^[A-Za-z0-9_-]{16,128}$/.test(value.batchId) &&
    Number.isSafeInteger(value.version) &&
    Number.isSafeInteger(value.attemptRevision) &&
    Number(value.attemptRevision) >= 0 &&
    typeof value.expiresAt === 'number' &&
    Array.isArray(value.items) &&
    value.items.length <= 10 &&
    value.items.every(
      /**
       * 逐项检查固定结构或最终状态，任一不符即返回否。
       */
      (
        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        item,
      ) =>
        object(item, ['itemId', 'status', 'entryId', 'code']) &&
        typeof item.itemId === 'string' &&
        ['success', 'failed', 'unknown', 'unexecuted'].includes(String(item.status)) &&
        (item.entryId === null || typeof item.entryId === 'string') &&
        (item.code === null || (typeof item.code === 'string' && /^[A-Z_]+$/.test(item.code))) &&
        (item.status !== 'success' || typeof item.entryId === 'string'),
    )
  )
}
/** 创建当前页专属客户端，不存储原话，不复用可恢复业务队列。 */
export function createDraftCloud(
  /** 当前家庭只作请求目标，云端仍须核对真实身份。 */
  householdId: string,
  /** 固定测试依赖，正式使用微信运行时。 */
  injected?: DraftCloudRuntime,
) {
  /** 本页使用同一个已初始化微信连接。 */
  const runtime = injected || (globalThis as unknown as { wx?: { cloud?: DraftCloudRuntime } }).wx?.cloud
  if (!runtime) throw new DraftCloudError('UNAVAILABLE', '请在微信中使用一句话记账。')
  runtime.init({ env: cloudEnvironmentId })
  /** 有限一次调用，不自动重新发送，也不把Promise超时冒充真正取消。 */
  async function call(
    /**
     * 程序允许的固定账本动作，不能转发任意函数。
     */
    action: string,
    /**
     * 本次动作收到的有限输入，所有身份及保存许可仍从可信后台核对。
     */
    input: Record<string, unknown> = {},
  ): Promise<unknown> {
    /** 当前动作专用时限，不改变原单笔10秒限制。 */
    const timeout = action === 'understandDraft' ? 63000 : action === 'saveBatch' ? 35000 : 10000
    /** 超时句柄始终在结束时清理。 */
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      // 异步前固定实际传输的普通资料，不将Vue代理或后续页面修改交给后台。
      const data = JSON.parse(JSON.stringify({ ...input, action, householdId })) as Record<string, unknown>
      /** 只允许固定账本云函数，数据中不携带可信身份。 */
      const response = await Promise.race([
        runtime!.callFunction({ name: 'ledger', data }),
        new Promise<never>(
          /**
           * 建立本次有界异步等待，由明确完成或失败结束，不自动重复执行。
           */
          (
            /**
             * 本等待分支不产生成功值，仅保留Promise要求的参数位置。
             */
            _resolve,
            /**
             * 失败时以固定错误结束本次等待的函数。
             */
            reject,
          ) => {
            timer = setTimeout(
              /**
               * 原定时限到达后结束当前等待，不自动重发请求。
               */
              () =>
                reject(
                  new DraftCloudError(
                    'TIMEOUT',
                    action === 'saveBatch'
                      ? '保存结果尚未确定，请先核对原结果。'
                      : '本次处理超时，请稍后手动再试。',
                  ),
                ),
              timeout,
            )
          },
        ),
      ])
      return response.result
    } catch (
      /**
       * 本次捕获的异常，只允许固定分类进入显示或控制记录。
       */
      error
    ) {
      if (error instanceof DraftCloudError) throw error
      throw new DraftCloudError(
        'FAILED',
        action === 'saveBatch' ? '保存结果尚未确定，请先核对原结果。' : '本次处理未完成，请稍后手动再试。',
      )
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  /** 固定错误文案不能被模型或后端原异常替换。 */
  function invalid(
    /**
     * 当前待检查或转换的值，通过对应规则后才能使用。
     */
    value: unknown,
  ): never {
    /**
     * 程序固定的错误编号，不包含原话或第三方异常。
     */
    const code =
      object(value, ['status', 'retryable', 'errorMessage']) && typeof value.status === 'string'
        ? value.status
        : 'INVALID_RESPONSE'

    /**
     * 固定错误文案表，不展示模型或云端原始异常。
     */
    const messages: Record<string, string> = {
      LEDGER_DRAFT_EXPIRED: '本次整理已过期，请重新输入。',
      LEDGER_TIME_INVALID: '日期不在账本支持范围内，请修改后再试。',
      LEDGER_DRAFT_LIMIT: '本次描述或清单超过限制，请分开描述，最多十笔。',
      LEDGER_DRAFT_UNSUPPORTED: '这里只整理文字人民币收支，暂不处理图片、换汇或修改旧账。',
      LEDGER_AI_BUSY: '当前正在整理，请稍后手动再试。',
      LEDGER_AI_TIMEOUT: '本次整理超时，请稍后手动再试。',
      LEDGER_FORBIDDEN: '你已没有这个家庭的访问权限。',
      LEDGER_AI_UNAVAILABLE: '一句话记账尚未连接，请先使用手动记账。',
      LEDGER_BATCH_CHECK_FIRST: '请先核对原保存结果，再处理未成功项。',
      LEDGER_BATCH_EXPIRED: '原保存记录已过期，不能再次提交。',
    }
    throw new DraftCloudError(code, messages[code] || '返回内容未通过检查，请保留当前内容后手动再试。')
  }
  return {
    /** 可用状态不触发模型，连接未准备时保持手动入口。 */
    async available(): Promise<boolean> {
      /**
       * 当前待检查或转换的值，通过对应规则后才能使用。
       */
      const value = await call('getDraftAvailability')
      if (
        !object(value, ['status', 'available', 'retryable']) ||
        value.status !== 'DRAFT_AVAILABILITY' ||
        typeof value.available !== 'boolean'
      )
        invalid(value)
      return value.available as boolean
    },
    /** 一次理解或补问，只接受完整检查结果。 */
    async understand(
      /**
       * 本次动作收到的有限输入，所有身份及保存许可仍从可信后台核对。
       */
      input: {
        /**
         * 本次固定输入的完整原话，不因截断或补默认值而改变含义。
         */
        text: string

        /**
         * 仅在当前页往返的不透明状态，页面不能修改其中身份或期限。
         */
        sealed: string | null

        /**
         * 本页草稿的稳定引用，用于隔离并发和取消。
         */
        draftId: string

        /**
         * 本次具体请求引用，不因超时自动更换重发。
         */
        requestId: string

        /**
         * 当前页明确的数据用途同意，拒绝时不能发送原话。
         */
        consent: boolean
      },
    ): Promise<DraftView> {
      /**
       * 当前待检查或转换的值，通过对应规则后才能使用。
       */
      const value = await call('understandDraft', input)
      if (!draftView(value)) invalid(value)
      return value
    },
    /** 人工编辑必须由后台重新核对并保护当前版本。 */
    async edit(
      /**
       * 仅在当前页往返的不透明状态，页面不能修改其中身份或期限。
       */
      sealed: string,

      /**
       * 当前完整待核对清单，必须保留每笔稳定编号并遵守十笔上限。
       */
      entries: DraftEntry[],

      /**
       * 本次已有批次的控制编号和版本，用于撤回旧确认。
       */
      confirmation?: {
        /**
         * 原保存批次的非正文引用，缺失时不能重建原批次。
         */
        batchId: string
        /**
         * 本次接受时的版本，用于拒绝迟到响应和旧确认。
         */
        version: number
      },
    ): Promise<DraftView> {
      /**
       * 当前待检查或转换的值，通过对应规则后才能使用。
       */
      const value = await call('editDraft', { sealed, entries, ...confirmation })
      if (!draftView(value)) invalid(value)
      return value
    },
    /** 取消真实后台请求，迟到响应由页面另行拒绝。 */
    async cancel(
      /**
       * 本页草稿的稳定引用，用于隔离并发和取消。
       */
      draftId: string,
      /**
       * 本次具体请求引用，不因超时自动更换重发。
       */
      requestId: string,
    ): Promise<void> {
      await call('cancelDraft', { draftId, requestId })
    },
    /** 固定当前确认，不执行账目保存。 */
    async prepare(
      /**
       * 本次动作收到的有限输入，所有身份及保存许可仍从可信后台核对。
       */
      input: Record<string, unknown>,
    ): Promise<BatchResult> {
      /**
       * 当前待检查或转换的值，通过对应规则后才能使用。
       */
      const value = await call('prepareBatch', input)
      if (!batchResult(value) || (input.batchId && value.batchId !== input.batchId)) invalid(value)
      return value
    },
    /** 只保存用户确认的当前版本。 */
    async save(
      /**
       * 本次动作收到的有限输入，所有身份及保存许可仍从可信后台核对。
       */
      input: Record<string, unknown>,
    ): Promise<BatchResult> {
      /**
       * 当前待检查或转换的值，通过对应规则后才能使用。
       */
      const value = await call('saveBatch', input)
      if (!batchResult(value) || value.batchId !== input.batchId || value.version !== input.version)
        invalid(value)
      return value
    },
    /** 只核对原操作事实，不恢复消费草稿。 */
    async query(
      /**
       * 原保存批次的非正文引用，缺失时不能重建原批次。
       */
      batchId: string,
    ): Promise<BatchResult> {
      /**
       * 当前待检查或转换的值，通过对应规则后才能使用。
       */
      const value = await call('queryBatch', { batchId })
      if (!batchResult(value) || value.batchId !== batchId) invalid(value)
      return value
    },
    /** 明确停止后续，已经成功的账目保留。 */
    async stop(
      /**
       * 原保存批次的非正文引用，缺失时不能重建原批次。
       */
      batchId: string,
    ): Promise<BatchResult> {
      /**
       * 当前待检查或转换的值，通过对应规则后才能使用。
       */
      const value = await call('stopBatch', { batchId })
      if (!batchResult(value) || value.batchId !== batchId) invalid(value)
      return value
    },
    /** 返回无正文历史执行状态。 */
    async list(): Promise<BatchResult[]> {
      /**
       * 当前待检查或转换的值，通过对应规则后才能使用。
       */
      const value = await call('listBatches')
      if (
        !object(value, ['status', 'retryable', 'batches']) ||
        value.status !== 'BATCH_LIST' ||
        !Array.isArray(value.batches) ||
        value.batches.length > 20 ||
        !value.batches.every(batchResult)
      )
        invalid(value)
      return value.batches as BatchResult[]
    },
  }
}
/** 当前页客户端类型，不增加全局可恢复状态。 */
export type DraftCloud = ReturnType<typeof createDraftCloud>
