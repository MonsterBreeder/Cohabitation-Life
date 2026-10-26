/** 文件用途：以实际草稿、账本领域和事务替身检查逐笔结果、防重复、权限及无正文留存。 */
export {}
/** 后端与测试使用同一份正式业务代码。 */
const { fixture, readyDraft } = require('../fixtures/ledger-ai.cjs')
/** 正式动作不经过模拟保存方法。 */
const {
  prepareBatch,
  saveBatch,
  queryBatch,
  listBatches,
  stopBatch,
} = require('../../cloudfunctions/ledger/batch-domain')
/** 人工修改仍经过签封和当前允许范围。 */
const { editDraft } = require('../../cloudfunctions/ledger/draft-domain')
/** 每次操作的独立编号来自系统随机源。 */
const { randomUUID } = require('crypto')
/** 代记仍由真正记账人维护，不将付款人当作创建者。 */
const { getEntry } = require('../../cloudfunctions/ledger/ledger-domain')

/** 检查“一句话多笔真实业务链路”这一场景，等待结束后核对实际结果。 */
function registerBookkeepingChecks() {
  /** 检查“确认后编辑立即撤回旧确认，旧状态和缺失的旧批次都不能重新提交”这一场景，等待结束后核对实际结果。 */
  async function verifyDraftInvalidation() {
    /**
     * 仅含虚构资料的独立检查环境，不触碰真实家庭记录。
     */
    const test = fixture()

    /**
     * 当前页未确认的有限状态，不能直接当作正式账目。
     */
    const draft = await readyDraft(test)

    /**
     * 已经形成的确认结果，此时还没有正式账目。
     */
    const prepared = await prepareBatch({ sealed: draft.sealed, confirmationId: randomUUID() }, test.deps)

    /**
     * 当前完整待核对清单，必须保留每笔稳定编号并遵守十笔上限。
     */
    const entries = draft.draft.entries.map(
      /**
       * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
       */
      (
        /**
         * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
         */
        entry: any,
      ) => ({
        ...entry,
        amountCents: entry.id === 'item_dining' ? 6000 : entry.amountCents,
      }),
    )

    /**
     * 人工修改并重新检查后的当前页状态。
     */
    const edited = await editDraft(
      { sealed: draft.sealed, entries, batchId: prepared.batchId, version: prepared.version },
      test.deps,
    )
    await expect(
      saveBatch({ ...prepared, sealed: draft.sealed, attemptId: randomUUID() }, test.deps),
    ).rejects.toThrow('LEDGER_BATCH_CHANGED')
    await expect(
      prepareBatch({ ...prepared, sealed: draft.sealed, confirmationId: randomUUID() }, test.deps),
    ).rejects.toThrow('LEDGER_BATCH_CHANGED')

    /**
     * 新确认版本的控制结果，旧确认不能继续使用。
     */
    const updated = await prepareBatch(
      { ...prepared, sealed: edited.sealed, confirmationId: randomUUID() },
      test.deps,
    )
    await saveBatch({ ...updated, sealed: edited.sealed, attemptId: randomUUID() }, test.deps)
    expect(
      [...test.entries.values()].map(
        /**
         * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
         */
        (
          /**
           * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
           */
          entry: any,
        ) => entry.amountCents,
      ),
    ).toEqual([6000, 10000])
    await expect(
      prepareBatch(
        {
          sealed: edited.sealed,
          batchId: `lbatch_${'x'.repeat(43)}`,
          version: 1,
          confirmationId: randomUUID(),
        },
        test.deps,
      ),
    ).rejects.toThrow('LEDGER_BATCH_NOT_FOUND')
  }

  it('确认后编辑立即撤回旧确认，旧状态和缺失的旧批次都不能重新提交', verifyDraftInvalidation)
  /** 检查“同次确认、并发保存及返回丢失不会重复，另一笔同额真实消费仍可记录”这一场景，等待结束后核对实际结果。 */
  async function verifyConcurrentSave() {
    /**
     * 仅含虚构资料的独立检查环境，不触碰真实家庭记录。
     */
    const test = fixture()

    /**
     * 当前页未确认的有限状态，不能直接当作正式账目。
     */
    const draft = await readyDraft(test)

    /**
     * 同次形成确认时固定的引用，重发不能另建一批。
     */
    const confirmationId = randomUUID()

    /**
     * 已经形成的确认结果，此时还没有正式账目。
     */
    const prepared = await prepareBatch({ sealed: draft.sealed, confirmationId }, test.deps)
    expect((await prepareBatch({ sealed: draft.sealed, confirmationId }, test.deps)).batchId).toBe(
      prepared.batchId,
    )

    /**
     * 本次动作收到的有限输入，所有身份及保存许可仍从可信后台核对。
     */
    const input = {
      sealed: draft.sealed,
      batchId: prepared.batchId,
      version: prepared.version,
      attemptRevision: prepared.attemptRevision,
      attemptId: randomUUID(),
    }

    /**
     * 本次并行或逐项检查的实际结果，每项分别核对。
     */
    const results = await Promise.allSettled([saveBatch(input, test.deps), saveBatch(input, test.deps)])
    expect(
      results.some(
        /**
         * 核对集合中是否存在符合当前条件的项，返回布尔结果。
         */
        (
          /**
           * 当前集合中的单项，使用所在集合的既有范围和检查规则。
           */
          item,
        ) => item.status === 'fulfilled',
      ),
    ).toBe(true)
    expect(test.entries.size).toBe(2)

    /**
     * 为另一成员代记的实际记录，用于核对创建者维护权。
     */
    const forPartner = [...test.entries.values()].find(
      /**
       * 按当前稳定字段匹配单项，供后续核对；没有匹配时保持空值。
       */
      (
        /**
         * 当前需要核对的单笔账目，不能由它决定用户身份或保存许可。
         */
        entry: any,
      ) => entry.payerMemberKey === test.partner,
    )
    expect((await getEntry({ entryId: forPartner._id }, test.deps)).detail.canEdit).toBe(true)
    expect(
      (await getEntry({ entryId: forPartner._id }, { ...test.deps, identityKey: test.partner })).detail
        .canEdit,
    ).toBe(false)
    expect(
      (await queryBatch(input, test.deps)).items.every(
        /**
         * 逐项检查固定结构或最终状态，任一不符即返回否。
         */
        (
          /**
           * 当前集合中的单项，使用所在集合的既有范围和检查规则。
           */
          item: any,
        ) => item.status === 'success',
      ),
    ).toBe(true)
    await saveBatch({ ...input, ...(await queryBatch(input, test.deps)), attemptId: randomUUID() }, test.deps)
    expect(test.entries.size).toBe(2)
    // 明确新尝试结束后，更早请求不能重新获得执行时限。
    await expect(saveBatch(input, test.deps)).rejects.toThrow('LEDGER_BATCH_CHANGED')

    /**
     * 另一次明确消费的独立确认，不能按金额日期误合并。
     */
    const another = await prepareBatch({ sealed: draft.sealed, confirmationId: randomUUID() }, test.deps)
    test.lose()

    /**
     * 返回丢失后实际查回的逐项结果，不把未知冒充失败。
     */
    const interrupted = await saveBatch(
      { ...another, sealed: draft.sealed, attemptId: randomUUID() },
      test.deps,
    )
    expect(test.entries.size).toBe(3)
    expect(
      interrupted.items.map(
        /**
         * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
         */
        (
          /**
           * 当前集合中的单项，使用所在集合的既有范围和检查规则。
           */
          item: any,
        ) => item.status,
      ),
    ).toEqual(['success', 'unexecuted'])
    await saveBatch({ ...interrupted, sealed: draft.sealed, attemptId: randomUUID() }, test.deps)
    expect(test.entries.size).toBe(4)
    expect(
      (await queryBatch({ batchId: another.batchId }, test.deps)).items.every(
        /**
         * 逐项检查固定结构或最终状态，任一不符即返回否。
         */
        (
          /**
           * 当前集合中的单项，使用所在集合的既有范围和检查规则。
           */
          item: any,
        ) => item.status === 'success',
      ),
    ).toBe(true)

    /**
     * 本次完整序列化资料，按实际字节限制，不记录到日志。
     */
    const raw = JSON.stringify([...test.batches.values()])
    expect(raw).not.toContain('amountCents')
    expect(raw).not.toContain('昨天我')
    expect(raw).not.toContain('note')
    expect(raw).not.toContain('sealed')
  }

  it('同次确认、并发保存及返回丢失不会重复，另一笔同额真实消费仍可记录', verifyConcurrentSave)

  /** 检查“单项类目失效不回退成功，修改失败项后重新确认只补一笔”这一场景，等待结束后核对实际结果。 */
  async function verifyPartialRetry() {
    /**
     * 仅含虚构资料的独立检查环境，不触碰真实家庭记录。
     */
    const test = fixture()

    /**
     * 当前页未确认的有限状态，不能直接当作正式账目。
     */
    const draft = await readyDraft(test)

    /**
     * 已经形成的确认结果，此时还没有正式账目。
     */
    const prepared = await prepareBatch({ sealed: draft.sealed, confirmationId: randomUUID() }, test.deps)

    /**
     * 本场景已经走过的写入边界计数，用于准确注入故障。
     */
    let writes = 0
    test.before(
      /**
       * 在本场景指定的事务边界模拟故障或资格变化，返回后继续实际规则检查。
       */
      () => {
        writes++
        // 保存资格取得后、第二笔检查前隐藏其类目，模拟并行维护。
        if (writes === 3) test.categories.get('cat_test_fun').isHiddenBy = [test.owner]
      },
    )

    /**
     * 第一轮或第一次提交的真实检查结果，供后续接续核对。
     */
    const first = await saveBatch({ ...prepared, sealed: draft.sealed, attemptId: randomUUID() }, test.deps)
    expect(
      first.items.map(
        /**
         * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
         */
        (
          /**
           * 当前集合中的单项，使用所在集合的既有范围和检查规则。
           */
          item: any,
        ) => item.status,
      ),
    ).toEqual(['success', 'failed'])
    expect(test.entries.size).toBe(1)
    test.before(null)

    /**
     * 人工修改并重新检查后的当前页状态。
     */
    const edited = await editDraft(
      {
        sealed: draft.sealed,
        entries: draft.draft.entries.map(
          /**
           * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
           */
          (
            /**
             * 当前集合中的单项，使用所在集合的既有范围和检查规则。
             */
            item: any,
          ) => (item.id === 'item_fun' ? { ...item, categoryKey: 'c1' } : item),
        ),
      },
      test.deps,
    )

    /**
     * 只对未成功项重新确认后的结果。
     */
    const retry = await prepareBatch(
      {
        sealed: edited.sealed,
        confirmationId: randomUUID(),
        batchId: prepared.batchId,
        version: first.version,
      },
      test.deps,
    )

    /**
     * 本场景最后实际查回的结果，需与正式记录数核对。
     */
    const final = await saveBatch({ ...retry, sealed: edited.sealed, attemptId: randomUUID() }, test.deps)
    expect(
      final.items.every(
        /**
         * 逐项检查固定结构或最终状态，任一不符即返回否。
         */
        (
          /**
           * 当前集合中的单项，使用所在集合的既有范围和检查规则。
           */
          item: any,
        ) => item.status === 'success',
      ),
    ).toBe(true)
    expect(test.entries.size).toBe(2)
  }

  it('单项类目失效不回退成功，修改失败项后重新确认只补一笔', verifyPartialRetry)

  /** 检查“签封换用户、改正文、过期及明确停止拒绝；退出回查不恢复清单”这一场景，等待结束后核对实际结果。 */
  async function verifyRecorderRights() {
    /**
     * 仅含虚构资料的独立检查环境，不触碰真实家庭记录。
     */
    const test = fixture()

    /**
     * 当前页未确认的有限状态，不能直接当作正式账目。
     */
    const draft = await readyDraft(test)
    await expect(
      editDraft({ sealed: draft.sealed + 'x', entries: draft.draft.entries }, test.deps),
    ).rejects.toThrow()
    await expect(
      prepareBatch(
        { sealed: draft.sealed, confirmationId: randomUUID() },
        { ...test.deps, identityKey: test.partner },
      ),
    ).rejects.toThrow('LEDGER_FORBIDDEN')

    /**
     * 已经形成的确认结果，此时还没有正式账目。
     */
    const prepared = await prepareBatch({ sealed: draft.sealed, confirmationId: randomUUID() }, test.deps)
    await stopBatch(prepared, test.deps)
    await expect(
      saveBatch({ ...prepared, sealed: draft.sealed, attemptId: randomUUID() }, test.deps),
    ).rejects.toThrow('LEDGER_BATCH_CHANGED')
    expect(test.entries.size).toBe(0)

    /**
     * 退出后可查的无正文原结果列表，不恢复失败清单。
     */
    const listing = await listBatches({}, test.deps)
    expect(JSON.stringify(listing)).not.toContain('amountCents')
    expect(listing.batches).toHaveLength(1)
    test.advance(30 * 86400000)
    await expect(queryBatch(prepared, test.deps)).rejects.toThrow('LEDGER_BATCH_EXPIRED')
    expect((await listBatches({}, test.deps)).batches).toHaveLength(0)
  }

  it('签封换用户、改正文、过期及明确停止拒绝；退出回查不恢复清单', verifyRecorderRights)
}

describe('一句话多笔真实业务链路', registerBookkeepingChecks)
