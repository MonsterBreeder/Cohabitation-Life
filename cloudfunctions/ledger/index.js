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
      if (filter.month && filter.month !== 'all') {
        // 月份格式 yyyy-MM，转为 [yyyy-MM-01, nextMonth-01)
        const [y, m] = filter.month.split('-').map((v) => Number.parseInt(v, 10))
        const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)).toISOString()
        const end = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)).toISOString()
        where.occurredAt = db.command.gte(start).and(db.command.lt(end))
      }
      if (filter.categoryIds && filter.categoryIds.length > 0) {
        where.categoryId = db.command.in(filter.categoryIds)
      }
      if (filter.payerMode === 'me' && filter.selfMemberKey) {
        where.payerMemberKey = filter.selfMemberKey
      }
      const result = await entries.where(where).limit(500).get()
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
    addCategory: (data) => categories.add({ data }),
    updateCategory: (id, data) => categories.doc(id).update({ data }),
    removeCategory: (id) => categories.doc(id).remove(),
    runTransaction(work) {
      return db.runTransaction(async (transaction) => {
        const tx = {
          addEntry: (data) => transaction.collection('ledgerEntries').add({ data }),
          updateEntry: (id, data) => transaction.collection('ledgerEntries').doc(id).update({ data }),
          addCategory: (data) => transaction.collection('ledgerCategories').add({ data }),
          addOperation: (data) => transaction.collection('ledgerOperations').add({ data }),
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

exports.main = async (event) => {
  const context = cloud.getWXContext()
  try {
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
      message: error instanceof Error ? error.message : String(error),
    })
    return { status: 'LEDGER_TEMPORARY_FAILURE', retryable: true, errorMessage: '暂时无法完成账目操作，请稍后重试' }
  }
}
