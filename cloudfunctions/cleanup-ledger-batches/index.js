/** 文件用途：准备无正文回执清理入口，默认关闭且本轮不部署或启用定时运行。 */
const cloud = require('wx-server-sdk')
/** 纯清理规则可独立受控检查。 */
const { cleanupBatches } = require('./cleanup-domain')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
/** 默认关闭，微信普通用户不能调用本维护入口。 */
exports.main =
  /**
   * 维护入口先核对开关和调用来源，只回收明确过期的无正文回执。
   */
  async () => {
    /**
     * 本次已经固定的成员、类目或微信调用上下文，不接受文字自报身份。
     */
    const context = cloud.getWXContext()
    if (process.env.LEDGER_BATCH_CLEANUP_ENABLED !== '1' || context.OPENID) return { status: 'DISABLED' }

    /**
     * 已经由云端创建的数据库能力，不向小程序暴露。
     */
    const db = cloud.database()

    /**
     * 本动作固定使用的业务集合，不能由用户选择其他集合。
     */
    const collection = db.collection('ledgerAiBatches')
    return cleanupBatches(
      {
        expired:
          /**
           * 读取已到期的有限回执候选，逐条核对后才允许物理回收。
           */
          async (
            /**
             * 可信时钟的当前毫秒值，用于核对原期限而非刷新期限。
             */
            now,
            /**
             * 本次回收或查询允许读取的最大记录数。
             */
            limit,
          ) =>
            (
              await collection
                .where({ expiresAt: db.command.lte(now), v: 1 })
                .limit(limit)
                .get()
            ).data || [],
        // 再核对期限，防止扫描与回收之间误删尚未过期或未知版本资料。
        remove:
          /**
           * 核对原期限后回收当前回执，不删除正式账目或原创建事实。
           */
          async (
            /**
             * 当前记录的稳定编号，只在已经核对的范围内查回。
             */
            id,
            /**
             * 原记录固定的过期时间，查看和重试不能延长。
             */
            expiresAt,
          ) =>
            db.runTransaction(
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
                 * 当前请求、选择或事务返回的结果，不能仅凭文字宣称已保存。
                 */
                const result = await tx.collection('ledgerAiBatches').doc(id).get()
                if (
                  result.data &&
                  result.data.v === 1 &&
                  result.data.expiresAt === expiresAt &&
                  expiresAt <= Date.now()
                )
                  await tx.collection('ledgerAiBatches').doc(id).remove()
              },
            ),
      },
      Date.now(),
    )
  }
