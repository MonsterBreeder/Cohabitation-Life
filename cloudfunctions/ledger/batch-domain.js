/** 文件用途：以无正文批次凭据逐笔保存账目，隔离成功、失败、未知和停止后的未执行状态。 */
const crypto = require('crypto')
/** 正式写入仍复用唯一账本检查和事务。 */
const { addEntry, LedgerDomainError } = require('./ledger-domain')
/** 原话和未确认清单只从当前页签封状态中取得。 */
const { confirmedEntries, assertMember, digest, reject, nowMs } = require('./draft-domain')

/** 操作编号有界，不能借路径或任意数据库编号选目标。 */
function validId(
  /**
   * 当前记录的稳定编号，只在已经核对的范围内查回。
   */
  id,
) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(id)
}
/** 对规范字段建立摘要，确认后不能替换金额或收款人。 */
function entryHash(
  /**
   * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
   */
  entry,
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  return digest(
    JSON.stringify([
      entry.itemId,
      entry.type,
      entry.amountCents,
      entry.categoryId,
      entry.payerMemberKey,
      entry.occurredAt,
      entry.note,
      entry.mealPeriod,
    ]),
    deps,
    'confirmed-entry',
  )
}
/** 只返回状态和成功引用，不保留未保存金额或备注。 */
function result(
  /**
   * 当前批次的控制资料和逐项结果，不包含未保存消费正文。
   */
  batch,
) {
  return {
    status: 'BATCH_RESULT',
    retryable: false,
    batchId: batch._id,
    version: batch.version,
    attemptRevision: batch.attemptRevision,
    expiresAt: batch.expiresAt,
    items: batch.items.map(
      /**
       * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
       */
      (
        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        item,
      ) => ({
        itemId: item.itemId,
        status: item.status,
        entryId: item.entryId || null,
        code: item.code || null,
      }),
    ),
  }
}
/** 所属及结果保留期在读取和事务中重复检查。 */
function assertBatch(
  /**
   * 当前批次的控制资料和逐项结果，不包含未保存消费正文。
   */
  batch,
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
  /**
   * 是否正在执行保存；为真时还需检查确认期限，而非只核对结果保留期。
   */
  saving = false,
) {
  if (!batch || batch.v !== 1) reject('LEDGER_BATCH_NOT_FOUND')
  if (batch.owner !== deps.identityKey || batch.householdId !== deps.householdId) reject('LEDGER_FORBIDDEN')
  if (batch.expiresAt <= nowMs(deps) || (saving && batch.confirmUntil <= nowMs(deps)))
    reject('LEDGER_BATCH_EXPIRED')
}
/** 将本页最终清单固定为有期限的确认；同次重复准备不能建立第二批。 */
async function prepareBatch(
  /**
   * 本次动作收到的有限输入，所有身份及保存许可仍从可信后台核对。
   */
  input,
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  if (!validId(input.confirmationId)) reject()

  /**
   * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
   */
  const data = await confirmedEntries(input.sealed, deps)

  /**
   * 当前记录的稳定编号，只在已经核对的范围内查回。
   */
  const id =
    input.batchId ||
    `lbatch_${digest(`${deps.identityKey}:${data.draft.id}:${input.confirmationId}`, deps, 'batch-id')}`
  if (!validId(id)) reject()
  return deps.repository.runTransaction(
    /**
     * 处理当前已固定的输入或状态，返回本步骤结果，不自行扩大所属或重发请求。
     */
    async (
      /**
       * 同一次事务的读写视图，用于一起核对账目、去重和控制状态。
       */
      tx,
    ) => {
      await assertMember(deps)

      /**
       * 当前操作之前已经存在的记录，用于核对版本和保持成功事实。
       */
      const old = await tx.getBatch(id)
      if (input.batchId && !old) reject('LEDGER_BATCH_NOT_FOUND')

      /**
       * 可信时钟的当前毫秒值，用于核对原期限而非刷新期限。
       */
      const now = nowMs(deps)
      if (old) {
        assertBatch(old, deps, true)
        if (old.draftId !== data.draft.id || (old.editRevision && data.draft.revision < old.editRevision))
          reject('LEDGER_BATCH_CHANGED')
        if (old.attempt && old.attempt.until > now) reject('LEDGER_BATCH_BUSY')
        if (old.confirmationId === input.confirmationId) {
          if (
            data.entries.length !== old.items.length ||
            data.entries.some(
              /**
               * 核对集合中是否存在符合当前条件的项，返回布尔结果。
               */
              (
                /**
                 * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
                 */
                entry,
              ) =>
                !old.items.some(
                  /**
                   * 核对集合中是否存在符合当前条件的项，返回布尔结果。
                   */
                  (
                    /**
                     * 当前集合中的单项，使用所在集合的既有范围和检查规则。
                     */
                    item,
                  ) => item.itemId === entry.itemId && item.hash === entryHash(entry, deps),
                ),
            )
          )
            reject('LEDGER_BATCH_CHANGED')
          if (old.invalidated) reject('LEDGER_BATCH_CHANGED')
          return result(old)
        }
        if (
          old.version !== input.version ||
          old.items.some(
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
        if (
          old.items.some(
            /**
             * 核对集合中是否存在符合当前条件的项，返回布尔结果。
             */
            (
              /**
               * 当前集合中的单项，使用所在集合的既有范围和检查规则。
               */
              item,
            ) =>
              item.status === 'success' &&
              data.entries.some(
                /**
                 * 核对集合中是否存在符合当前条件的项，返回布尔结果。
                 */
                (
                  /**
                   * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
                   */
                  entry,
                ) => entry.itemId === item.itemId && entryHash(entry, deps) !== item.hash,
              ),
          )
        )
          reject('LEDGER_BATCH_CHANGED')
      }

      /**
       * 已经正式成功的项目，后续编辑和重试都不能解锁它们。
       */
      const successful = old
        ? old.items.filter(
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
        : []

      /**
       * 按稳定编号组织的本批项目和状态，不丢掉后半段结果。
       */
      const items = data.entries
        .filter(
          /**
           * 按当前类型、范围或状态保留符合条件的项，返回独立列表。
           */
          (
            /**
             * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
             */
            entry,
          ) =>
            !successful.some(
              /**
               * 核对集合中是否存在符合当前条件的项，返回布尔结果。
               */
              (
                /**
                 * 当前集合中的单项，使用所在集合的既有范围和检查规则。
                 */
                item,
              ) => item.itemId === entry.itemId,
            ),
        )
        .map(
          /**
           * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
           */
          (
            /**
             * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
             */
            entry,
          ) => ({
            itemId: entry.itemId,
            hash: entryHash(entry, deps),
            requestId: crypto
              .createHash('sha256')
              .update(`${id}:${entry.itemId}:${old ? old.version + 1 : 1}`)
              .digest('hex'),
            status: 'unexecuted',
            entryId: null,
            code: null,
          }),
        )

      /**
       * 当前批次的控制资料和逐项结果，不包含未保存消费正文。
       */
      const batch = {
        _id: id,
        v: 1,
        owner: deps.identityKey,
        householdId: deps.householdId,
        draftId: data.draft.id,
        editRevision: data.draft.revision,
        invalidated: false,
        version: old ? old.version + 1 : 1,
        confirmationId: input.confirmationId,
        confirmUntil: old ? old.confirmUntil : Math.min(now + 900_000, data.draft.expiresAt),
        createdAt: old ? old.createdAt : now,
        expiresAt: old ? old.expiresAt : now + 30 * 86_400_000,
        attempt: null,
        stopped: false,
        lastAttemptId: null,
        // 单调控制版本拒绝更早尝试的迟到重放，不需要保存无限操作列表。
        attemptRevision: old ? old.attemptRevision : 0,
        items: [...successful, ...items],
      }
      // 成功与失败分组只用于检查，不能改变用户原清单的逐笔对应顺序。
      const order = [
        ...(old
          ? old.items.map(
              /**
               * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
               */
              (
                /**
                 * 当前集合中的单项，使用所在集合的既有范围和检查规则。
                 */
                item,
              ) => item.itemId,
            )
          : []),
        ...data.entries.map(
          /**
           * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
           */
          (
            /**
             * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
             */
            entry,
          ) => entry.itemId,
        ),
      ]
      batch.items.sort(
        /**
         * 按原确认清单的稳定顺序比较两项，返回排序差值。
         */
        (
          /**
           * 原清单中参与顺序比较的左项。
           */
          left,
          /**
           * 原清单中参与顺序比较的右项。
           */
          right,
        ) => order.indexOf(left.itemId) - order.indexOf(right.itemId),
      )
      if (batch.items.length > 10 || !batch.items.length) reject('LEDGER_DRAFT_LIMIT')
      await tx.setBatch(batch)
      return result(batch)
    },
  )
}
/** 查回只核对原写入事实，过期执行者通过事务版本写入被隔离。 */
async function queryBatch(
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
  if (!validId(input.batchId)) reject()
  return deps.repository.runTransaction(
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
      assertBatch(batch, deps)
      if (batch.attempt && batch.attempt.until <= nowMs(deps)) {
        // 写入新的控制版本使旧在途事务发生冲突；它重新检查原期限后不能再新增。
        batch.attempt = null

        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        for (const item of batch.items) {
          if (item.status === 'success') continue

          /**
           * 原创建请求的固定去重编号，不能另建编号绕过旧结果。
           */
          const lock = `lcrequest_${crypto.createHash('sha256').update(`${deps.householdId}:${item.requestId}`).digest('hex')}`

          /**
           * 已经提交的原操作事实，用于区分成功和未知。
           */
          const operation = await tx.getOperation(lock)
          if (operation && operation.kind === 'add' && operation.entryId) {
            item.status = 'success'
            item.entryId = operation.entryId
            item.code = null
          } else if (item.status === 'unknown') {
            item.status = 'failed'
            item.code = 'LEDGER_TEMPORARY_FAILURE'
          }
        }
        await tx.setBatch(batch)
      }
      return result(batch)
    },
  )
}
/** 明确取消只撤回尚未开始项，不删除成功账目。 */
async function stopBatch(
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
  if (!validId(input.batchId)) reject()
  return deps.repository.runTransaction(
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
      assertBatch(batch, deps)
      batch.stopped = true
      await tx.setBatch(batch)
      return result(batch)
    },
  )
}
/** 用户明确确认后顺序提交，独立单项失败可继续，共同资格失效立即停止。 */
async function saveBatch(
  /**
   * 本次动作收到的有限输入，所有身份及保存许可仍从可信后台核对。
   */
  input,
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  if (!validId(input.batchId) || !validId(input.attemptId)) reject()

  /**
   * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
   */
  const data = await confirmedEntries(input.sealed, deps)

  /**
   * 本次调用的同一仓储实例，读取和提交都沿用它。
   */
  const repo = deps.repository

  /**
   * 当前批次的控制资料和逐项结果，不包含未保存消费正文。
   */
  const batch = await repo.runTransaction(
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
       * 本次重新查回的确切状态，不能使用过期或被替换的旧值。
       */
      const current = await tx.getBatch(input.batchId)
      assertBatch(current, deps, true)
      if (
        current.version !== input.version ||
        current.stopped ||
        current.invalidated ||
        current.draftId !== data.draft.id ||
        current.editRevision !== data.draft.revision
      )
        reject('LEDGER_BATCH_CHANGED')
      if (current.lastAttemptId === input.attemptId) return null
      if (input.attemptRevision !== current.attemptRevision) reject('LEDGER_BATCH_CHANGED')
      if (current.attempt && current.attempt.until > nowMs(deps)) reject('LEDGER_BATCH_BUSY')
      if (
        current.items.some(
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
      if (
        data.entries.some(
          /**
           * 核对集合中是否存在符合当前条件的项，返回布尔结果。
           */
          (
            /**
             * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
             */
            entry,
          ) =>
            !current.items.some(
              /**
               * 核对集合中是否存在符合当前条件的项，返回布尔结果。
               */
              (
                /**
                 * 当前集合中的单项，使用所在集合的既有范围和检查规则。
                 */
                item,
              ) => item.itemId === entry.itemId && item.hash === entryHash(entry, deps),
            ),
        ) ||
        current.items.some(
          /**
           * 核对集合中是否存在符合当前条件的项，返回布尔结果。
           */
          (
            /**
             * 当前集合中的单项，使用所在集合的既有范围和检查规则。
             */
            item,
          ) =>
            item.status !== 'success' &&
            !data.entries.some(
              /**
               * 核对集合中是否存在符合当前条件的项，返回布尔结果。
               */
              (
                /**
                 * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
                 */
                entry,
              ) => entry.itemId === item.itemId,
            ),
        )
      )
        reject('LEDGER_BATCH_CHANGED')
      current.attempt = {
        id: input.attemptId,
        until: Math.min(nowMs(deps) + 30_000, current.confirmUntil, deps.cloudDeadline || Infinity),
      }
      current.lastAttemptId = input.attemptId
      current.attemptRevision++
      await tx.setBatch(current)
      return current
    },
  )
  if (!batch) return queryBatch(input, deps)

  /**
   * 当前集合中的单项，使用所在集合的既有范围和检查规则。
   */
  for (const item of batch.items) {
    if (item.status === 'success') continue
    if (nowMs(deps) >= batch.attempt.until) break

    /**
     * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
     */
    const entry = data.entries.find(
      /**
       * 按当前稳定字段匹配单项，供后续核对；没有匹配时保持空值。
       */
      (
        /**
         * 当前待检查或转换的值，通过对应规则后才能使用。
         */
        value,
      ) => value.itemId === item.itemId,
    )
    try {
      // 复用原addEntry，包装唯一事务，使成功回执与账目一起提交。
      await addEntry(
        { ...entry, requestId: item.requestId },
        {
          ...deps,
          repository: {
            ...repo,
            runTransaction:
              /**
               * 在隔离的同一事务视图执行工作，成功后一并提交，失败不留下部分记录。
               */
              (
                /**
                 * 在唯一事务视图中执行的保存工作，返回实际提交所需的记录。
                 */
                work,
              ) =>
                repo.runTransaction(
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
                     * 本次重新查回的确切状态，不能使用过期或被替换的旧值。
                     */
                    const current = await tx.getBatch(batch._id)
                    assertBatch(current, deps, true)
                    if (
                      current.stopped ||
                      current.invalidated ||
                      !current.attempt ||
                      current.attempt.id !== input.attemptId ||
                      current.version !== input.version ||
                      nowMs(deps) >= current.attempt.until
                    )
                      reject('LEDGER_BATCH_STOPPED')

                    /**
                     * 当前批次中与稳定项目编号对应的控制行。
                     */
                    const row = current.items.find(
                      /**
                       * 按当前稳定字段匹配单项，供后续核对；没有匹配时保持空值。
                       */
                      (
                        /**
                         * 当前待检查或转换的值，通过对应规则后才能使用。
                         */
                        value,
                      ) => value.itemId === item.itemId,
                    )
                    if (!row || row.status === 'success') reject('LEDGER_BATCH_CHANGED')

                    /**
                     * 当前原始记录，只在核对版本、范围和期限后使用。
                     */
                    const record = await work(tx)
                    row.status = 'success'
                    row.entryId = record._id
                    row.code = null
                    await tx.setBatch(current)
                    return record
                  },
                ),
          },
        },
      )
    } catch (
      /**
       * 本次捕获的异常，只允许固定分类进入显示或控制记录。
       */
      error
    ) {
      /**
       * 本项是否明确独立失败，只有此类失败才允许继续后项。
       */
      const independent =
        error instanceof LedgerDomainError &&
        [
          'LEDGER_AMOUNT_INVALID',
          'LEDGER_TIME_INVALID',
          'LEDGER_CATEGORY_NOT_FOUND',
          'LEDGER_PAYER_NOT_MEMBER',
          'LEDGER_INVALID_REQUEST',
        ].includes(error.code)

      /**
       * 是否属于已确定的停止条件，停止后不启动下一笔写入。
       */
      const stopped =
        error instanceof LedgerDomainError &&
        ['LEDGER_FORBIDDEN', 'LEDGER_BATCH_STOPPED', 'LEDGER_BATCH_CHANGED', 'LEDGER_BATCH_EXPIRED'].includes(
          error.code,
        )
      // 结果未知时不换标识重写；回查控制记录仍没有成功才标未知。
      await repo.runTransaction(
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
           * 本次重新查回的确切状态，不能使用过期或被替换的旧值。
           */
          const current = await tx.getBatch(batch._id)
          assertBatch(current, deps)
          // 原尝试已经被回查隔离或被新尝试取代时，迟到异常不能覆盖新结果。
          if (!current.attempt || current.attempt.id !== input.attemptId) return

          /**
           * 当前批次中与稳定项目编号对应的控制行。
           */
          const row = current.items.find(
            /**
             * 按当前稳定字段匹配单项，供后续核对；没有匹配时保持空值。
             */
            (
              /**
               * 当前待检查或转换的值，通过对应规则后才能使用。
               */
              value,
            ) => value.itemId === item.itemId,
          )
          if (row && row.status !== 'success') {
            row.status = independent ? 'failed' : stopped ? 'unexecuted' : 'unknown'
            row.code = independent || stopped ? error.code : 'LEDGER_BATCH_CHECK_FIRST'
            await tx.setBatch(current)
          }
        },
      )
      if (!independent) break
    }
  }
  await repo.runTransaction(
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
       * 本次重新查回的确切状态，不能使用过期或被替换的旧值。
       */
      const current = await tx.getBatch(batch._id)
      assertBatch(current, deps)
      if (
        current.attempt &&
        current.attempt.id === input.attemptId &&
        !current.items.some(
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
      ) {
        current.attempt = null
        await tx.setBatch(current)
      }
    },
  )
  return queryBatch(input, deps)
}
/** 返回最近批次的无正文状态，退出后不恢复失败清单。 */
async function listBatches(
  /**
   * 本动作不读取用户正文，只保留统一动作调用位置。
   */
  _input,
  /**
   * 可信后台注入的身份、时钟和仓储，不能由页面或模型替换。
   */
  deps,
) {
  await assertMember(deps)

  /**
   * 当前发起者可查的有限批次结果，不恢复原消费描述。
   */
  const batches = await deps.repository.listBatches(deps.identityKey, deps.householdId)
  return {
    status: 'BATCH_LIST',
    retryable: false,
    batches: batches
      .filter(
        /**
         * 按当前类型、范围或状态保留符合条件的项，返回独立列表。
         */
        (
          /**
           * 当前批次的控制资料和逐项结果，不包含未保存消费正文。
           */
          batch,
        ) => batch.expiresAt > nowMs(deps),
      )
      .map(result),
  }
}

module.exports = { prepareBatch, saveBatch, queryBatch, stopBatch, listBatches }
