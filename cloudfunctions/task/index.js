const cloud = require('wx-server-sdk')
const { checkText } = require('./content-safety')
const { withoutDocumentId } = require('./repository-data')
const {
  createTask,
  listCurrentTasks,
  getTaskDetail,
  claimTask,
  completeTask,
  abandonTask,
  listCompletedTasks,
  updateTask,
  addComment,
  deleteTask,
  TaskDomainError,
} = require('./task-domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/**
 * 单文档读取，加 3 次重试解决 WeChat Cloud DB 的最终一致性问题。
 * 现象：刚 create 的 task 在主键查询时暂时不可见，但 where 列表查询已经能看到。
 * 根因：.doc(id).get() 主键路径和 .where().get() 列表路径的索引/缓存不一致。
 * 重试策略：3 次，每次间隔 200ms，覆盖秒级一致性窗口；超过 3 次仍 null 才视为真不存在。
 */
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
  const tasksCollection = db.collection('tasks')
  const operationsCollection = db.collection('taskOperations')
  const householdsCollection = db.collection('households')

  const repository = {
    findHouseholdsByMemberKey: async (identityKey) => {
      const result = await householdsCollection.where({ memberKeys: db.command.all([identityKey]) }).limit(2).get()
      return result.data
    },
    getUser: (id) => getDocument(db.collection('users'), id),
    getTask: (id) => getDocument(tasksCollection, id),
    getOperation: (id) => getDocument(operationsCollection, id),
    isMemberOfHousehold: async (identityKey, householdId) => {
      const home = await getDocument(householdsCollection, householdId)
      return Boolean(home && Array.isArray(home.memberKeys) && home.memberKeys.includes(identityKey))
    },
    findOpenTasksByHousehold: async (householdId, now) => {
      // PRD 007：过滤软删（deletedAt IS NULL 或字段不存在）
      const result = await tasksCollection.where({
        householdId,
        status: db.command.in(['pending', 'claimed']),
        deletedAt: null,
      }).limit(100).get()
      return result.data
    },
    findOperationsByTaskId: async (taskId) => {
      const result = await operationsCollection.where({ taskId }).limit(50).get()
      // 按时间升序，UI 端再倒序展示
      return result.data.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    },
    findCompletedTasksByHousehold: async (householdId, limit, cursor) => {
      // PRD 007：过滤软删
      let query = tasksCollection.where({
        householdId,
        status: db.command.in(['completed', 'abandoned']),
        deletedAt: null,
      })
      if (cursor && typeof cursor === 'string') {
        const decoded = decodeCursor(cursor)
        if (decoded) {
          query = tasksCollection.where({
            householdId,
            status: db.command.in(['completed', 'abandoned']),
            deletedAt: null,
            terminalAt: db.command.lt(decoded.at),
          })
        }
      }
      const result = await query.orderBy('terminalAt', 'desc').limit(limit + 1).get()
      const records = result.data.slice(0, limit)
      const hasMore = result.data.length > limit
      const nextCursor = hasMore && records.length > 0
        ? encodeCursor({ at: records[records.length - 1].terminalAt, id: records[records.length - 1]._id })
        : undefined
      return { records, nextCursor }
    },
    runTransaction(work) {
      return db.runTransaction(async (transaction) => {
        const tx = {
          getTask: (id) => getDocument(transaction.collection('tasks'), id),
          getOperation: (id) => getDocument(transaction.collection('taskOperations'), id),
          createTask: (record) => transaction.collection('tasks').doc(record._id).set({ data: withoutDocumentId(record) }),
          updateTask: (id, data) => transaction.collection('tasks').doc(id).update({ data }),
          createOperation: (record) => transaction.collection('taskOperations').doc(record._id).set({ data: withoutDocumentId(record) }),
          // PRD 006：事务内可读 events（用于 updateTask 返回 events）
          findOperationsByTaskId: async (taskId) => {
            const result = await transaction.collection('taskOperations').where({ taskId }).limit(50).get()
            return result.data.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
          },
        }
        return work(tx)
      })
    },
  }
  return repository
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function decodeCursor(cursor) {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function buildDependencies() {
  const repository = createRepository()
  return {
    identityKey: 'placeholder', // 由 main 覆盖
    repository,
    now: () => new Date(),
    checkText: (content) => checkText(content, 'placeholder', 1, cloud.openapi),
  }
}

exports.main = async (event) => {
  const context = cloud.getWXContext()
  try {
    const identityKey = `user_${require('crypto').createHash('sha256').update(`${context.APPID}:${context.OPENID}`).digest('hex')}`
    const repository = createRepository()
    const dependencies = {
      identityKey,
      repository,
      now: () => new Date(),
      checkText: (content) => checkText(content, context.OPENID, 1, cloud.openapi),
    }
    const action = event && event.action
    if (action === 'create') return await createTask(event, dependencies)
    if (action === 'listCurrent') return await listCurrentTasks(dependencies)
    if (action === 'getDetail') return await getTaskDetail(event, dependencies)
    if (action === 'claim') return await claimTask(event, dependencies)
    if (action === 'complete') return await completeTask(event, dependencies)
    if (action === 'abandon') return await abandonTask(event, dependencies)
    if (action === 'listCompleted') return await listCompletedTasks(event, dependencies)
    // PRD 006
    if (action === 'update') return await updateTask(event, dependencies)
    if (action === 'addComment') return await addComment(event, dependencies)
    // PRD 007
    if (action === 'delete') return await deleteTask(event, dependencies)
    throw new TaskDomainError('TASK_INVALID_REQUEST')
  } catch (error) {
    if (error instanceof TaskDomainError) {
      const body = { status: error.code, retryable: error.retryable }
      if (error.code !== 'TEMPORARY_FAILURE' && error.code !== 'TASK_INVALID_REQUEST') {
        body.errorMessage = humaniseError(error.code)
      }
      return body
    }
    console.error('task action failed', {
      action: event && event.action,
      message: error instanceof Error ? error.message : String(error),
    })
    return { status: 'TASK_TEMPORARY_FAILURE', retryable: true, errorMessage: '暂时无法完成事项操作，请稍后重试' }
  }
}

function humaniseError(code) {
  switch (code) {
    case 'TASK_NOT_FOUND': return '事项不存在'
    case 'TASK_FORBIDDEN': return '你已经没有这个事项的访问权限'
    case 'TASK_TERMINAL': return '事项已经结束，不能再操作'
    case 'TASK_DUPLICATE_OPERATION': return '请求已处理，请刷新后查看最新状态'
    default: return '请求暂时无法处理，请稍后重试'
  }
}
