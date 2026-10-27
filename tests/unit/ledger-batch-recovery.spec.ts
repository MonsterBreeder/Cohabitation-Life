/** 文件用途：检查未知结果的过期隔离和原权限撤回，防止旧尝试恢复写入。 */
export {}
/** 独立内存事务，无真实用户账目。 */
const { fixture, readyDraft } = require('../fixtures/ledger-ai.cjs')
/** 实际业务动作共同检查控制版本和事务事实。 */
const { prepareBatch, saveBatch, queryBatch } = require('../../cloudfunctions/ledger/batch-domain')
/** 每次明确尝试有自己的引用。 */
const { randomUUID } = require('crypto')

/** 检查“事务结果未知先核对，旧执行期限结束并隔离后才允许明确重试”这一场景，等待结束后核对实际结果。 */
async function verifyUnknownRecovery() {
  /**
   * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
   */
  const data = fixture()

  /**
   * 当前页未确认的有限状态，不能直接当作正式账目。
   */
  const draft = await readyDraft(data)

  /**
   * 已经形成的确认结果，此时还没有正式账目。
   */
  const prepared = await prepareBatch({ sealed: draft.sealed, confirmationId: randomUUID() }, data.deps)

  /**
   * 本场景已经进入的事务数量，用于模拟准确的失败边界。
   */
  let transactions = 0
  data.before(
    /**
     * 在本场景指定的事务边界模拟故障或资格变化，返回后继续实际规则检查。
     */
    () => {
      transactions++
      if (transactions === 2) throw new Error('模拟首次写入无法确定结果')
    },
  )

  /**
   * 原始保存尝试的固定引用和版本，用于核对迟到重放。
   */
  const original = { ...prepared, sealed: draft.sealed, attemptId: randomUUID() }

  /**
   * 尚不能确定是否写入的原结果，必须先查回再处理。
   */
  const unknown = await saveBatch(original, data.deps)
  expect(unknown.items[0].status).toBe('unknown')
  expect(data.entries.size).toBe(0)
  await expect(
    saveBatch({ ...unknown, sealed: draft.sealed, attemptId: randomUUID() }, data.deps),
  ).rejects.toThrow('LEDGER_BATCH_BUSY')
  data.before(null)
  data.advance(31000)

  /**
   * 原结果已经核对后的控制状态，不能直接重建账目。
   */
  const checked = await queryBatch(prepared, data.deps)
  expect(checked.items[0].status).toBe('failed')

  /**
   * 用户明确重试后的实际逐项结果。
   */
  const retried = await saveBatch({ ...checked, sealed: draft.sealed, attemptId: randomUUID() }, data.deps)
  expect(
    retried.items.every(
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
  expect(data.entries.size).toBe(2)
  await expect(saveBatch(original, data.deps)).rejects.toThrow('LEDGER_BATCH_CHANGED')
  expect(data.entries.size).toBe(2)
}

test('事务结果未知先核对，旧执行期限结束并隔离后才允许明确重试', verifyUnknownRecovery)

/** 检查“第一笔完成后成员资格撤回，第二笔不写入且已成功账目保留”这一场景，等待结束后核对实际结果。 */
async function verifyMembershipRevocation() {
  /**
   * 当前步骤取得或准备的有限资料，核对范围后才继续使用。
   */
  const data = fixture()

  /**
   * 当前页未确认的有限状态，不能直接当作正式账目。
   */
  const draft = await readyDraft(data)

  /**
   * 已经形成的确认结果，此时还没有正式账目。
   */
  const prepared = await prepareBatch({ sealed: draft.sealed, confirmationId: randomUUID() }, data.deps)

  /**
   * 本场景已经进入的事务数量，用于模拟准确的失败边界。
   */
  let transactions = 0
  data.before(
    /**
     * 在本场景指定的事务边界模拟故障或资格变化，返回后继续实际规则检查。
     */
    () => {
      transactions++
      if (transactions === 3) data.home.memberKeys = []
    },
  )
  await expect(
    saveBatch({ ...prepared, sealed: draft.sealed, attemptId: randomUUID() }, data.deps),
  ).rejects.toThrow('LEDGER_FORBIDDEN')
  expect(data.entries.size).toBe(1)
  expect(
    [...data.batches.values()][0].items.map(
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
}

test('第一笔完成后成员资格撤回，第二笔不写入且已成功账目保留', verifyMembershipRevocation)
