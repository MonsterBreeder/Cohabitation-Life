/** 文件用途：通过真实客户端、草稿和账本规则验证页面确认、防重复、退出和迟到处理。 */
import { createDraftCloud, DraftCloudError } from '../../src/services/ledger-draft-cloud'
import { useLedgerDraft } from '../../src/subpackages/ledger/ledger-smart-add/use-ledger-draft'
import type { DraftCloud } from '../../src/services/ledger-draft-cloud'
/** 云端业务以原CommonJS模块加载，检查中不初始化微信SDK。 */
declare function require(
  /**
   * 程序固定的本机动作路径，不能由模型指定其他地址。
   */
  path: string,
): any
/** 虚构事务仓储。 */
const { fixture, readyDraft } = require('../fixtures/ledger-ai.cjs')
/** 正式草稿与批次处理。 */
const drafts = require('../../cloudfunctions/ledger/draft-domain')
/** 保存仍走实际账本领域。 */
const batches = require('../../cloudfunctions/ledger/batch-domain')

/** 将真实客户端接到纯业务入口，仅替换微信外层与供应方响应。 */
async function setup() {
  /**
   * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
   */
  const data = fixture()
  await readyDraft(data)

  /**
   * 本次检查实际调用的动作顺序，用于确认没有自动发送或保存。
   */
  const actions: string[] = []

  /**
   * 本页专属云端客户端，不提供全局可恢复草稿。
   */
  const client = createDraftCloud(data.deps.householdId, {
    /**
     * 初始化本页明确使用的云连接；检查替身不连接真实云端。
     */
    init() {},

    /**
     * 接收固定动作及已复制资料，返回完整响应供客户端严格核对。
     */
    async callFunction(
      /**
       * 当前调用的固定设置，只允许本接口已有字段。
       */
      options,
    ) {
      /**
       * 程序允许的固定账本动作，不能转发任意函数。
       */
      const action = String(options.data.action)
      actions.push(action)
      if (action === 'getDraftAvailability')
        return { result: { status: 'DRAFT_AVAILABILITY', available: true, retryable: false } }

      /**
       * 从固定动作表选出的正式业务函数，不接收任意执行目标。
       */
      const handler = drafts[action] || batches[action]
      return { result: await handler(options.data, data.deps) }
    },
  })
  return { data, actions, client }
}

/** 检查“当前页记账流程”这一场景，等待结束后核对实际结果。 */
function registerDraftFlowChecks() {
  /** 检查“理解尚未完成时退出，即使取消后的响应迟到也不能恢复原话或清单”这一场景，等待结束后核对实际结果。 */
  async function verifyLateUnderstanding() {
    /**
     * 本次明确解构的资料与控制引用，各成员仍遵守原来的范围和用途。
     * 本页专属云端客户端，不提供全局可恢复草稿。
     * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
     */
    const { client, data } = await setup()

    /**
     * 当前检查中明确结束等待的函数，用于制造迟到返回。
     */
    let release: () => void =
      /**
       * 处理当前已固定的输入或状态，返回本步骤结果，不自行扩大所属或重发请求。
       */
      () => {}

    /**
     * 当前尚未结束的异步操作，不能提前当作成功。
     */
    const pending = new Promise<void>(
      /**
       * 建立本次有界异步等待，由明确完成或失败结束，不自动重复执行。
       */
      (
        /**
         * 成功时交付本次异步结果的函数。
         */
        resolve,
      ) => {
        release = resolve
      },
    )

    /**
     * 当前具体请求的取消处理，用于核对取消没有波及其他用户。
     */
    const cancel = jest.fn(
      /**
       * 处理当前已固定的输入或状态，返回本步骤结果，不自行扩大所属或重发请求。
       */
      async () => {},
    )

    /**
     * 只替换指定外层行为的客户端，其余仍执行正式流程。
     */
    const wrapped: DraftCloud = {
      ...client,
      cancel,

      /**
       * 接收当前输入和有限状态，返回补问或可核对清单，不正式记账。
       */
      async understand(
        /**
         * 本次动作收到的有限输入，所有身份及保存许可仍从可信后台核对。
         */
        input,
      ) {
        await pending
        return client.understand(input)
      },
    }

    /**
     * 当前页专属状态实例，退出后撤回显示资格。
     */
    const flow = useLedgerDraft(wrapped)
    await flow.initialize()
    flow.setConsent(true)
    flow.setText('昨天我吃饭花50，乙娱乐100')

    /**
     * 已经开始但尚未完成的理解操作，等待结束后核对迟到处理。
     */
    const sending = flow.send()
    expect(flow.state.phase).toBe('understanding')
    flow.dispose()
    release()
    await sending
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(flow.state.view).toBeNull()
    expect(flow.state.lastInput).toBe('')
    expect(flow.state.text).toBe('')
    expect(data.entries.size).toBe(0)
  }

  it('理解尚未完成时退出，即使取消后的响应迟到也不能恢复原话或清单', verifyLateUnderstanding)
  /** 检查“不同意不发送，核对后才保存，重复点击不会增加账目”这一场景，等待结束后核对实际结果。 */
  async function verifyConsentAndDuplicate() {
    /**
     * 本次明确解构的资料与控制引用，各成员仍遵守原来的范围和用途。
     * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
     * 本页专属云端客户端，不提供全局可恢复草稿。
     * 本次检查实际调用的动作顺序，用于确认没有自动发送或保存。
     */
    const { data, client, actions } = await setup()

    /**
     * 当前页专属状态实例，退出后撤回显示资格。
     */
    const flow = useLedgerDraft(client)
    await flow.initialize()
    flow.setText('昨天我吃饭花50，乙娱乐100')
    await flow.send()
    expect(actions).not.toContain('understandDraft')
    flow.setConsent(true)
    await flow.send()
    expect(flow.state.view?.status).toBe('DRAFT_READY')
    expect(data.entries.size).toBe(0)
    expect(flow.totals.value).toEqual({ expense: 15000, income: 0 })
    await Promise.all([flow.save(), flow.save()])
    expect(data.entries.size).toBe(2)
    expect(
      flow.state.batch?.items.every(
        /**
         * 逐项检查固定结构或最终状态，任一不符即返回否。
         */
        (
          /**
           * 当前集合中的单项，使用所在集合的既有范围和检查规则。
           */
          item,
        ) => item.status === 'success',
      ),
    ).toBe(true)
    flow.dispose()
    expect(flow.state.view).toBeNull()
    expect(flow.state.lastInput).toBe('')
    expect(data.entries.size).toBe(2)
  }

  it('不同意不发送，核对后才保存，重复点击不会增加账目', verifyConsentAndDuplicate)

  /** 检查“保存成功后返回丢失先核对，不能换一批重复保存”这一场景，等待结束后核对实际结果。 */
  async function verifyLostReturn() {
    /**
     * 本次明确解构的资料与控制引用，各成员仍遵守原来的范围和用途。
     * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
     * 本页专属云端客户端，不提供全局可恢复草稿。
     */
    const { data, client } = await setup()

    /**
     * 只替换指定外层行为的客户端，其余仍执行正式流程。
     */
    const wrapped: DraftCloud = {
      ...client,

      /**
       * 接收用户确认的固定版本，返回实际逐项结果，不自动重新发送。
       */
      async save(
        /**
         * 本次动作收到的有限输入，所有身份及保存许可仍从可信后台核对。
         */
        input,
      ) {
        await client.save(input)
        throw new DraftCloudError('TIMEOUT', '原结果待核对')
      },
    }

    /**
     * 当前页专属状态实例，退出后撤回显示资格。
     */
    const flow = useLedgerDraft(wrapped)
    await flow.initialize()
    flow.setConsent(true)
    flow.setText('昨天我吃饭花50，乙娱乐100')
    await flow.send()
    await flow.save()
    expect(data.entries.size).toBe(2)
    expect(flow.hasUnknown.value).toBe(true)
    await flow.save()
    expect(data.entries.size).toBe(2)
    await flow.query()
    expect(flow.hasUnknown.value).toBe(false)
    expect(flow.successful.value.size).toBe(2)
  }

  it('保存成功后返回丢失先核对，不能换一批重复保存', verifyLostReturn)

  /** 检查“退出后迟到理解不能恢复输入，已经明确确认的保存仍可完成并回查”这一场景，等待结束后核对实际结果。 */
  async function verifySaveAfterExit() {
    /**
     * 本次明确解构的资料与控制引用，各成员仍遵守原来的范围和用途。
     * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
     * 本页专属云端客户端，不提供全局可恢复草稿。
     */
    const { data, client } = await setup()

    /**
     * 当前检查中明确结束等待的函数，用于制造迟到返回。
     */
    let release: () => void =
      /**
       * 处理当前已固定的输入或状态，返回本步骤结果，不自行扩大所属或重发请求。
       */
      () => {}

    /**
     * 当前尚未结束的异步操作，不能提前当作成功。
     */
    const pending = new Promise<void>(
      /**
       * 建立本次有界异步等待，由明确完成或失败结束，不自动重复执行。
       */
      (
        /**
         * 成功时交付本次异步结果的函数。
         */
        resolve,
      ) => {
        release = resolve
      },
    )

    /**
     * 只替换指定外层行为的客户端，其余仍执行正式流程。
     */
    const wrapped: DraftCloud = {
      ...client,

      /**
       * 固定本次最终清单并返回确认控制资料，不提前保存账目。
       */
      async prepare(
        /**
         * 本次动作收到的有限输入，所有身份及保存许可仍从可信后台核对。
         */
        input,
      ) {
        await pending
        return client.prepare(input)
      },
    }

    /**
     * 当前页专属状态实例，退出后撤回显示资格。
     */
    const flow = useLedgerDraft(wrapped)
    await flow.initialize()
    flow.setConsent(true)
    flow.setText('昨天我吃饭花50，乙娱乐100')
    await flow.send()

    /**
     * 当前已明确确认的保存过程，普通退出不撤销已经开始的执行。
     */
    const saving = flow.save()
    flow.dispose()
    release()
    await saving
    expect(data.entries.size).toBe(2)
    expect(flow.state.view).toBeNull()

    /**
     * 重新进入时的新页面状态，不能恢复旧原话或清单。
     */
    const reopened = useLedgerDraft(client)
    await reopened.initialize()
    expect(reopened.state.view).toBeNull()
    expect(reopened.state.history).toHaveLength(1)
    await reopened.query(reopened.state.history[0].batchId)
    expect(
      reopened.state.batch?.items.every(
        /**
         * 逐项检查固定结构或最终状态，任一不符即返回否。
         */
        (
          /**
           * 当前集合中的单项，使用所在集合的既有范围和检查规则。
           */
          item,
        ) => item.status === 'success',
      ),
    ).toBe(true)
    expect(reopened.state.view).toBeNull()
  }

  it('退出后迟到理解不能恢复输入，已经明确确认的保存仍可完成并回查', verifySaveAfterExit)

  /** 检查“确认返回前停止保存会清空正文并阻止全部后续写入”这一场景，等待结束后核对实际结果。 */
  async function verifyStopBeforePrepared() {
    /** 正式客户端与只保存虚构资料的检查仓库。 */
    const { client, data } = await setup()
    /** 由本场景明确结束确认等待，不使用真实时间延迟。 */
    let release: () => void =
      /** 尚未建立等待时保持空操作。 */
      () => {}
    /** 用于固定“先停止、后返回确认”这一顺序的等待。 */
    const pending = new Promise<void>(
      /** 记录等待完成函数，后续由场景主动调用。 */
      (
        /** 只结束本次等待，不触发账目保存。 */
        resolve,
      ) => {
        release = resolve
      },
    )
    /** 仅延后确认返回，其余沿用正式客户端和保存流程。 */
    const wrapped: DraftCloud = {
      ...client,
      /** 先等待停止要求，再向正式后台取得确认控制资料。 */
      async prepare(
        /** 当前固定的确认输入，不在等待后读取可变页面清单。 */
        input,
      ) {
        await pending
        return client.prepare(input)
      },
    }
    /** 本场景唯一页面状态，不使用全局恢复资料。 */
    const flow = useLedgerDraft(wrapped)
    await flow.initialize()
    flow.setConsent(true)
    flow.setText('昨天我吃饭花50，乙娱乐100')
    await flow.send()
    /** 已经点击确认但尚未取得批次的保存等待。 */
    const saving = flow.save()
    await flow.stop()
    expect(flow.state.view).toBeNull()
    expect(flow.state.lastInput).toBe('')
    expect(flow.state.text).toBe('')
    expect(flow.state.stopped).toBe(true)
    release()
    await saving
    expect(flow.state.phase).toBe('result')
    expect(
      flow.state.batch?.items.map(
        /** 逐项只读取正式执行状态，不能按请求返回推断成功。 */
        (
          /** 当前待核对项目。 */
          item,
        ) => item.status,
      ),
    ).toEqual(['unexecuted', 'unexecuted'])
    expect(data.entries.size).toBe(0)
    await flow.save()
    expect(data.entries.size).toBe(0)
  }

  it('确认返回前停止保存会清空正文并阻止全部后续写入', verifyStopBeforePrepared)

  /** 检查“移除全部不能保存，恶意响应带额外字段被客户端拒绝”这一场景，等待结束后核对实际结果。 */
  async function verifyEmptyAndInvalidResponse() {
    /**
     * 本次明确解构的资料与控制引用，各成员仍遵守原来的范围和用途。
     * 本页专属云端客户端，不提供全局可恢复草稿。
     * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
     */
    const { client, data } = await setup()

    /**
     * 当前页专属状态实例，退出后撤回显示资格。
     */
    const flow = useLedgerDraft(client)
    await flow.initialize()
    flow.setConsent(true)
    flow.setText('昨天我吃饭花50，乙娱乐100')
    await flow.send()

    /**
     * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
     */
    for (const entry of [...flow.state.view!.draft.entries]) await flow.remove(entry.id)
    expect(flow.state.view?.draft.entries).toHaveLength(0)
    await flow.save()
    expect(data.entries.size).toBe(0)

    /**
     * 含额外字段的虚构响应，用于确认严格拒绝而非透传。
     */
    const malformed = createDraftCloud('test-home', {
      /**
       * 初始化本页明确使用的云连接；检查替身不连接真实云端。
       */
      init() {},

      /**
       * 接收固定动作及已复制资料，返回完整响应供客户端严格核对。
       */
      async callFunction() {
        return { result: { status: 'DRAFT_AVAILABILITY', available: true, execute: true } }
      },
    })
    await expect(malformed.available()).rejects.toThrow('返回内容未通过检查')
  }

  it('移除全部不能保存，恶意响应带额外字段被客户端拒绝', verifyEmptyAndInvalidResponse)
}

describe('当前页记账流程', registerDraftFlowChecks)
