/** 文件用途：检查回执到期回收、未知版本保护和单条失败，不接触真实账本。 */
export {}
/** 清理纯规则不初始化SDK。 */
const { cleanupBatches } = require('../../cloudfunctions/cleanup-ledger-batches/cleanup-domain')
/** 检查“只删除固定格式且已经到期的回执，失败计数且不删除其他业务资料”这一场景，等待结束后核对实际结果。 */
async function verifyExpiredReceipts() {
  /**
   * 本轮查到的有限原记录，逐条核对后才回收。
   */
  const records = [
    { _id: `lbatch_${'a'.repeat(43)}`, v: 1, expiresAt: 100 },
    { _id: `lbatch_${'b'.repeat(43)}`, v: 1, expiresAt: 99 },
    { _id: `lbatch_${'c'.repeat(43)}`, v: 2, expiresAt: 1 },
    { _id: `lbatch_${'d'.repeat(43)}`, v: 1, expiresAt: 101 },
    { _id: 'ledger_success_entry', v: 1, expiresAt: 1 },
  ]

  /**
   * 虚构场景的回收动作，用于核对成功和失败数量。
   */
  const remove = jest.fn(
    /**
     * 处理当前已固定的输入或状态，返回本步骤结果，不自行扩大所属或重发请求。
     */
    async (
      /**
       * 当前记录的稳定编号，只在已经核对的范围内查回。
       */
      id: string,
    ) => {
      if (id.includes('b'.repeat(43))) throw new Error('模拟清理失败')
    },
  )

  /**
   * 当前请求、选择或事务返回的结果，不能仅凭文字宣称已保存。
   */
  const result = await cleanupBatches(
    {
      expired:
        /**
         * 读取已到期的有限回执候选，逐条核对后才允许物理回收。
         */
        async () => records,
      remove,
    },
    100,
  )
  expect(result).toEqual({ scanned: 5, deleted: 1, failed: 1 })
  expect(remove).toHaveBeenCalledTimes(2)
}

test('只删除固定格式且已经到期的回执，失败计数且不删除其他业务资料', verifyExpiredReceipts)
