// 文件用途：为聊天生成三类业务确认卡，并复用原业务方法保存实际记录。
const { randomUUID } = require('node:crypto')
const { createLedgerRepository } = require('../ledger/index')
const { updateEntry: updateLedger } = require('../ledger/ledger-domain')
const { createTaskRepository } = require('../task/index')
const tasks = require('../task/task-domain')
const footprints = require('../footprint/footprint-domain')
const { createRepository: createFootprintRepository } = require('../footprint/repository-data')
const { checkText: checkTaskText } = require('../task/content-safety')
const { checkText: checkFootprintText } = require('../footprint/content-safety')
const { beijingDay, ChatWriteError, readDocument } = require('./chat-store')
const { fingerprint } = require('./ledger-repository')

const COLLECTIONS = { ledger: 'ledgerEntries', task: 'tasks', footprint: 'footprintEntries' }
const TITLES = { ledger_update: '修改账目', task_create: '新增事项', task_update: '修改事项', task_delete: '删除事项', footprint_create: '新增足迹', footprint_update: '修改足迹', footprint_delete: '删除足迹' }
const TASK_TYPES = { low_stock: '快没了', to_handle: '待处理', expiring: '快到期了' }
const MEALS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }

// 正常业务短文本只用现有规则比较，不拼接数据库查询语句。
function includes(text, term) {
  return String(text ?? '').normalize('NFKC').toLowerCase().includes(term.normalize('NFKC').toLowerCase())
}

// 标准不可用状态时保留当前操作的原话，只返回固定可理解的补问。
function clarify(question) {
  return { response: { kind: 'clarify', question } }
}

// 不把业务主键、内部身份或照片资源放到候选卡的展示字段。
function label(domain, record) {
  if (domain === 'ledger') return `${beijingDay(Date.parse(record.occurredAt))} ${record.note || '账目'} ¥${(record.amountCents / 100).toFixed(2)}`
  if (domain === 'task') return [record.title, record.dueDate].filter(Boolean).join(' · ')
  return `${record.place.name} · ${record.visitedAt}`
}

// 生成当前卡片实际展示的变更，日期和金额都可在点确认前读到。
function line(label, before, after) {
  return { label, before: before ?? '未填写', after: after ?? '未填写' }
}

// 事务再次比较原记录，使用原账本字段或原事项、足迹版本。
function revision(domain, record) {
  if (domain === 'ledger') return fingerprint(record)
  return { version: record.editVersion ?? 0, updatedAt: record.updatedAt, status: record.status ?? null }
}

// 业务读取只在经过身份核对的家庭内取非删除记录，徒步路线另走原入口。
function validRecord(domain, record, householdId) {
  return record?.householdId === householdId && record.deletedAt == null &&
    (domain !== 'footprint' || (record.entryKind !== 'hike' && Boolean(record.place && record.placeKey)))
}

// 让不同业务使用各自的记录、内容检查和提交回执。
function createChatMutations(db, { store, household, identityKey, openId, openapi, now = Date.now }) {
  const householdId = household._id
  const get = async (domain, id, database = db) => {
    const record = await readDocument(database.collection(COLLECTIONS[domain]), id)
    return validRecord(domain, record, householdId) ? record : null
  }

  // 模糊查找只用于候选，截止日、付款金额等仍以实际记录为准。
  async function locate(domain, target, references) {
    if (target?.ref) {
      const source = references.find((entry) => entry.ref === target.ref && entry.domain === domain)
      const record = source && await get(domain, source.id)
      return record && (!source.fingerprint || source.fingerprint === fingerprint(record)) ? [record] : []
    }
    if (!target?.term && !target?.day) return []
    const selector = { householdId, deletedAt: null }
    if (target.day && domain === 'task') selector.dueDate = target.day
    if (target.day && domain === 'footprint') selector.visitedAt = target.day
    if (target.day && domain === 'ledger') {
      const start = new Date(`${target.day}T00:00:00+08:00`)
      const end = new Date(start.getTime() + 86_400_000)
      selector.occurredAt = db.command.gte(start.toISOString()).and(db.command.lt(end.toISOString()))
    }
    const { data } = await db.collection(COLLECTIONS[domain]).where(selector).limit(100).get()
    if (data.length >= 100) throw new ChatWriteError('narrow_scope')
    const categories = target.term && domain === 'ledger' ? await createLedgerRepository(db).findCategoriesByHousehold(householdId) : []
    return data.filter((record) => {
      if (!validRecord(domain, record, householdId)) return false
      if (!target.term) return true
      if (domain === 'task') return includes(record.title, target.term)
      if (domain === 'footprint') return includes(record.place.name, target.term) || includes(record.memory, target.term)
      return includes(record.note, target.term) || categories.some((category) => category._id === record.categoryId && includes(category.name, target.term))
    }).slice(0, 12)
  }

  // 同名地点只有在家中旧足迹一致指向一个位置时才提供候选，其余情况交给地图。
  async function knownPlace(name) {
    const { data } = await db.collection(COLLECTIONS.footprint)
      .where({ householdId, deletedAt: null, 'place.name': name }).limit(20).get()
    if (data.length >= 20) return null
    const found = new Map()
    for (const entry of data) {
      if (validRecord('footprint', entry, householdId)) found.set(entry.placeKey, entry)
    }
    return found.size === 1 ? found.values().next().value : null
  }

  // 目标固定后，统一形成已核对的待确认数据或地图选择状态。
  async function prepare(item, state, chosenId, selectedPlace) {
    const [domain, verb] = item.action.split('_')
    if (!Object.hasOwn(TITLES, item.action)) return { response: { kind: 'unsupported' } }
    let record = null
    if (verb !== 'create') {
      const references = state.recentWrite ? [state.recentWrite, ...state.references] : state.references
      const matches = chosenId ? [await get(domain, chosenId)].filter(Boolean) : await locate(domain, item.target, references)
      if (!matches.length) return item.target?.ref || chosenId ? { response: { kind: 'record_changed' } } : clarify('没找到这条记录，请补充名称或日期。')
      if (matches.length > 1) {
        return { response: { kind: 'choose_record', options: matches.map((match) => label(domain, match)) }, payload: { purpose: 'record', item, ids: matches.map((match) => match._id) } }
      }
      record = matches[0]
      if (domain === 'ledger' && (record.recorderMemberKey || record.payerMemberKey) !== identityKey) return { response: { kind: 'forbidden' } }
      if (domain === 'task' && !['pending', 'claimed'].includes(record.status)) return { response: { kind: 'terminal' } }
    }

    const changes = item.changes ?? {}
    const title = TITLES[item.action]
    let fields = []
    let params
    if (verb === 'delete') {
      params = {}
      fields = [line('删除后', label(domain, record), domain === 'footprint' ? '从足迹地图和列表移除' : '从共同事项移除')]
    } else if (domain === 'task') {
      if (verb === 'create' && (!changes.name || !Object.hasOwn(TASK_TYPES, changes.type))) return clarify('请补充事项名称和类型。')
      for (const [key, name] of [['name', '名称'], ['type', '类型'], ['dueDate', '截止日期'], ['note', '备注']]) {
        if (!Object.hasOwn(changes, key)) continue
        const previous = record?.[key === 'name' ? 'title' : key]
        fields.push(key === 'type' ? line(name, TASK_TYPES[previous], TASK_TYPES[changes[key]]) : line(name, previous, changes[key] || null))
      }
      params = changes
    } else if (domain === 'footprint') {
      if (!selectedPlace && (verb === 'create' || changes.placeName)) {
        if (!changes.placeName) return clarify('请告诉我去过哪里。')
        const known = await knownPlace(changes.placeName)
        return {
          response: { kind: 'choose_place', placeName: changes.placeName, placeCandidate: known ? [known.place.name, known.place.address].filter(Boolean).join(' · ') : undefined },
          payload: { purpose: 'map', item, id: record?._id, knownId: known?._id, knownKey: known?.placeKey },
        }
      }
      const place = selectedPlace ? footprints.normalisePlace(selectedPlace) : record.place
      const visitedAt = footprints.normaliseVisitedAt(changes.visitedAt ?? record?.visitedAt ?? state.day, new Date(now()))
      params = { ...(selectedPlace ? { place } : {}), ...(changes.visitedAt || verb === 'create' ? { visitedAt } : {}), ...(Object.hasOwn(changes, 'memory') ? { memory: changes.memory } : {}) }
      if (selectedPlace) fields.push(line('地点', record?.place?.name, [place.name, place.address].filter(Boolean).join(' · ')))
      if (Object.hasOwn(params, 'visitedAt')) fields.push(line('游玩日期', record?.visitedAt, visitedAt))
      if (Object.hasOwn(params, 'memory')) fields.push(line('回忆', record?.memory, changes.memory || null))
    } else {
      params = { ...changes }
      if (changes.amountCents !== undefined) fields.push(line('金额', `¥${(record.amountCents / 100).toFixed(2)}`, `¥${(changes.amountCents / 100).toFixed(2)}`))
      if (changes.day) fields.push(line('日期', beijingDay(Date.parse(record.occurredAt)), changes.day))
      if (Object.hasOwn(changes, 'note')) fields.push(line('备注', record.note, changes.note || null))
      if (changes.payerRole) {
        if (changes.payerRole === 'other' && !household.memberKeys.some((member) => member !== identityKey)) return clarify('这个家庭还没有其他可选付款人。')
        fields.push(line('付款人', record.payerMemberKey === identityKey ? '我' : '对方', changes.payerRole === 'self' ? '我' : '对方'))
      }
      const repo = createLedgerRepository(db)
      const originalCategory = await repo.findCategoryById(record.categoryId)
      let category = originalCategory
      if (changes.category) {
        const categories = await repo.findCategoriesByHousehold(householdId)
        const matched = categories.filter((item) => item.name === changes.category && !item.deletedAt && !item.isHiddenBy?.includes(identityKey))
        if (matched.length !== 1) return clarify('请用账本中已有的类目名称。')
        category = matched[0]
        params.categoryId = category._id
        fields.push(line('类目', originalCategory?.name, category.name))
      }
      const dining = category?.key === 'dining' && category.isCustom !== true
      if (changes.mealPeriod && !dining) return clarify('餐饮类目才可以选择餐次。')
      if (Object.hasOwn(changes, 'mealPeriod') || (!dining && record.mealPeriod)) {
        params.mealPeriod = changes.mealPeriod ?? null
        fields.push(line('餐次', MEALS[record.mealPeriod], MEALS[params.mealPeriod]))
      }
    }
    if (!fields.length) return clarify('请说一下要改哪个内容。')
    const operationId = randomUUID()
    return {
      response: { kind: 'confirm', action: verb, title, label: record ? label(domain, record) : '', fields, operationId },
      payload: { purpose: 'write', action: item.action, operationId, params, ...(record ? { id: record._id, revision: revision(domain, record) } : {}) },
    }
  }

  // 点已有地点时重新读取并核对位置，再生成这一笔的新确认卡。
  async function prepareKnownPlace(opened, state) {
    const known = opened.knownId && await get('footprint', opened.knownId)
    if (!known || known.placeKey !== opened.knownKey) return prepare(opened.item, state, opened.id)
    return prepare(opened.item, state, opened.id, known.place)
  }

  // 确认阶段不再调用模型；先查回旧结果，再用原业务事务验证并保存。
  async function confirm(sessionId, active, card) {
    const { operationId, params, id } = card
    const previous = await store.recover(operationId)
    if (previous) return previous
    const [domain, verb] = card.action.split('_')
    const before = id ? await get(domain, id) : null
    const sameRecord = (record) => record && JSON.stringify(revision(domain, record)) === JSON.stringify(card.revision)
    if (id && !sameRecord(before)) return { kind: 'record_changed' }
    const verify = async (tx) => {
      if (id && !sameRecord(await get(domain, id, tx))) throw new ChatWriteError('record_changed')
      if (params.categoryId) {
        const category = await readDocument(tx.collection('ledgerCategories'), params.categoryId)
        if (category?.householdId !== householdId || category.deletedAt || category.name !== params.category) throw new ChatWriteError('record_changed')
      }
    }
    const database = store.forConfirmation(sessionId, active, operationId, verify, (value) => {
      const savedId = id || (domain === 'task' ? value?.task?.id : value?._id)
      return savedId && value !== false ? { kind: 'saved', domain, action: verb, id: savedId } : null
    })
    const keys = { requestId: operationId, operationToken: operationId }
    if (domain === 'ledger') {
      await updateLedger({ ...keys, entryId: id, amountCents: params.amountCents ?? before.amountCents,
        note: params.note ?? before.note, categoryId: params.categoryId ?? before.categoryId, receiptMediaId: before.receiptMediaId,
        occurredAt: params.day ? new Date(`${params.day}T12:00:00+08:00`).toISOString() : before.occurredAt,
        ...(params.payerRole ? { payerMemberKey: params.payerRole } : {}),
        ...(Object.hasOwn(params, 'mealPeriod') ? { mealPeriod: params.mealPeriod } : {}),
      }, { identityKey, selfMemberKey: identityKey, householdId, repository: createLedgerRepository(database), now: () => new Date(now()) })
    } else if (domain === 'task') {
      const deps = { identityKey, repository: createTaskRepository(database), now: () => new Date(now()), checkText: (text) => checkTaskText(text, openId, 1, openapi) }
      if (verb === 'create') await tasks.createTask({ ...keys, ...params, title: params.name }, deps)
      if (verb === 'update') await tasks.updateTask({ ...keys, ...params, taskId: id, editVersion: before.editVersion ?? 0 }, deps)
      if (verb === 'delete') await tasks.deleteTask({ ...keys, taskId: id }, deps)
    } else {
      const deps = { identityKey, repository: createFootprintRepository(database), now: () => new Date(now()), checkText: (text) => checkFootprintText(text, openId, 2, openapi) }
      if (verb === 'create') await footprints.createEntry({ ...keys, ...params, expectedHouseholdId: householdId, photoResourceIds: [] }, deps)
      if (verb === 'update') await footprints.updateEntry({ ...keys, entryId: id, expectedHouseholdId: householdId,
        place: before.place, visitedAt: before.visitedAt, memory: before.memory, photoResourceIds: before.photoResourceIds || [], editVersion: before.editVersion, ...params }, deps)
      if (verb === 'delete') await footprints.deleteEntry({ ...keys, entryId: id }, deps)
    }
    return await store.recover(operationId) || { kind: 'unknown' }
  }

  return {
    prepare,
    prepareKnownPlace,
    confirm,
    // 后端为最近确实保存的事项与足迹提供最短的本页展示线索。
    async recentLabel(reference) {
      const row = await get(reference.domain, reference.id)
      return row ? label(reference.domain, row) : null
    },
  }
}

module.exports = { createChatMutations }
