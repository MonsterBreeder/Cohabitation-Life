/** 文件用途：核对当前页记账状态、保护往返原话并仅向受信本机服务提交必要资料。 */
const crypto = require('crypto')
/** 复用账本错误，入口只返回安全编号。 */
const { LedgerDomainError, _internal } = require('./ledger-domain')
/** 原生短编号之外不允许页面或模型构造操作属性。 */
const ENTRY_KEYS = ['id', 'type', 'amountCents', 'date', 'categoryKey', 'memberKey', 'note', 'mealPeriod']

/** 拒绝非法状态，不回显用户原话。 */
function reject(
  /**
   * 程序固定的错误编号，不包含原话或第三方异常。
   */
  code = 'LEDGER_DRAFT_INVALID',
) {
  throw new LedgerDomainError(code, false)
}
/** 结构只保留固定字段，拒绝原型或额外操作。 */
function exact(
  /**
   * 当前待检查或转换的值，通过对应规则后才能使用。
   */
  value,
  /**
   * 当前结构允许的字段名称，额外操作字段必须拒绝。
   */
  keys,
) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some(
      /**
       * 核对集合中是否存在符合当前条件的项，返回布尔结果。
       */
      (
        /**
         * 当前比较或查回使用的键，具体含义由所在集合或结构限定。
         */
        key,
      ) => !keys.includes(key),
    )
  )
    reject()
}
/** 核对真实日历值，不让日期对象将非法日挪到下月。 */
function validDay(
  /**
   * 待核对的具体日历字符串，不能自动滚动成另一天。
   */
  day,
) {
  return (
    typeof day === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(`${day}T00:00:00Z`)) &&
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
  )
}
/** 服务密钥必须显式配置，不能借用模型或应用连接凭据。 */
function signingKey(
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  /**
   * 当前比较或查回使用的键，具体含义由所在集合或结构限定。
   */
  const key = deps.draftSigningKey
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(key)) reject('LEDGER_AI_UNAVAILABLE')
  return key
}
/** 带用途的摘要既用于所属保护，也防止枚举小金额。 */
function digest(
  /**
   * 当前待检查或转换的值，通过对应规则后才能使用。
   */
  value,
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
  /**
   * 摘要的固定用途标签，避免不同凭据和内容摘要相互混用。
   */
  purpose = 'state',
) {
  return crypto.createHmac('sha256', signingKey(deps)).update(`${purpose}\0${value}`).digest('base64url')
}
/** 当前可信毫秒时间，只由后台依赖提供。 */
function nowMs(
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  return deps.now().getTime()
}
/** 校验所属和家庭仍有效，不接受页面自报身份。 */
async function assertMember(
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  if (!deps.identityKey || !(await deps.repository.isMemberOfHousehold(deps.identityKey, deps.householdId)))
    reject('LEDGER_FORBIDDEN')
}
/** 签封前限制完整字节，状态仅返回当前页面，不写库。 */
function seal(
  /**
   * 已经签封或等待检查的完整有限状态，不写入持久草稿。
   */
  payload,
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  /**
   * 本次完整序列化资料，按实际字节限制，不记录到日志。
   */
  const raw = JSON.stringify(payload)
  if (Buffer.byteLength(raw) > 16_384) reject('LEDGER_DRAFT_LIMIT')

  /**
   * 待核对签名的完整编码字节，验证前不解析内容。
   */
  const encoded = Buffer.from(raw).toString('base64url')
  return `${encoded}.${digest(encoded, deps)}`
}
/** 先验完整字节和签名再解析，算法与密钥均不能由页面指定。 */
function unseal(
  /**
   * 仅在受信服务之间使用的凭据或状态证明，不作为模型资料。
   */
  token,
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  if (
    typeof token !== 'string' ||
    token.length > 22_000 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)
  )
    reject()

  /**
   * 本次明确解构的资料与控制引用，各成员仍遵守原来的范围和用途。
   * 待核对签名的完整编码字节，验证前不解析内容。
   * 服务端对完整状态计算的签名，必须先验证再解析。
   */
  const [encoded, signature] = token.split('.')

  /**
   * 根据服务端固定规则计算的期望值，用于拒绝伪造或不一致状态。
   */
  const expected = digest(encoded, deps)
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) reject()

  /**
   * 已经签封或等待检查的完整有限状态，不写入持久草稿。
   */
  let payload
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    reject()
  }
  exact(payload, ['v', 'owner', 'home', 'draft', 'maps'])
  if (
    payload.v !== 1 ||
    payload.owner !== digest(deps.identityKey, deps, 'owner') ||
    payload.home !== digest(deps.householdId, deps, 'home')
  )
    reject('LEDGER_FORBIDDEN')
  if (
    !payload.draft ||
    payload.draft.expiresAt <= nowMs(deps) ||
    payload.draft.expiresAt > nowMs(deps) + 900_000
  )
    reject('LEDGER_DRAFT_EXPIRED')
  return payload
}
/** 每次重新取得可选资料；短编号到真实成员的对应不暴露给模型或页面。 */
async function snapshot(
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
  /**
   * 本次操作前已经核对的状态或阶段，用于保持旧值和失败恢复。
   */
  previous,
) {
  await assertMember(deps)

  /**
   * 当前可信家庭资料，用于再次核对真实成员资格。
   */
  const home = await deps.repository.getHousehold(deps.householdId)

  /**
   * 本次当前可选择的类目，不从其他家庭读取。
   */
  const categories = (await deps.repository.findCategoriesByHousehold(deps.householdId)).filter(
    /**
     * 按当前类型、范围或状态保留符合条件的项，返回独立列表。
     */
    (
      /**
       * 当前集合中的单项，使用所在集合的既有范围和检查规则。
       */
      item,
    ) => !Array.isArray(item.isHiddenBy) || !item.isHiddenBy.includes(deps.identityKey),
  )

  /**
   * 当前家庭中有效成员的内部引用，只在可信后台查回。
   */
  const memberIds = Array.isArray(home && home.memberKeys) ? home.memberKeys : []
  if (!memberIds.includes(deps.identityKey) || memberIds.length > 16 || categories.length > 128)
    reject('LEDGER_FORBIDDEN')

  /**
   * 本页短编号与正式资料的稳定对应，不随模型输出更改。
   */
  const maps = previous || {
    categories: categories.map(
      /**
       * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
       */
      (
        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        item,
        /**
         * 当前清单位置，仅用于稳定排序和逐笔显示。
         */
        index,
      ) => ({ key: `c${index + 1}`, id: item._id }),
    ),
    members: memberIds.map(
      /**
       * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
       */
      (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
        /**
         * 当前清单位置，仅用于稳定排序和逐笔显示。
         */
        index,
      ) => ({ key: `m${index + 1}`, hash: digest(id, deps, 'member') }),
    ),
  }

  /**
   * 当前成员的最少显示资料，不发送整个个人档案。
   */
  const memberProfiles = await Promise.all(
    memberIds.map(
      /**
       * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
       */
      async (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => ({ id, profile: await deps.repository.getProfileForMember(id) }),
    ),
  )

  /**
   * 本次已经固定的成员、类目或微信调用上下文，不接受文字自报身份。
   */
  const context = {
    anchorDay: new Date(nowMs(deps) + 8 * 3_600_000).toISOString().slice(0, 10),
    categories: maps.categories.flatMap(
      /**
       * 按当前有效范围展开短编号资料，不把已失效类目或成员带入请求。
       */
      (
        /**
         * 短编号与当前允许资料的对应关系，不由模型自行创建。
         */
        mapping,
      ) => {
        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        const item = categories.find(
          /**
           * 按当前稳定字段匹配单项，供后续核对；没有匹配时保持空值。
           */
          (
            /**
             * 当前允许类目记录，用于核对家庭、可见性和餐段适用范围。
             */
            category,
          ) => category._id === mapping.id,
        )
        return item
          ? [{ key: mapping.key, name: item.name, dining: item.key === 'dining' && !item.isCustom }]
          : []
      },
    ),
    members: maps.members.flatMap(
      /**
       * 按当前有效范围展开短编号资料，不把已失效类目或成员带入请求。
       */
      (
        /**
         * 短编号与当前允许资料的对应关系，不由模型自行创建。
         */
        mapping,
      ) => {
        /**
         * 当前有效家庭成员的显示资料或对应记录。
         */
        const member = memberProfiles.find(
          /**
           * 按当前稳定字段匹配单项，供后续核对；没有匹配时保持空值。
           */
          (
            /**
             * 当前集合中的单项，使用所在集合的既有范围和检查规则。
             */
            item,
          ) => digest(item.id, deps, 'member') === mapping.hash,
        )
        return member
          ? [
              {
                key: mapping.key,
                name: String((member.profile && member.profile.nickname) || '家庭成员').slice(0, 64),
                self: member.id === deps.identityKey,
              },
            ]
          : []
      },
    ),
  }
  if (!context.categories.length || !context.members.length) reject('LEDGER_DRAFT_INVALID')
  return { maps, context, memberIds }
}
/** 一次检查完整清单，人工编辑也不能绕过金额、类目和成员边界。 */
function validateEntries(
  /**
   * 当前完整待核对清单，必须保留每笔稳定编号并遵守十笔上限。
   */
  entries,
  /**
   * 本次已经固定的成员、类目或微信调用上下文，不接受文字自报身份。
   */
  context,
  /**
   * 是否要求所有必要字段齐全，未齐全只能继续补问。
   */
  complete = false,
) {
  if (!Array.isArray(entries) || entries.length > 10 || (complete && entries.length === 0))
    reject('LEDGER_DRAFT_LIMIT')

  /**
   * 当前清单已经出现的稳定编号集合，用于拒绝重复项目。
   */
  const ids = new Set()

  /**
   * 当前集合中的单项，使用所在集合的既有范围和检查规则。
   */
  for (const item of entries) {
    exact(item, ENTRY_KEYS)
    if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(item.id) || ids.has(item.id)) reject()
    ids.add(item.id)
    if (item.type !== null && !['income', 'expense'].includes(item.type)) reject()
    if (
      item.amountCents !== null &&
      (!Number.isSafeInteger(item.amountCents) || item.amountCents < 1 || item.amountCents > 999_999_999)
    )
      reject('LEDGER_AMOUNT_INVALID')
    if (item.date !== null && !validDay(item.date)) reject('LEDGER_TIME_INVALID')
    // 日期范围继续复用原账本规则，不让已知无效日期等到正式写入才暴露。
    if (item.date !== null) _internal.validateOccurredAt(`${item.date}T00:00:00.000Z`)

    /**
     * 当前允许类目记录，用于核对家庭、可见性和餐段适用范围。
     */
    const category = context.categories.find(
      /**
       * 按当前稳定字段匹配单项，供后续核对；没有匹配时保持空值。
       */
      (
        /**
         * 当前待检查或转换的值，通过对应规则后才能使用。
         */
        value,
      ) => value.key === item.categoryKey,
    )
    if (item.categoryKey !== null && !category) reject('LEDGER_CATEGORY_NOT_FOUND')
    if (
      item.memberKey !== null &&
      !context.members.some(
        /**
         * 核对集合中是否存在符合当前条件的项，返回布尔结果。
         */
        (
          /**
           * 当前待检查或转换的值，通过对应规则后才能使用。
           */
          value,
        ) => value.key === item.memberKey,
      )
    )
      reject('LEDGER_PAYER_NOT_MEMBER')
    if (
      typeof item.note !== 'string' ||
      item.note.length > 100 ||
      (item.mealPeriod !== null &&
        (!category || !category.dining || !['breakfast', 'lunch', 'dinner'].includes(item.mealPeriod)))
    )
      reject()
    if (
      complete &&
      [item.type, item.amountCents, item.date, item.categoryKey, item.memberKey].some(
        /**
         * 核对集合中是否存在符合当前条件的项，返回布尔结果。
         */
        (
          /**
           * 当前待检查或转换的值，通过对应规则后才能使用。
           */
          value,
        ) => value === null,
      )
    )
      reject('LEDGER_DRAFT_INCOMPLETE')
  }
  return entries
}
/** 返回最少页面内容，原话只留在本页不透明状态中。 */
function response(
  /**
   * 已经签封或等待检查的完整有限状态，不写入持久草稿。
   */
  payload,
  /**
   * 本次已经固定的成员、类目或微信调用上下文，不接受文字自报身份。
   */
  context,
  /**
   * 检查后需要用户补充的有限问句，不表示保存已经完成。
   */
  question,
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  return {
    status: question ? 'DRAFT_CLARIFY' : 'DRAFT_READY',
    retryable: false,
    sealed: seal(payload, deps),
    draft: {
      id: payload.draft.id,
      revision: payload.draft.revision,
      anchorDay: payload.draft.anchorDay,
      expiresAt: payload.draft.expiresAt,
      entries: payload.draft.entries,
    },
    categories: context.categories,
    members: context.members,
    question,
  }
}
/** 接收输入或补充，一次调用本机底座，不保存消费原话。 */
async function understandDraft(
  /**
   * 本次动作收到的有限输入，所有身份及保存许可仍从可信后台核对。
   */
  input,
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  if (
    input.consent !== true ||
    typeof input.text !== 'string' ||
    !input.text.trim() ||
    [...input.text].length > 4000 ||
    !/^[0-9a-f-]{36}$/.test(input.requestId || '') ||
    !/^[0-9a-f-]{36}$/.test(input.draftId || '')
  )
    reject()

  /**
   * 当前操作之前已经存在的记录，用于核对版本和保持成功事实。
   */
  const old = input.sealed ? unseal(input.sealed, deps) : null
  if (old && old.draft.id !== input.draftId) reject()

  /**
   * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
   */
  const data = await snapshot(deps, old && old.maps)
  // 资料准备也消耗原平台期限，不能在真正发出模型请求时重新取得完整六十秒。
  const timeoutMs = Math.floor(Math.min(60_000, (deps.aiDeadline || nowMs(deps) + 60_000) - nowMs(deps)))
  if (timeoutMs < 1000) reject('LEDGER_AI_TIMEOUT')

  /**
   * 当前请求、选择或事务返回的结果，不能仅凭文字宣称已保存。
   */
  const result = await deps.aiCenter({
    timeoutMs,
    application: 'cohabitation-life',
    userRef: digest(deps.identityKey, deps, 'owner'),
    householdRef: digest(deps.householdId, deps, 'home'),
    requestId: input.requestId,
    draftId: input.draftId,
    text: input.text,
    previous: old ? old.draft : null,
    context: data.context,
  })
  await assertMember(deps)
  if (deps.aiDeadline && nowMs(deps) >= deps.aiDeadline) reject('LEDGER_AI_TIMEOUT')
  if (
    !result ||
    !['ready', 'clarify'].includes(result.status) ||
    typeof result.question !== 'string' ||
    result.question.length > 300
  )
    reject('LEDGER_AI_RESPONSE')

  /**
   * 当前页未确认的有限状态，不能直接当作正式账目。
   */
  const draft = result.draft
  exact(draft, ['id', 'revision', 'anchorDay', 'expiresAt', 'sources', 'entries'])
  validateEntries(draft.entries, data.context, result.status === 'ready')
  if (
    !/^[0-9a-f-]{36}$/.test(draft.id) ||
    !Number.isSafeInteger(draft.revision) ||
    !validDay(draft.anchorDay) ||
    draft.expiresAt <= nowMs(deps) ||
    draft.expiresAt > nowMs(deps) + 900_000 ||
    !Array.isArray(draft.sources)
  )
    reject('LEDGER_AI_RESPONSE')
  if (
    old &&
    (draft.id !== old.draft.id ||
      draft.expiresAt !== old.draft.expiresAt ||
      draft.anchorDay !== old.draft.anchorDay ||
      draft.revision !== old.draft.revision + 1)
  )
    reject('LEDGER_AI_RESPONSE')

  /**
   * 已经签封或等待检查的完整有限状态，不写入持久草稿。
   */
  const payload = {
    v: 1,
    owner: digest(deps.identityKey, deps, 'owner'),
    home: digest(deps.householdId, deps, 'home'),
    draft,
    maps: data.maps,
  }
  return response(
    payload,
    data.context,
    result.status === 'clarify' ? result.question || '请补充必要信息。' : '',
    deps,
  )
}
/** 人工编辑或移除只更新当前已存在项目，随后必须重新确认。 */
async function editDraft(
  /**
   * 本次动作收到的有限输入，所有身份及保存许可仍从可信后台核对。
   */
  input,
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  /**
   * 已经签封或等待检查的完整有限状态，不写入持久草稿。
   */
  const payload = unseal(input.sealed, deps)

  /**
   * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
   */
  const data = await snapshot(deps, payload.maps)
  validateEntries(input.entries, data.context)
  if (
    input.entries.some(
      /**
       * 核对集合中是否存在符合当前条件的项，返回布尔结果。
       */
      (
        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        item,
      ) =>
        !payload.draft.entries.some(
          /**
           * 核对集合中是否存在符合当前条件的项，返回布尔结果。
           */
          (
            /**
             * 当前操作之前已经存在的记录，用于核对版本和保持成功事实。
             */
            old,
          ) => old.id === item.id,
        ),
    )
  )
    reject()
  payload.draft.entries = structuredClone(input.entries)
  payload.draft.revision++
  // 已形成确认后发生编辑，先持久撤回旧确认；控制资料仍不含未保存正文。
  if (input.batchId) {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.batchId)) reject()
    await deps.repository.runTransaction(
      /**
       * 处理当前已固定的输入或状态，返回本步骤结果，不自行扩大所属或重发请求。
       */
      async (
        /**
         * 同一次事务的读写视图，用于一起核对账目、去重和控制状态。
         */
        tx,
      ) => {
        /**
         * 当前批次的控制资料和逐项结果，不包含未保存消费正文。
         */
        const batch = await tx.getBatch(input.batchId)
        if (
          !batch ||
          batch.owner !== deps.identityKey ||
          batch.householdId !== deps.householdId ||
          batch.draftId !== payload.draft.id
        )
          reject('LEDGER_FORBIDDEN')
        if (
          batch.version !== input.version ||
          batch.confirmUntil <= nowMs(deps) ||
          (batch.attempt && batch.attempt.until > nowMs(deps)) ||
          batch.items.some(
            /**
             * 核对集合中是否存在符合当前条件的项，返回布尔结果。
             */
            (
              /**
               * 当前集合中的单项，使用所在集合的既有范围和检查规则。
               */
              item,
            ) => item.status === 'unknown',
          )
        )
          reject('LEDGER_BATCH_CHECK_FIRST')
        batch.invalidated = true
        batch.editRevision = payload.draft.revision
        await tx.setBatch(batch)
      },
    )
  }

  /**
   * 是否要求所有必要字段齐全，未齐全只能继续补问。
   */
  let complete = true
  try {
    validateEntries(input.entries, data.context, true)
  } catch {
    complete = false
  }
  return response(
    payload,
    data.context,
    complete
      ? ''
      : input.entries.length
        ? '请补齐或重新描述缺少的信息。'
        : '清单为空，请重新描述要记录的收支。',
    deps,
  )
}
/** 仅停止本人确切请求，不接收可执行正文。 */
async function cancelDraft(
  /**
   * 本次动作收到的有限输入，所有身份及保存许可仍从可信后台核对。
   */
  input,
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  await assertMember(deps)
  if (!/^[0-9a-f-]{36}$/.test(input.requestId || '') || !/^[0-9a-f-]{36}$/.test(input.draftId || '')) reject()
  await deps.aiCenterCancel({
    application: 'cohabitation-life',
    userRef: digest(deps.identityKey, deps, 'owner'),
    householdRef: digest(deps.householdId, deps, 'home'),
    requestId: input.requestId,
    draftId: input.draftId,
  })
  return { status: 'DRAFT_CANCELLED', retryable: false }
}
/** 正式保存前转换完整已确认内容，真实成员仍由当前家庭查回。 */
async function confirmedEntries(
  /**
   * 仅在受信服务之间使用的凭据或状态证明，不作为模型资料。
   */
  token,
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  /**
   * 已经签封或等待检查的完整有限状态，不写入持久草稿。
   */
  const payload = unseal(token, deps)

  /**
   * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
   */
  const data = await snapshot(deps, payload.maps)
  validateEntries(payload.draft.entries, data.context, true)
  return {
    draft: payload.draft,
    entries: payload.draft.entries.map(
      /**
       * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
       */
      (
        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        item,
      ) => ({
        itemId: item.id,
        type: item.type,
        amountCents: item.amountCents,
        note: item.note,
        mealPeriod: item.mealPeriod,
        occurredAt: `${item.date}T00:00:00.000Z`,
        categoryId: data.maps.categories.find(
          /**
           * 按当前稳定字段匹配单项，供后续核对；没有匹配时保持空值。
           */
          (
            /**
             * 当前允许类目记录，用于核对家庭、可见性和餐段适用范围。
             */
            category,
          ) => category.key === item.categoryKey,
        ).id,
        payerMemberKey: data.memberIds.find(
          /**
           * 按当前稳定字段匹配单项，供后续核对；没有匹配时保持空值。
           */
          (
            /**
             * 当前记录的稳定编号，只在已经核对的范围内查回。
             */
            id,
          ) =>
            digest(id, deps, 'member') ===
            data.maps.members.find(
              /**
               * 按当前稳定字段匹配单项，供后续核对；没有匹配时保持空值。
               */
              (
                /**
                 * 当前有效家庭成员的显示资料或对应记录。
                 */
                member,
              ) => member.key === item.memberKey,
            ).hash,
        ),
      }),
    ),
  }
}

module.exports = {
  understandDraft,
  editDraft,
  cancelDraft,
  confirmedEntries,
  assertMember,
  digest,
  reject,
  nowMs,
  validDay,
}
