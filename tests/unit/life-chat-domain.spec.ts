// 文件用途：用隔离的数据库替身跑完整聊天、确认、原业务和事务回执，禁止真实云端写入。
import { createHash, randomUUID } from 'node:crypto'

jest.mock(
  'wx-server-sdk',
  () => ({ init: jest.fn(), database: jest.fn(() => ({})), getWXContext: jest.fn() }),
  {
    virtual: true,
  },
)

const { handleChat } = require('../../cloudfunctions/life-chat/chat-domain')
const { createChatStore } = require('../../cloudfunctions/life-chat/chat-store')
const { createChatCredentials } = require('../../cloudfunctions/life-chat/credentials')
const { createChatLedger } = require('../../cloudfunctions/life-chat/ledger-repository')
const { createChatMutations } = require('../../cloudfunctions/life-chat/mutations')
const { reservePreviewRequest } = require('../../cloudfunctions/life-chat/preview-usage')

type Document = Record<string, any>
type Records = Map<string, Document>

// 库替身模拟原事务提交、回滚与并发。业务和确认逻辑均使用真实函数。
function isolatedDatabase() {
  let records: Records = new Map()
  let pending = Promise.resolve()
  const command = {
    all: (values: string[]) => (field: string[]) => values.every((value) => field?.includes(value)),
    in: (values: string[]) => (field: string) => values.includes(field),
    inc: (amount: number) => ({ increment: amount }),
    set: (replacement: unknown) => ({ replacement }),
  }
  function access(data: Records) {
    return {
      command,
      collection(name: string) {
        return {
          doc(id: string) {
            const key = `${name}/${id}`
            return {
              async get() {
                return { data: structuredClone(data.get(key) ?? null) }
              },
              async set(value: { data: Document }) {
                data.set(key, { ...structuredClone(value.data), _id: id })
              },
              async update(value: { data: Document }) {
                const previous = data.get(key)
                if (!previous) throw new Error('document not found')
                const patch: Document = {}
                for (const [field, next] of Object.entries(value.data)) {
                  if (!next || typeof next !== 'object' || Array.isArray(next) || next instanceof Date) {
                    patch[field] = next
                  } else if ('increment' in next) {
                    patch[field] = previous[field] + next.increment
                  } else if ('replacement' in next) {
                    patch[field] = next.replacement
                  } else {
                    // 云数据库对普通对象做子字段更新，已有空值不能当作对象继续合并。
                    if (previous[field] === null) throw new Error(`Cannot create field in null: ${field}`)
                    patch[field] = { ...previous[field], ...next }
                  }
                }
                data.set(key, { ...previous, ...structuredClone(patch) })
              },
            }
          },
          where(filters: Document) {
            let limit = 100
            let offset = 0
            const query = {
              orderBy() {
                return query
              },
              skip(value: number) {
                offset = value
                return query
              },
              limit(value: number) {
                limit = value
                return query
              },
              async get() {
                const matches = [...data.entries()].filter(
                  ([key, row]) =>
                    key.startsWith(`${name}/`) &&
                    Object.entries(filters).every(([field, value]) => {
                      const current = field.split('.').reduce((item, key) => item?.[key], row)
                      return typeof value === 'function'
                        ? value(current)
                        : value == null
                          ? current == null
                          : current === value
                    }),
                )
                return { data: structuredClone(matches.slice(offset, offset + limit).map(([, row]) => row)) }
              },
            }
            return query
          },
        }
      },
    }
  }
  const db = {
    command,
    collection: (name: string) => access(records).collection(name),
    runTransaction<T>(work: (transaction: ReturnType<typeof access>) => Promise<T>) {
      const result = pending.then(async () => {
        const staged = structuredClone(records)
        const output = await work(access(staged))
        records = staged
        return output
      })
      pending = result.then(
        () => {},
        () => {},
      )
      return result
    },
  }
  return {
    db,
    rows: (name: string) =>
      [...records.entries()]
        .filter(([key]) => key.startsWith(`${name}/`))
        .map(([, row]) => structuredClone(row)),
  }
}

test('同一家庭并发领取扫码额度时最多发出六次，其他人无法领取', async () => {
  const { db, rows } = isolatedDatabase()
  const householdId = 'preview-home'
  const members = ['preview-owner', 'preview-partner']
  await db
    .collection('households')
    .doc(householdId)
    .set({ data: { memberKeys: members } })
  expect(await reservePreviewRequest(db, householdId, 'outside-user')).toBe(false)

  const allowed = await Promise.all(
    Array.from({ length: 8 }, (_, index) => reservePreviewRequest(db, householdId, members[index % 2])),
  )
  expect(allowed.filter(Boolean)).toHaveLength(6)
  expect(await reservePreviewRequest(db, householdId, members[0])).toBe(false)
  expect(rows('ledgerAiDailyUsage')).toEqual([expect.objectContaining({ householdId, count: 6 })])
})

test('旧的聊天日用量已经用完时，扫码验收仍使用独立的日登记', async () => {
  const { db, rows } = isolatedDatabase()
  const householdId = 'preview-home'
  const identityKey = 'preview-owner'
  const now = () => Date.parse('2026-11-17T23:30:00+08:00')
  await db
    .collection('households')
    .doc(householdId)
    .set({ data: { memberKeys: [identityKey] } })
  const oldKey = createHash('sha256').update(`life-chat-sent-v1:${householdId}:2026-11-17`).digest('hex')
  await db
    .collection('ledgerAiDailyUsage')
    .doc(oldKey)
    .set({ data: { householdId, count: 6 } })

  const store = createChatStore(db, { householdId, identityKey, maxRequests: 6, preview: true, now })
  const session = randomUUID()
  await store.open(session, 'task')
  expect(await store.begin(session, randomUUID())).toMatchObject({ kind: 'accepted' })
  expect(rows('ledgerAiDailyUsage').map((row) => row.count)).toEqual([6, 1])
})

// 只替换模型响应，全部实际保存均写入本用例自己的虚构仓储。
async function scenario() {
  const { db, rows } = isolatedDatabase()
  const household = { _id: 'home-one', memberKeys: ['user_author', 'user_partner'] }
  const identityKey = household.memberKeys[0]
  const now = () => Date.parse('2026-11-16T12:00:00+08:00')
  await db.collection('households').doc(household._id).set({ data: household })
  const store = createChatStore(db, { householdId: household._id, identityKey, maxRequests: 10, now })
  const interpret = jest.fn()
  const credentials = createChatCredentials('only-a-fake-key-for-local-integration')
  const openapi = { security: { msgSecCheck: jest.fn().mockResolvedValue({ result: { suggest: 'pass' } }) } }
  const mutations = createChatMutations(db, { store, household, identityKey, openapi, openId: 'test', now })
  const ledger = createChatLedger(db, household, identityKey)
  const deps = { store, now, ledger, mutations, credentials, interpret }
  const { sessionId } = await handleChat({ action: 'open', scope: 'all', consent: 1 }, deps)
  const call = (action: string, params = {}) => handleChat({ action, sessionId, ...params }, deps)
  const propose = (text: string, suggestion: Document) => {
    interpret.mockResolvedValueOnce({ kind: 'suggestions', suggestions: [{ ...suggestion, evidence: text }] })
    return call('ask', { text, requestId: randomUUID() })
  }
  return { db, rows, propose, call, interpret, deps, household }
}

test('文字确认不执行保存，反复点击同一事项确认卡只产生一个记录和回执', async () => {
  const data = await scenario()
  const card = await data.propose('记一下周五前交电费', {
    action: 'task_create',
    changes: { name: '交电费', type: 'to_handle', dueDate: '2026-11-20' },
  })
  expect(card).toMatchObject({ kind: 'confirm', action: 'create' })
  expect(data.rows('tasks')).toHaveLength(0)
  expect(await data.call('ask', { requestId: randomUUID(), text: '可以' })).toEqual({
    kind: 'clarify',
    question: '请在卡片上点击确认。',
  })
  expect(data.interpret).toHaveBeenCalledTimes(1)
  const [first, second] = await Promise.all([
    data.call('confirm', { credential: card.credential }),
    data.call('confirm', { credential: card.credential }),
  ])
  expect(first).toMatchObject({ kind: 'saved', domain: 'task' })
  expect(second).toEqual(first)
  expect(data.rows('tasks')).toHaveLength(1)
  expect(data.rows('tasks')[0]).toMatchObject({ title: '交电费', dueDate: '2026-11-20' })
  expect(await data.call('recover', { operationId: card.operationId })).toEqual(first)
  expect(JSON.stringify(data.rows('ledgerAiSessions'))).not.toContain('交电费')
})

test('对方已经修改的事项不能按旧卡删除，选中最新目标后可删除并查回', async () => {
  const data = await scenario()
  await data.db
    .collection('tasks')
    .doc('task-one')
    .set({
      data: {
        householdId: 'home-one',
        title: '交电费',
        status: 'pending',
        type: 'to_handle',
        editVersion: 1,
      },
    })
  const oldCard = await data.propose('删除交电费', { action: 'task_delete', target: { term: '交电费' } })
  await data.db
    .collection('tasks')
    .doc('task-one')
    .update({ data: { title: '交电费和水费', editVersion: 2 } })
  expect(await data.call('confirm', { credential: oldCard.credential })).toEqual({ kind: 'record_changed' })
  expect(data.rows('tasks')[0].deletedAt).toBeUndefined()
  const card = await data.propose('删除交电费和水费', {
    action: 'task_delete',
    target: { term: '交电费和水费' },
  })
  expect(await data.call('confirm', { credential: card.credential })).toMatchObject({
    kind: 'saved',
    domain: 'task',
    action: 'delete',
  })
  expect(data.rows('tasks')[0].deletedAt).toBeDefined()
})

test('足迹先显式选点再确认，修改回忆保留已有照片', async () => {
  const data = await scenario()
  const proposed = await data.propose('昨天去了西湖', {
    action: 'footprint_create',
    changes: { placeName: '西湖', visitedAt: '2026-11-15' },
  })
  expect(proposed.kind).toBe('choose_place')
  expect(data.rows('footprintEntries')).toHaveLength(0)
  const place = { name: '西湖', address: '杭州', latitude: 30.25, longitude: 120.14 }
  const card = await data.call('pick_place', { credential: proposed.credential, place })
  expect(card).toMatchObject({ kind: 'confirm', action: 'create' })
  expect(data.rows('footprintEntries')).toHaveLength(0)
  const saved = await data.call('confirm', { credential: card.credential })
  expect(saved).toMatchObject({ kind: 'saved', domain: 'footprint' })
  await data.db
    .collection('footprintEntries')
    .doc(saved.id)
    .update({
      data: {
        photoResourceIds: ['footphoto_12345678901234567890123456789012'],
        photoRefs: [{ resourceId: 'footphoto_12345678901234567890123456789012', digest: 'fixture' }],
        editVersion: 2,
      },
    })
  const update = await data.propose('把刚才那条足迹的回忆改成傍晚散步', {
    action: 'footprint_update',
    target: { ref: 'W1' },
    changes: { memory: '傍晚散步' },
  })
  expect(await data.call('confirm', { credential: update.credential })).toMatchObject({
    kind: 'saved',
    domain: 'footprint',
    action: 'update',
  })
  expect(data.rows('footprintEntries')[0]).toMatchObject({
    place,
    memory: '傍晚散步',
    photoResourceIds: ['footphoto_12345678901234567890123456789012'],
  })

  const visitedAgain = { action: 'footprint_create', changes: { placeName: '西湖', visitedAt: '2026-11-16' } }
  const known = await data.propose('今天又去了西湖', visitedAgain)
  expect(known).toMatchObject({ kind: 'choose_place', placeCandidate: '西湖 · 杭州' })
  const repeated = await data.call('choose', { credential: known.credential, index: 0 })
  expect(repeated).toMatchObject({ kind: 'confirm', action: 'create' })
  expect(data.rows('footprintEntries')).toHaveLength(1)
  expect(await data.call('confirm', { credential: repeated.credential })).toMatchObject({ kind: 'saved' })
  expect(data.rows('footprintEntries').map((row) => row.visitedAt)).toEqual(['2026-11-15', '2026-11-16'])

  await data.db
    .collection('footprintEntries')
    .doc('same-name-other-location')
    .set({
      data: {
        ...data.rows('footprintEntries')[0],
        placeKey: 'another-location',
        place: { ...place, address: '另一处' },
      },
    })
  const sameName = await data.propose('今天又去了西湖', visitedAgain)
  expect(sameName.kind).toBe('choose_place')
  expect(sameName.placeCandidate).toBeUndefined()
})

test('跨栏目建议只在点选后处理，旧卡退出后失效，另一名成员无法读取回执', async () => {
  const data = await scenario()
  data.interpret.mockResolvedValueOnce({
    kind: 'suggestions',
    suggestions: [
      { action: 'task_create', evidence: '交电费', changes: { name: '交电费', type: 'to_handle' } },
      { action: 'footprint_create', evidence: '昨天去了西湖', changes: { placeName: '西湖' } },
    ],
  })
  const choice = await data.call('ask', { text: '记一下交电费，昨天去了西湖', requestId: randomUUID() })
  expect(choice.kind).toBe('choose_action')
  expect(data.rows('tasks')).toHaveLength(0)
  const card = await data.call('choose', { credential: choice.credential, index: 0 })
  expect(card.kind).toBe('confirm')
  expect(data.interpret).toHaveBeenCalledTimes(1)
  await data.call('close')
  expect(await data.call('confirm', { credential: card.credential })).toEqual({ kind: 'expired' })
  const other = createChatStore(data.db, {
    householdId: data.household._id,
    identityKey: 'user_partner',
    maxRequests: 10,
  })
  expect(await other.recover(card.operationId)).toBeNull()
})

test('确认第一件事后可继续处理同句的余项，重复取回不会重复理解或保存', async () => {
  const data = await scenario()
  data.interpret.mockResolvedValueOnce({
    kind: 'suggestions',
    suggestions: [
      { action: 'task_create', evidence: '交电费', changes: { name: '交电费', type: 'to_handle' } },
      { action: 'footprint_create', evidence: '昨天去了西湖', changes: { placeName: '西湖' } },
    ],
  })
  const first = await data.call('ask', { text: '记一下交电费，昨天去了西湖', requestId: randomUUID() })
  const task = await data.call('choose', { credential: first.credential, index: 0 })
  expect(task).toMatchObject({ kind: 'confirm', remainingActions: { count: 1 } })
  const remaining = { credential: task.remainingActions.credential }
  expect(await data.call('confirm', { credential: task.credential })).toMatchObject({
    kind: 'saved',
    domain: 'task',
  })
  const choice = await data.call('resume_actions', remaining)
  expect(choice).toMatchObject({ kind: 'choose_action', options: ['记足迹 · 昨天去了西湖'] })
  expect(await data.call('resume_actions', remaining)).toEqual(choice)
  expect(await data.call('choose', { credential: choice.credential, index: 0 })).toMatchObject({
    kind: 'choose_place',
  })
  expect(await data.call('resume_actions', remaining)).toEqual({ kind: 'expired' })
  expect(data.rows('tasks')).toHaveLength(1)
  expect(data.rows('footprintEntries')).toHaveLength(0)
  expect(data.interpret).toHaveBeenCalledTimes(1)
})

test('问账次数用完后，仍能从同一句话选择记事项', async () => {
  const data = await scenario()
  const dayKey = createHash('sha256').update('ledger-ai-usage:home-one:2026-11-16').digest('hex')
  await data.db
    .collection('ledgerAiDailyUsage')
    .doc(dayKey)
    .set({ data: { count: 10 } })
  data.interpret.mockResolvedValueOnce({
    kind: 'suggestions',
    suggestions: [
      { action: 'ledger_query', evidence: '查打车', query: { kind: 'find', noteTerms: ['打车'] } },
      { action: 'task_create', evidence: '交电费', changes: { name: '交电费', type: 'to_handle' } },
    ],
  })
  const choice = await data.call('ask', { text: '先查打车，再记一下交电费', requestId: randomUUID() })
  expect(await data.call('choose', { credential: choice.credential, index: 0 })).toEqual({
    kind: 'question_limit',
  })
  const card = await data.call('choose', { credential: choice.credential, index: 1 })
  expect(await data.call('confirm', { credential: card.credential })).toMatchObject({
    kind: 'saved',
    domain: 'task',
  })
  expect(data.interpret).toHaveBeenCalledTimes(1)
})

test('关闭新聊天后，只允许原使用者查回已确认操作', async () => {
  const data = await scenario()
  const appId = 'life-chat-app'
  const identity = (openId: string) =>
    `user_${createHash('sha256').update(`${appId}:${openId}`).digest('hex')}`
  const householdId = data.household._id
  await data.db
    .collection('households')
    .doc(householdId)
    .set({
      data: { memberKeys: [identity('owner'), identity('partner')] },
    })
  const operationId = randomUUID()
  const owner = createHash('sha256')
    .update(`life-chat-owner-v1:${householdId}:${identity('owner')}`)
    .digest('hex')
  const key = createHash('sha256').update(`life-chat-operation-v1:${owner}:${operationId}`).digest('hex')
  const result = { kind: 'saved', domain: 'task', action: 'create', id: 'confirmed-test-task' }
  await data.db
    .collection('ledgerAiSessions')
    .doc(key)
    .set({
      data: { owner, result, expiresAt: new Date(Date.now() + 600_000).toISOString() },
    })
  const env = jest.replaceProperty(process, 'env', {
    ...process.env,
    LIFE_CHAT_HOUSEHOLD: householdId,
    LIFE_CHAT_ENABLED: '0',
  })
  try {
    let invoke!: (action: string, openId: string) => Promise<unknown>
    jest.isolateModules(() => {
      const cloud = jest.requireMock('wx-server-sdk')
      cloud.database.mockReturnValue(data.db)
      const { main } = require('../../cloudfunctions/life-chat/index')
      invoke = (action, openId) => {
        cloud.getWXContext.mockReturnValue({ APPID: appId, OPENID: openId })
        return main({ action, householdId, operationId })
      }
    })
    expect(await invoke('status', 'owner')).toEqual({ kind: 'disabled' })
    expect(await invoke('recover', 'owner')).toEqual(result)
    expect(await invoke('recover', 'partner')).toEqual({ kind: 'unknown' })
    expect(await invoke('recover', 'outsider')).toEqual({ kind: 'forbidden' })
  } finally {
    env.restore()
  }
})

test('新旧问账合用当日次数，只发布当前家庭真实记录和现查来源', async () => {
  const data = await scenario()
  const id = createHash('sha256').update('ledger-ai-usage:home-one:2026-11-16').digest('hex')
  await data.db
    .collection('ledgerAiDailyUsage')
    .doc(id)
    .set({ data: { count: 9 } })
  const entry = data.db.collection('ledgerEntries').doc('ledger-one')
  await entry.set({
    data: {
      householdId: 'home-one',
      type: 'expense',
      amountCents: 2800,
      note: '打车',
      occurredAt: '2026-11-15T09:00:00+08:00',
      payerMemberKey: 'user_author',
    },
  })
  const input = { action: 'ledger_query', query: { kind: 'find', noteTerms: ['打车'] } }
  const answer = await data.propose('查昨天的打车账', input)
  expect(answer).toMatchObject({
    kind: 'answer',
    candidates: [{ amountCents: 2800, ref: 'R1' }],
    referenceVersion: 1,
  })
  expect(answer.candidates[0]).not.toHaveProperty('entryId')
  expect(await data.call('source', { ref: 'R1', referenceVersion: 1 })).toEqual({
    kind: 'source',
    entryId: 'ledger-one',
  })
  await data.db
    .collection('ledgerEntries')
    .doc('ledger-one')
    .update({ data: { amountCents: 3200 } })
  expect(await data.call('source', { ref: 'R1', referenceVersion: 1 })).toEqual({ kind: 'record_changed' })
  expect(await data.propose('再查打车账', input)).toEqual({ kind: 'question_limit' })
})

test('旧账修改保留凭证，只给原记账人出卡，停止的未知操作不能补写', async () => {
  const data = await scenario()
  await data.db
    .collection('ledgerCategories')
    .doc('category_fixture')
    .set({ data: { householdId: 'home-one', name: '交通', key: 'transport' } })
  const original = {
    householdId: 'home-one',
    type: 'expense',
    amountCents: 2800,
    categoryId: 'category_fixture',
    note: '打车',
    occurredAt: '2026-11-15T09:00:00+08:00',
    payerMemberKey: 'user_partner',
    recorderMemberKey: 'user_author',
    receiptMediaId: 'fixture-receipt',
    mealPeriod: null,
  }
  await data.db.collection('ledgerEntries').doc('ledger_fixture').set({ data: original })
  await data.db
    .collection('ledgerEntries')
    .doc('ledger_partner')
    .set({ data: { ...original, note: '汽油', recorderMemberKey: 'user_partner' } })
  expect(
    await data.propose('把汽油改成32元', {
      action: 'ledger_update',
      target: { term: '汽油' },
      changes: { amountCents: 3200 },
    }),
  ).toEqual({ kind: 'forbidden' })
  const change = { action: 'ledger_update', target: { term: '打车' }, changes: { amountCents: 3200 } }
  const abandoned = await data.propose('把打车改成32元', change)
  expect(await data.call('stop_operation', { operationId: abandoned.operationId })).toEqual({
    kind: 'not_saved',
  })
  expect(await data.call('confirm', { credential: abandoned.credential })).toEqual({ kind: 'not_saved' })
  expect(data.rows('ledgerEntries')[0].amountCents).toBe(2800)
  const active = await data.propose('把打车改成32元', change)
  expect(await data.call('confirm', { credential: active.credential })).toMatchObject({
    kind: 'saved',
    domain: 'ledger',
  })
  expect(data.rows('ledgerEntries')[0]).toMatchObject({
    amountCents: 3200,
    receiptMediaId: 'fixture-receipt',
    payerMemberKey: 'user_partner',
  })

  const followup = await data.propose('刚才那笔是多少钱', {
    action: 'ledger_query',
    target: { ref: 'W1' },
    query: { kind: 'find' },
  })
  expect(followup).toMatchObject({
    kind: 'answer',
    candidates: [{ ref: 'R1', amountCents: 3200 }],
    referenceVersion: expect.any(Number),
  })
  expect(followup.candidates[0]).not.toHaveProperty('fingerprint')
  expect(followup.candidates[0]).not.toHaveProperty('entryId')
  expect(await data.call('source', { ref: 'R1', referenceVersion: followup.referenceVersion })).toEqual({
    kind: 'source',
    entryId: 'ledger_fixture',
  })
  await data.db
    .collection('ledgerEntries')
    .doc('ledger_fixture')
    .update({ data: { amountCents: 3400 } })
  expect(await data.call('source', { ref: 'R1', referenceVersion: followup.referenceVersion })).toEqual({
    kind: 'record_changed',
  })
})
