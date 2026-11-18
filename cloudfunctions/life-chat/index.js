// 文件用途：从真实微信上下文认定使用者，只在明确配置的家庭开放聊天。
const { createHash, createHmac } = require('node:crypto')
const cloud = require('wx-server-sdk')
const { handleChat } = require('./chat-domain')
const { createChatStore, readDocument, ChatWriteError } = require('./chat-store')
const { createChatLedger } = require('./ledger-repository')
const { createChatCredentials } = require('./credentials')
const { createChatMutations } = require('./mutations')
const { handlePreviewDraft } = require('../ledger/index')
const { reservePreviewRequest } = require('./preview-usage')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const preview = process.env.LIFE_CHAT_PREVIEW_BUILD === '1'
const draftActions = new Set(['getDraftAvailability', 'understandDraft', 'editDraft', 'cancelDraft', 'prepareBatch', 'saveBatch', 'queryBatch', 'stopBatch', 'listBatches'])

// 生产依赖由同次构建给出，生成文件缺失或版本冲突时保持入口关闭。
exports.main = async function main(event, context) {
  try {
    const { APPID, OPENID } = cloud.getWXContext()
    if (!APPID || !OPENID) return { kind: 'forbidden' }
    const maxRequests = Number(process.env.LIFE_CHAT_DAILY_MAX_REQUESTS)
    const householdId = process.env.LIFE_CHAT_HOUSEHOLD
    const secret = process.env.LIFE_CHAT_SECRET
    const recovery = event?.action === 'recover' || event?.action === 'stop_operation'
    if (!householdId || (!recovery && (process.env.LIFE_CHAT_ENABLED !== '1' || !secret || secret.length < 32 || !Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 100))) return { kind: 'disabled' }
    const identityKey = `user_${createHash('sha256').update(`${APPID}:${OPENID}`).digest('hex')}`
    const household = await readDocument(db.collection('households'), householdId)
    if (!Array.isArray(household?.memberKeys) || !household.memberKeys.includes(identityKey) || event?.householdId !== householdId) return { kind: 'forbidden' }
    const store = createChatStore(db, { householdId, identityKey, maxRequests, preview })
    // 关闭新操作后，本人的确切回执仍可查回；此路径不加载模型或生成新确认。
    if (recovery) return await handleChat(event, { store })
    const runtime = require('./ai-center-life-chat-runtime.cjs')
    if (runtime.lifeChatVersion !== 1 || !process.env.DEEPSEEK_API_KEY) return { kind: 'disabled' }
    const reserve = preview ? () => reservePreviewRequest(db, householdId, identityKey) : undefined
    if (event.action === 'preview_bookkeeping') {
      const draft = event.draft
      if (!reserve || !draftActions.has(draft?.action) || Buffer.byteLength(JSON.stringify(event)) > 16_384) {
        return { status: 'LEDGER_INVALID_REQUEST', retryable: false, errorMessage: '该请求无法在当前预览中使用。' }
      }
      const environment = {
        ...process.env,
        AI_CENTER_CLOUD_BOOKKEEPING: '1',
        AI_CENTER_CLOUD_HOUSEHOLD: householdId,
        AI_CENTER_CLOUD_DAILY_MAX_REQUESTS: '100',
        AI_CENTER_DRAFT_SIGNING_KEY: createHmac('sha256', secret).update('life-chat-preview-draft').digest('hex'),
      }
      return await handlePreviewDraft({ ...draft, householdId }, context, { environment, reserve })
    }
    return await handleChat(event, {
      store,
      credentials: createChatCredentials(secret),
      mutations: createChatMutations(db, { store, household, identityKey, openId: OPENID, openapi: cloud.openapi }),
      ledger: createChatLedger(db, household, identityKey),
      now: Date.now,
      interpret: async (input) => {
        const signal = AbortSignal.timeout(input.timeoutMs)
        if (reserve && !await reserve()) throw new ChatWriteError('preview_limit')
        signal.throwIfAborted()
        return runtime.understandCloudLifeChat(input, process.env, signal)
      },
    })
  } catch {
    // 不把原问题、账目、模型数据或第三方异常写入日志及页面。
    return { kind: 'unavailable' }
  }
}
