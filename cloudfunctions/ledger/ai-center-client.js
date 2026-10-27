/** 文件用途：只向固定本机应用入口发送受控记账请求，限制地址、时限和响应体积。 */
const http = require('http')
/** 云端固定错误，不暴露连接详情。 */
const { LedgerDomainError } = require('./ledger-domain')

/** 创建本机连接；云环境未明确本地调试时直接关闭。 */
function createAiCenterClient(
  /**
   * 服务端启动环境，只读取固定地址、开关及凭据，不解释用户文字。
   */
  environment = process.env,
) {
  /**
   * 仅在受信服务之间使用的凭据或状态证明，不作为模型资料。
   */
  const token = environment.AI_CENTER_APPLICATION_TOKEN || ''

  /**
   * 固定本机服务地址，不允许跳转到其他主机或协议。
   */
  const address = environment.AI_CENTER_APPLICATION_URL || 'http://127.0.0.1:4318'

  /**
   * 通过固定协议和主机检查后的本机地址。
   */
  let base
  try {
    base = new URL(address)
  } catch {
    throw new LedgerDomainError('LEDGER_AI_UNAVAILABLE')
  }
  if (
    environment.AI_CENTER_LOCAL_DEBUG !== '1' ||
    base.protocol !== 'http:' ||
    base.hostname !== '127.0.0.1' ||
    base.username ||
    base.password ||
    base.pathname !== '/' ||
    base.search ||
    base.hash ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(token)
  )
    throw new LedgerDomainError('LEDGER_AI_UNAVAILABLE')
  /** 一次实际请求，不自动重试，不将调用内容写日志。 */
  function send(
    /**
     * 程序固定的本机动作路径，不能由模型指定其他地址。
     */
    path,
    /**
     * 当前待检查或转换的值，通过对应规则后才能使用。
     */
    value,
    /**
     * 扣除准备耗时后的剩余请求时限，不得扩大原总期限。
     */
    timeoutMs,
    /**
     * 由程序固定的请求方式，用于区分可用性读取与业务提交。
     */
    method = 'POST',
  ) {
    /**
     * 本次完整序列化资料，按实际字节限制，不记录到日志。
     */
    const raw = method === 'GET' ? '' : JSON.stringify(value)
    if (Buffer.byteLength(raw) > 65_536) return Promise.reject(new LedgerDomainError('LEDGER_DRAFT_LIMIT'))
    return new Promise(
      /**
       * 建立本次有界异步等待，由明确完成或失败结束，不自动重复执行。
       */
      (
        /**
         * 成功时交付本次异步结果的函数。
         */
        resolve,
        /**
         * 失败时以固定错误结束本次等待的函数。
         */
        reject,
      ) => {
        /**
         * 本次等待是否已经结束，防止重复交付或重复拒绝。
         */
        let settled = false

        /**
         * 本次固定请求内容或引用，网络处理期间不再读取可变页面值。
         */
        const request = http.request(
          new URL(path, base),
          {
            method,
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(raw),
            },
          },

          /**
           * 处理当前已固定的输入或状态，返回本步骤结果，不自行扩大所属或重发请求。
           */
          (
            /**
             * 本次网络返回的响应，完整接收并核对后才使用。
             */
            response,
          ) => {
            /**
             * 当前接收的有限字节片段，完整结束后才解析。
             */
            const chunks = []

            /**
             * 当前实际接收的字节累计，超限立即停止。
             */
            let bytes = 0
            response.on(
              'data',
              /**
               * 处理当前已固定的输入或状态，返回本步骤结果，不自行扩大所属或重发请求。
               */
              (
                /**
                 * 本次接收的一个字节片段，累计大小仍受上限约束。
                 */
                chunk,
              ) => {
                bytes += chunk.length
                if (bytes > 65_536) request.destroy()
                else chunks.push(chunk)
              },
            )
            response.on('error', fail)
            response.on(
              'end',
              /**
               * 处理当前已固定的输入或状态，返回本步骤结果，不自行扩大所属或重发请求。
               */
              () => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                try {
                  /**
                   * 当前请求、选择或事务返回的结果，不能仅凭文字宣称已保存。
                   */
                  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
                  if (response.statusCode !== 200 || result.status !== 'ok') {
                    /**
                     * 对外固定错误对应，不回显第三方错误消息。
                     */
                    const codes = {
                      DRAFT_TOO_MANY: 'LEDGER_DRAFT_LIMIT',
                      DRAFT_UNSUPPORTED: 'LEDGER_DRAFT_UNSUPPORTED',
                      DRAFT_TIMEOUT: 'LEDGER_AI_TIMEOUT',
                      INTEGRATION_BUSY: 'LEDGER_AI_BUSY',
                    }
                    return reject(new LedgerDomainError(codes[result.code] || 'LEDGER_AI_FAILED'))
                  }
                  if (path.endsWith('/health')) {
                    if (result.application !== 'cohabitation-life')
                      return reject(new LedgerDomainError('LEDGER_AI_UNAVAILABLE'))
                    return resolve(true)
                  }
                  resolve(path.endsWith('/cancel') ? null : result.result)
                } catch {
                  reject(new LedgerDomainError('LEDGER_AI_RESPONSE'))
                }
              },
            )
          },
        )
        /** 实际销毁请求，不只拒绝外层Promise。 */
        function fail() {
          if (settled) return
          settled = true
          clearTimeout(timer)
          request.destroy()
          reject(new LedgerDomainError('LEDGER_AI_FAILED'))
        }

        /**
         * 本次等待的时限句柄，完成或失败后必须释放。
         */
        const timer = setTimeout(fail, timeoutMs)
        request.on('error', fail)
        request.end(raw)
      },
    )
  }
  return {
    // 可用性只检查本机服务，不读取模型配置或发送消费内容。
    health:
      /**
       * 只核对本机应用服务是否可用，不调用模型或读取聊天。
       */
      () => send('/v1/health', null, 1500, 'GET'),
    understand:
      /**
       * 接收当前输入和有限状态，返回补问或可核对清单，不正式记账。
       */
      (
        /**
         * 当前待检查或转换的值，通过对应规则后才能使用。
         */
        value,
      ) => send('/v1/bookkeeping/draft', value, Math.min(60_000, value.timeoutMs || 60_000) + 1000),
    cancel:
      /**
       * 仅转交本人的具体请求取消，不恢复旧输入或重新发送。
       */
      (
        /**
         * 当前待检查或转换的值，通过对应规则后才能使用。
         */
        value,
      ) => send('/v1/bookkeeping/cancel', value, 3000),
  }
}

module.exports = { createAiCenterClient }
