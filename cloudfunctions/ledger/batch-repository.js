/** 文件用途：为原账本仓储补齐无正文批次和事务内查回能力，不另建账目保存路径。 */
const { withoutDocumentId } = require('./repository-data')

/** 返回固定批次集合的读取和清理接口，调用者仍负责所属核对。 */
function batchRepository(
  /**
   * 已经由云端创建的数据库能力，不向小程序暴露。
   */
  db,
  /**
   * 按指定文档编号读取纯数据的帮助函数，不改变资料所属。
   */
  read,
) {
  /**
   * 本动作固定使用的业务集合，不能由用户选择其他集合。
   */
  const collection = db.collection('ledgerAiBatches')
  return {
    getBatch:
      /**
       * 查回本次无正文批次控制，所属仍由业务层核对。
       */
      (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => read(collection, id),
    listBatches:
      /**
       * 只列出本次发起者在当前家庭的有限回执，不返回原话或清单正文。
       */
      async (
        /**
         * 当前已核对的发起者引用，用于隔离其他成员的草稿与回执。
         */
        owner,
        /**
         * 本次账本目标，仍需由微信身份和成员资格共同核对。
         */
        householdId,
      ) => {
        /**
         * 当前请求、选择或事务返回的结果，不能仅凭文字宣称已保存。
         */
        const result = await collection
          .where({ owner, householdId })
          .orderBy('createdAt', 'desc')
          .limit(20)
          .get()
        return result.data
      },
  }
}
/** 补齐事务视图，账目、创建去重和成功回执必须使用同一个事务。 */
function batchTransaction(
  /**
   * 底层同一事务实例，所有成功事实必须在其中一起提交。
   */
  transaction,
  /**
   * 按指定文档编号读取纯数据的帮助函数，不改变资料所属。
   */
  read,
) {
  return {
    getEntry:
      /**
       * 按稳定编号查回当前事务视图中的账目，返回记录或空值。
       */
      (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => read(transaction.collection('ledgerEntries'), id),
    getOperation:
      /**
       * 按原请求编号查回去重事实，返回已提交事实或空值。
       */
      (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => read(transaction.collection('ledgerOperations'), id),
    getHousehold:
      /**
       * 查回目标家庭资料，供事务再次核对真实成员资格。
       */
      (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => read(transaction.collection('households'), id),
    findCategoryById:
      /**
       * 查回对应类目的正式记录，返回记录或空值供范围核对。
       */
      (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => read(transaction.collection('ledgerCategories'), id),
    getBatch:
      /**
       * 查回本次无正文批次控制，所属仍由业务层核对。
       */
      (
        /**
         * 当前记录的稳定编号，只在已经核对的范围内查回。
         */
        id,
      ) => read(transaction.collection('ledgerAiBatches'), id),
    setBatch:
      /**
       * 只将本次控制资料写入当前事务视图，与成功事实一并提交。
       */
      (
        /**
         * 当前原始记录，只在核对版本、范围和期限后使用。
         */
        record,
      ) =>
        transaction
          .collection('ledgerAiBatches')
          .doc(record._id)
          .set({ data: withoutDocumentId(record) }),
  }
}

module.exports = { batchRepository, batchTransaction }
