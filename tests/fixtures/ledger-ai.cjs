/** 文件用途：为记账集成检查提供可回滚、串行事务的虚构仓储，不接触云端数据。 */
const nodeCrypto = require('crypto')
/** 每次测试建立独立家庭与记录。 */
function fixture() {
  /**
   * 当前已核对的发起者引用，用于隔离其他成员的草稿与回执。
   */
  const owner = 'user_test_owner'

  /**
   * 虚构的另一位家庭成员，检查代记和越权边界。
   */
  const partner = 'user_test_partner'

  /**
   * 本次账本目标，仍需由微信身份和成员资格共同核对。
   */
  const householdId = 'home_test_household'

  /**
   * 当前可信家庭资料，用于再次核对真实成员资格。
   */
  const home = { _id: householdId, memberKeys: [owner, partner] }

  /**
   * 本次当前可选择的类目，不从其他家庭读取。
   */
  const categories = new Map([
    [
      'cat_test_dining',
      { _id: 'cat_test_dining', householdId, key: 'dining', name: '餐饮', isCustom: false },
    ],
    ['cat_test_fun', { _id: 'cat_test_fun', householdId, key: 'fun', name: '娱乐', isCustom: false }],
  ])

  /**
   * 当前完整待核对清单，必须保留每笔稳定编号并遵守十笔上限。
   */
  const entries = new Map()

  /**
   * 虚构仓储的原操作事实集合，不重置真实验收账目。
   */
  const operations = new Map()

  /**
   * 当前发起者可查的有限批次结果，不恢复原消费描述。
   */
  const batches = new Map()

  /**
   * 当前虚构场景的受控时钟，允许明确推进过期边界。
   */
  let clock = Date.now()

  /**
   * 虚构事务的顺序队列，保证每次提交使用独立视图。
   */
  let queue = Promise.resolve()

  /**
   * 场景指定的事务前故障或资格变化处理。
   */
  let beforeTransaction = null

  /**
   * 是否模拟提交成功但调用者没拿到返回。
   */
  let loseResponse = false

  /**
   * 本次调用的同一仓储实例，读取和提交都沿用它。
   */
  const repo = {
    isMemberOfHousehold:
      /**
       * 用可信成员引用和家庭资料核对资格，返回是否仍是成员。
       */
      async (
        /**
         * 仓储核对的当前调用人，不从消费文字推断。
         */
        identity,
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => id === householdId && home.memberKeys.includes(identity),
    getHousehold:
      /**
       * 查回目标家庭资料，供事务再次核对真实成员资格。
       */
      async (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => (id === householdId ? structuredClone(home) : null),
    getProfileForMember:
      /**
       * 只取得当前成员的最少显示资料，返回昵称等本次需要的内容。
       */
      async (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => ({ nickname: id === owner ? '甲' : '乙' }),
    findCategoriesByHousehold:
      /**
       * 查回当前家庭的可选类目，不读取其他家庭。
       */
      async () =>
        [...categories.values()].map(
          /**
           * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
           */
          (
            /**
             * 当前集合中的单项，使用所在集合的既有范围和检查规则。
             */
            item,
          ) => structuredClone(item),
        ),
    findCategoryById:
      /**
       * 查回对应类目的正式记录，返回记录或空值供范围核对。
       */
      async (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => structuredClone(categories.get(id) || null),
    getEntry:
      /**
       * 按稳定编号查回当前事务视图中的账目，返回记录或空值。
       */
      async (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => structuredClone(entries.get(id) || null),
    getOperation:
      /**
       * 按原请求编号查回去重事实，返回已提交事实或空值。
       */
      async (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => structuredClone(operations.get(id) || null),
    getBatch:
      /**
       * 查回本次无正文批次控制，所属仍由业务层核对。
       */
      async (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => structuredClone(batches.get(id) || null),
    listBatches:
      /**
       * 只列出本次发起者在当前家庭的有限回执，不返回原话或清单正文。
       */
      async (
        /**
         * 仓储核对的当前调用人，不从消费文字推断。
         */
        identity,
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) =>
        [...batches.values()]
          .filter(
            /**
             * 按当前类型、范围或状态保留符合条件的项，返回独立列表。
             */
            (
              /**
               * 当前集合中的单项，使用所在集合的既有范围和检查规则。
               */
              item,
            ) => item.owner === identity && item.householdId === id,
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
            ) => structuredClone(item),
          ),

    /**
     * 在隔离的同一事务视图执行工作，成功后一并提交，失败不留下部分记录。
     */
    runTransaction(
      /**
       * 在唯一事务视图中执行的保存工作，返回实际提交所需的记录。
       */
      work,
    ) {
      /**
       * 当前尚未结束的异步操作，不能提前当作成功。
       */
      const pending = queue.then(
        /**
         * 在前一项结束后顺序执行本次工作，返回本次实际处理结果。
         */
        async () => {
          /**
           * 事务开始前的真实记录数，用于只在新写入后模拟返回丢失。
           */
          const entryCountBefore = entries.size
          if (beforeTransaction) await beforeTransaction()

          /**
           * 本次事务的独立记录副本，失败不覆盖正式集合。
           */
          const drafts = [entries, operations, batches].map(
            /**
             * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
             */
            (
              /**
               * 当前记录集合的映射，事务提交时才替换正式内存视图。
               */
              map,
            ) =>
              new Map(
                [...map].map(
                  /**
                   * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
                   */
                  (
                    /**
                     * 本次明确解构的资料与控制引用，各成员仍遵守原来的范围和用途。
                     * 当前记录的稳定编号，只在已经核对的范围内查回。
                     * 当前原始记录，只在核对版本、范围和期限后使用。
                     */
                    [id, record],
                  ) => [id, structuredClone(record)],
                ),
              ),
          )

          /**
           * 本次明确解构的资料与控制引用，各成员仍遵守原来的范围和用途。
           * 本次事务的账目副本，提交前不影响正式记录。
           * 本次事务的去重事实副本，与账目一同提交。
           * 本次事务的无正文批次副本，与成功事实一同提交。
           */
          const [entryDraft, opDraft, batchDraft] = drafts

          /**
           * 同一次事务的读写视图，用于一起核对账目、去重和控制状态。
           */
          const tx = {
            getHousehold: repo.getHousehold,
            findCategoryById: repo.findCategoryById,
            getEntry:
              /**
               * 按稳定编号查回当前事务视图中的账目，返回记录或空值。
               */
              async (
                /**
                 * 当前记录的稳定编号，只在已经核对的范围内查回。
                 */
                id,
              ) => structuredClone(entryDraft.get(id) || null),
            getOperation:
              /**
               * 按原请求编号查回去重事实，返回已提交事实或空值。
               */
              async (
                /**
                 * 当前记录的稳定编号，只在已经核对的范围内查回。
                 */
                id,
              ) => structuredClone(opDraft.get(id) || null),
            getBatch:
              /**
               * 查回本次无正文批次控制，所属仍由业务层核对。
               */
              async (
                /**
                 * 当前记录的稳定编号，只在已经核对的范围内查回。
                 */
                id,
              ) => structuredClone(batchDraft.get(id) || null),
            setBatch:
              /**
               * 只将本次控制资料写入当前事务视图，与成功事实一并提交。
               */
              async (
                /**
                 * 当前原始记录，只在核对版本、范围和期限后使用。
                 */
                record,
              ) => batchDraft.set(record._id, structuredClone(record)),
            addEntry:
              /**
               * 在当前事务内建立正式账目，不绕过外层身份、字段和确认检查。
               */
              async (
                /**
                 * 当前原始记录，只在核对版本、范围和期限后使用。
                 */
                record,
              ) => entryDraft.set(record._id, structuredClone(record)),
            addOperation:
              /**
               * 将原创建请求的去重事实与账目一同写入当前事务。
               */
              async (
                /**
                 * 当前原始记录，只在核对版本、范围和期限后使用。
                 */
                record,
              ) => opDraft.set(record._id, structuredClone(record)),
            updateEntry:
              /**
               * 在本次事务副本合并已经核对的账目变更，不自行扩大字段权限。
               */
              async (
                /**
                 * 当前记录的稳定编号，只在已经核对的范围内查回。
                 */
                id,
                /**
                 * 当前待检查或转换的值，通过对应规则后才能使用。
                 */
                value,
              ) => entryDraft.set(id, { ...entryDraft.get(id), ...value }),
          }

          /**
           * 当前请求、选择或事务返回的结果，不能仅凭文字宣称已保存。
           */
          const result = await work(tx)

          /**
           * 本次明确解构的资料与控制引用，各成员仍遵守原来的范围和用途。
           * 当前清单位置，仅用于稳定排序和逐笔显示。
           * 当前记录集合的映射，事务提交时才替换正式内存视图。
           */
          for (const [index, map] of [entries, operations, batches].entries()) {
            map.clear()

            /**
             * 本次明确解构的资料与控制引用，各成员仍遵守原来的范围和用途。
             * 当前记录的稳定编号，只在已经核对的范围内查回。
             * 当前原始记录，只在核对版本、范围和期限后使用。
             */
            for (const [id, record] of drafts[index]) map.set(id, record)
          }
          if (loseResponse && entries.size > entryCountBefore) {
            loseResponse = false
            throw new Error('模拟提交成功后返回丢失')
          }
          return result
        },
      )
      queue = pending.catch(
        /**
         * 把当前错误保留给原请求，同时让后续独立事务仍可进入队列。
         */
        () => {},
      )
      return pending
    },
  }

  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  const deps = {
    identityKey: owner,
    selfMemberKey: owner,
    householdId,
    repository: repo,
    now:
      /**
       * 处理当前已固定的输入或状态，返回本步骤结果，不自行扩大所属或重发请求。
       */
      () => new Date(clock),
    draftSigningKey: 'T'.repeat(43),
  }
  return {
    deps,
    repo,
    entries,
    operations,
    batches,
    categories,
    home,
    owner,
    partner,
    advance:
      /**
       * 只推进本场景虚构时钟，便于核对自然到期和旧尝试隔离。
       */
      (
        /**
         * 本场景人工推进的毫秒数，只用于期限检查。
         */
        ms,
      ) => {
        clock += ms
      },
    before:
      /**
       * 为本场景设置准确的事务边界故障，不修改正式业务函数。
       */
      (
        /**
         * 当前检查指定的事务边界处理，用于模拟故障或资格变化。
         */
        callback,
      ) => {
        beforeTransaction = callback
      },
    lose:
      /**
       * 只在本场景下一次实际写入后模拟返回丢失，用于核对未知结果。
       */
      () => {
        loseResponse = true
      },
  }
}
/** 不调用真实模型，构造与服务正式响应一致的完整草稿。 */
async function readyDraft(
  /**
   * 仅含虚构资料的独立检查环境，不触碰真实家庭记录。
   */
  test,
) {
  /**
   * 本次明确解构的资料与控制引用，各成员仍遵守原来的范围和用途。
   * 正式草稿理解动作，检查中不替换其所属和保存边界。
   */
  const { understandDraft } = require('../../cloudfunctions/ledger/draft-domain')
  test.deps.aiCenter =
    /**
     * 处理当前已固定的输入或状态，返回本步骤结果，不自行扩大所属或重发请求。
     */
    async (
      /**
       * 本次固定请求内容或引用，网络处理期间不再读取可变页面值。
       */
      request,
    ) => ({
      status: 'ready',
      question: '',
      draft: {
        id: nodeCrypto.randomUUID(),
        revision: 1,
        anchorDay: request.context.anchorDay,
        expiresAt: test.deps.now().getTime() + 900000,
        sources: [{ id: 's1', text: request.text }],
        entries: [
          {
            id: 'item_dining',
            type: 'expense',
            amountCents: 5000,
            date: '2026-10-21',
            categoryKey: 'c1',
            memberKey: 'm1',
            note: '',
            mealPeriod: null,
          },
          {
            id: 'item_fun',
            type: 'expense',
            amountCents: 10000,
            date: '2026-10-21',
            categoryKey: 'c2',
            memberKey: 'm2',
            note: '',
            mealPeriod: null,
          },
        ],
      },
    })
  return understandDraft(
    {
      text: '昨天我吃饭花50，乙娱乐100',
      consent: true,
      draftId: nodeCrypto.randomUUID(),
      requestId: nodeCrypto.randomUUID(),
    },
    test.deps,
  )
}
module.exports = { fixture, readyDraft }
