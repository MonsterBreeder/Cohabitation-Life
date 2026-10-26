// 文件用途：核对微信身份并将固定账本动作交给对应领域，拒绝原始异常外传。
// PRD 008：家庭共同流水账云函数入口。
// 11 个 action：initCategories / addEntry / updateEntry / deleteEntry / restoreEntry / listEntries / getEntry / addCategory / updateCategory / removeCategory / getStats
// 模式：与 task/index.js 一致，统一鉴权 + 依赖注入 + 错误收敛。

const cloud = require('wx-server-sdk')
const {
  initCategories,
  addEntry,
  updateEntry,
  deleteEntry,
  restoreEntry,
  listEntries,
  getEntry,
  addCategory,
  updateCategory,
  removeCategory,
  getStats,
  LedgerDomainError,
} = require('./ledger-domain')
const { withoutDocumentId } = require('./repository-data')
// 一句话入口只转发固定动作，模型与页面都不能选择任意业务函数。
const { batchRepository, batchTransaction } = require('./batch-repository')
/** 当前页草稿规则，不打开普通聊天或长期记忆。 */
const draftDomain = require('./draft-domain')
/** 已确认批次的逐笔保存与原结果核对。 */
const batchDomain = require('./batch-domain')
/** 固定本机应用连接，不允许页面选择地址或凭据。 */
const { createAiCenterClient } = require('./ai-center-client')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/** 单文档读取，加 3 次重试解决 WeChat Cloud DB 的最终一致性问题。 */
async function getDocument(collection, id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = collection.doc(id).get()
      const data = await Promise.resolve(result).then((r) => r.data || null)
      if (data) return data
    } catch (error) {
      if (!error || !(error.errCode === -1 || /not exist|not found/i.test(error.message || ''))) {
        throw error
      }
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 200))
  }
  return null
}

function createRepository() {
  const entries = db.collection('ledgerEntries')
  const categories = db.collection('ledgerCategories')
  const operations = db.collection('ledgerOperations')
  const households = db.collection('households')
  const users = db.collection('users')

  return {
    ...batchRepository(db, getDocument),
    getHousehold: (id) => getDocument(households, id),
    isMemberOfHousehold: async (identityKey, householdId) => {
      const hId = householdId || identityKey // caller passes identityKey in arg[0]; we'll re-call with right args
      const home = await getDocument(households, hId)
      return Boolean(home && Array.isArray(home.memberKeys) && home.memberKeys.includes(identityKey))
    },
    getEntry: (id) => getDocument(entries, id),
    getOperation: (id) => getDocument(operations, id),
    findCategoriesByHousehold: async (householdId) => {
      const result = await categories.where({ householdId }).limit(50).get()
      return result.data
    },
    findCategoryById: (id) => getDocument(categories, id),
    findEntriesByHousehold: async (householdId, filter) => {
      const where = { householdId }
      if (!filter.includeDeleted) where.deletedAt = null
      // PRD 008 优化 KTD2：month 接受 'all' | 'yyyy-MM' | 'yyyy-MM-dd' 三种
      if (filter.month && filter.month !== 'all') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(filter.month)) {
          // 按日：[dayStart, dayStart+24h)
          const [y, m, d] = filter.month.split('-').map((v) => Number.parseInt(v, 10))
          const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString()
          const end = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0)).toISOString()
          where.occurredAt = db.command.gte(start).and(db.command.lt(end))
        } else if (/^\d{4}-\d{2}$/.test(filter.month)) {
          // 按月：[monthStart, nextMonth-01)
          const [y, m] = filter.month.split('-').map((v) => Number.parseInt(v, 10))
          const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)).toISOString()
          const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)).toISOString()
          where.occurredAt = db.command.gte(start).and(db.command.lt(end))
        } else {
          // 其他格式 = 入参非法；用 LedgerDomainError 跟 listEntries 其他错误处理对齐
          throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
        }
      }
      if (filter.categoryIds && filter.categoryIds.length > 0) {
        where.categoryId = db.command.in(filter.categoryIds)
      }
      // PRD 008 优化 R1：payerMode 加 'other' 分支（双成员家庭筛对方付的）
      if (filter.payerMode === 'me' && filter.selfMemberKey) {
        where.payerMemberKey = filter.selfMemberKey
      } else if (filter.payerMode === 'other' && filter.selfMemberKey) {
        // "对方付的" = payerMemberKey != selfMemberKey
        where.payerMemberKey = db.command.neq(filter.selfMemberKey)
      }
      // PRD 008 优化 R5：typeFilter 加 'expense' / 'income' 分支
      if (filter.typeFilter === 'expense' || filter.typeFilter === 'income') {
        where.type = filter.typeFilter
      }
      let query = entries.where(where).orderBy('occurredAt', 'desc').orderBy('createdAt', 'desc')
      if (filter.offset > 0) query = query.skip(filter.offset)
      const result = await query.limit(filter.limit > 0 ? filter.limit : 500).get()
      return result.data
    },
    countEntriesByCategory: async (categoryId, householdId) => {
      const result = await entries.where({ categoryId, householdId, deletedAt: null }).limit(1000).get()
      return result.data.length
    },
    getProfileForMember: async (memberKey) => {
      if (!memberKey || !memberKey.startsWith('user_')) return null
      return getDocument(users, memberKey)
    },
    // 创建类记录必须使用领域层生成的编号；否则 add() 自动编号与返回给前端的编号不一致。
    addCategory: (data) => categories.doc(data._id).set({ data: withoutDocumentId(data) }),
    updateCategory: (id, data) => categories.doc(id).update({ data }),
    removeCategory: (id) => categories.doc(id).remove(),
    runTransaction(work) {
      return db.runTransaction(async (transaction) => {
        const tx = {
          ...batchTransaction(transaction, getDocument),
          // 创建记录统一以领域层编号落库，保证返回编号、幂等锁和后续查询指向同一条数据。
          addEntry: (data) => transaction.collection('ledgerEntries').doc(data._id).set({ data: withoutDocumentId(data) }),
          updateEntry: (id, data) => transaction.collection('ledgerEntries').doc(id).update({ data }),
          addCategory: (data) => transaction.collection('ledgerCategories').doc(data._id).set({ data: withoutDocumentId(data) }),
          addOperation: (data) => transaction.collection('ledgerOperations').doc(data._id).set({ data: withoutDocumentId(data) }),
        }
        return work(tx)
      })
    },
  }
}

function buildDependencies(identityKey, householdId, selfMemberKey) {
  const repository = createRepository()
  return {
    identityKey,
    selfMemberKey,
    householdId,
    repository,
    getTempFileUrls: async (fileIds) => {
      const result = await cloud.getTempFileURL({ fileList: fileIds })
      const urls = {}
      for (const item of (result && result.fileList) || []) {
        if (item && item.fileID && item.tempFileURL) urls[item.fileID] = item.tempFileURL
      }
      return urls
    },
    now: () => new Date(),
  }
}

function humaniseError(code) {
  switch (code) {
    case 'LEDGER_NOT_FOUND': return '账目不存在'
    case 'LEDGER_FORBIDDEN': return '你已经没有这个家庭的访问权限'
    case 'LEDGER_CATEGORY_NOT_FOUND': return '类目不存在'
    case 'LEDGER_CATEGORY_IN_USE': return '该类目下还有账目，请先修改或删除账目'
    case 'LEDGER_CATEGORY_NAME_TAKEN': return '类目名已被使用'
    case 'LEDGER_PAYER_NOT_MEMBER': return '付款人不是当前家庭成员'
    case 'LEDGER_AMOUNT_INVALID': return '金额格式不正确'
    case 'LEDGER_TIME_INVALID': return '时间格式不正确'
    case 'LEDGER_RECEIPT_TOO_LARGE': return '凭证图过大'
    default: return '请求暂时无法处理，请稍后重试'
  }
}

exports.main =
/** 以真实微信身份处理固定账本动作，返回受控业务结果而不外传原始异常。 */
async (
  /* 小程序提供的不可信动作与资料，不能自报可信身份。 */
  event,
  /* 平台实际运行控制，可用时提供原剩余时间。 */
  runtimeContext,
) => {
  const context = cloud.getWXContext()
  try {
    // 无真实微信上下文时拒绝，不用undefined计算出共享身份。
    if (!context.APPID || !context.OPENID) return { status: 'LEDGER_FORBIDDEN', retryable: false }
    const identityKey = `user_${require('crypto').createHash('sha256').update(`${context.APPID}:${context.OPENID}`).digest('hex')}`
    // 真实场景：householdId 从 event 传入；selfMemberKey = 当前家庭成员身份键（这里用 identityKey 占位；多成员家庭会传具体 memberKey）
    const householdId = (event && event.householdId) || ''
    const selfMemberKey = (event && event.selfMemberKey) || identityKey
    if (!householdId) {
      return { status: 'LEDGER_INVALID_REQUEST', retryable: false, errorMessage: '缺少家庭编号' }
    }
    // 二次校验：identityKey 是否在 household 的 memberKeys 中
    const householdDoc = await getDocument(db.collection('households'), householdId)
    if (!householdDoc || !Array.isArray(householdDoc.memberKeys) || !householdDoc.memberKeys.includes(identityKey)) {
      return { status: 'LEDGER_FORBIDDEN', retryable: false, errorMessage: '你已经不是该家庭的成员' }
    }
    const dependencies = buildDependencies(identityKey, householdId, selfMemberKey)
    const action = event && event.action
    // 独立的AI动作沿用当前云端身份，忽略页面的selfMemberKey。
    if (['getDraftAvailability', 'understandDraft', 'editDraft', 'cancelDraft', 'prepareBatch', 'saveBatch', 'queryBatch', 'stopBatch', 'listBatches'].includes(action)) {
      dependencies.selfMemberKey = identityKey
      dependencies.draftSigningKey = process.env.AI_CENTER_DRAFT_SIGNING_KEY
      // 单次执行保留本地安全上限；不假定部署后云函数有相同运行时限。
      const remaining = runtimeContext && typeof runtimeContext.getRemainingTimeInMillis === 'function'
        ? runtimeContext.getRemainingTimeInMillis()
        : Number(process.env.AI_CENTER_CLOUD_TIMEOUT_MS)
      if (['saveBatch', 'understandDraft'].includes(action) && (!Number.isFinite(remaining) || remaining < 2000)) throw new LedgerDomainError('LEDGER_AI_UNAVAILABLE')
      dependencies.cloudDeadline = Date.now() + Math.min(30_000, remaining - 1000)
      dependencies.aiDeadline = Date.now() + Math.min(60_000, remaining - 1000)
      if (action === 'getDraftAvailability') {
        try {
          if (!Number.isFinite(remaining) || remaining < 2000) throw new LedgerDomainError('LEDGER_AI_UNAVAILABLE')
          /** 当前可信本机连接，只用于读取可用状态，不调用模型。 */
          const client = createAiCenterClient()
          draftDomain.digest('configuration-check', dependencies)
          await client.health()
          return { status: 'DRAFT_AVAILABILITY', available: true, retryable: false }
        } catch { return { status: 'DRAFT_AVAILABILITY', available: false, retryable: false } }
      }
      if (action === 'understandDraft' || action === 'cancelDraft') {
        /** 本次固定理解或取消连接，不能在等待期间更换目标。 */
        const client = createAiCenterClient()
        dependencies.aiCenter = client.understand
        dependencies.aiCenterCancel = client.cancel
      }
      if (action === 'understandDraft') return await draftDomain.understandDraft(event, dependencies)
      if (action === 'editDraft') return await draftDomain.editDraft(event, dependencies)
      if (action === 'cancelDraft') return await draftDomain.cancelDraft(event, dependencies)
      if (action === 'prepareBatch') return await batchDomain.prepareBatch(event, dependencies)
      if (action === 'saveBatch') return await batchDomain.saveBatch(event, dependencies)
      if (action === 'queryBatch') return await batchDomain.queryBatch(event, dependencies)
      if (action === 'stopBatch') return await batchDomain.stopBatch(event, dependencies)
      return await batchDomain.listBatches(event, dependencies)
    }
    if (action === 'initCategories') return await initCategories(event, dependencies)
    if (action === 'addEntry') return await addEntry(event, dependencies)
    if (action === 'updateEntry') return await updateEntry(event, dependencies)
    if (action === 'deleteEntry') return await deleteEntry(event, dependencies)
    if (action === 'restoreEntry') return await restoreEntry(event, dependencies)
    if (action === 'listEntries') return await listEntries(event, dependencies)
    if (action === 'getEntry') return await getEntry(event, dependencies)
    if (action === 'addCategory') return await addCategory(event, dependencies)
    if (action === 'updateCategory') return await updateCategory(event, dependencies)
    if (action === 'removeCategory') return await removeCategory(event, dependencies)
    if (action === 'getStats') return await getStats(event, dependencies)
    throw new LedgerDomainError('LEDGER_INVALID_REQUEST', false)
  } catch (error) {
    if (error instanceof LedgerDomainError) {
      const body = { status: error.code, retryable: error.retryable }
      if (error.code !== 'LEDGER_TEMPORARY_FAILURE' && error.code !== 'LEDGER_INVALID_REQUEST') {
        body.errorMessage = humaniseError(error.code)
      } else if (error.code === 'LEDGER_INVALID_REQUEST') {
        // 把入参的关键字段记录到云函数日志，方便排查"哪个字段非法"。
        // 不向客户端返回细节，避免泄漏内部校验逻辑。
        console.warn('ledger LEDGER_INVALID_REQUEST', {
          action: event && event.action,
          keys: event ? Object.keys(event).filter((k) => k !== 'userInfo') : [],
          hasRequestId: Boolean(event && event.requestId),
          hasOperationToken: Boolean(event && event.operationToken),
          hasHouseholdId: Boolean(event && event.householdId),
        })
      }
      return body
    }
    console.error('ledger action failed', {
      action: event && event.action,
      // 异常可能带消费正文或连接信息，只保留固定分类。
      code: 'LEDGER_TEMPORARY_FAILURE',
    })
    return { status: 'LEDGER_TEMPORARY_FAILURE', retryable: true, errorMessage: '暂时无法完成账目操作，请稍后重试' }
  }
}
