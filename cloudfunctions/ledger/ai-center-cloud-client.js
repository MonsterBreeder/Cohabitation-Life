/** 文件用途：在现有账本云函数内运行线上记账整理，先在数据库限制次数和重复请求。 */
const { createHash } = require('node:crypto')
const { LedgerDomainError } = require('./ledger-domain')

/** 旧试用登记只用于保留防重事实、核对切换当日用量及收尾旧请求。 */
const legacyGateId = 'lai_online_gate_v1'
/** 按北京时间划分日界线，与云函数所在机器时区无关。 */
const dayMs = 86_400_000
const beijingOffsetMs = 28_800_000
/** 同一实例直接中断在途模型请求，其他实例通过持久登记撤回交付。 */
const active = new Map()

/** 已有登记必须符合本版格式，损坏时关闭入口并保留原记录。 */
function verifyGateRecord(
  /* 从账本后台读到的次数登记。 */
  record,
  /* 区分旧试用登记和当前每日登记。 */
  kind,
) {
  if (record && (record.kind !== kind || !Number.isSafeInteger(record.calls) ||
    record.calls < 0 || record.calls > 100 || !Array.isArray(record.requests) || record.requests.length > 200))
    throw new LedgerDomainError('LEDGER_AI_UNAVAILABLE')
}

/** 计算北京时间的当前日及用量。旧请求的到期时间是其开始时间的上界。 */
function dailyUsage(
  /* 当前家庭的每日登记，可以尚未创建。 */
  record,
  /* 原试用登记，可以不存在。 */
  legacy,
  /* 由云端读取的当前毫秒时间。 */
  now,
) {
  verifyGateRecord(record, 'online-ai-daily-v1')
  verifyGateRecord(legacy, 'online-ai-gate-v1')
  /** 固定北京时间日编号，时钟异常回拨时拒绝覆盖已有用量。 */
  const day = Math.floor((now + beijingOffsetMs) / dayMs)
  if (record && (!Number.isSafeInteger(record.day) || record.day > day))
    throw new LedgerDomainError('LEDGER_AI_UNAVAILABLE')
  /** 已跨日的旧用量保留在原记录，仅当日旧请求占当天额度。 */
  const start = day * dayMs - beijingOffsetMs
  const legacyCalls = legacy?.requests.filter((item) => item.used && item.expiresAt > start).length ?? 0
  return { day, calls: record?.day === day ? record.calls : 0, legacyCalls }
}

/** 只有后端配置命中的当前家庭可以使用线上模块。 */
function createCloudAiCenterClient(
  /* 已通过账本当前身份与家庭核对的可信依赖。 */
  dependencies,
  /* 云函数环境设置，不从页面读取。 */
  environment = process.env,
) {
  /** 使用独立每日设置，避免把旧试用总额度误当成每日额度。 */
  const limit = Number(environment.AI_CENTER_CLOUD_DAILY_MAX_REQUESTS)
  if (environment.AI_CENTER_CLOUD_BOOKKEEPING !== '1' ||
    environment.AI_CENTER_CLOUD_HOUSEHOLD !== dependencies.householdId ||
    !dependencies.householdId || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new LedgerDomainError('LEDGER_AI_UNAVAILABLE')
  /** 只按已核实的家庭分配每日额度，控制记录不进入账目或历史回执。 */
  const gateId = `lai_daily_${createHash('sha256').update(dependencies.householdId).digest('hex')}`

  /** 只在打开线上记账后加载同次发布的 ai-center 生成模块。 */
  let runtime
  try {
    runtime = require('./ai-center-bookkeeping-runtime.cjs')
    runtime.cloudBookkeepingConfig(environment)
  } catch {
    throw new LedgerDomainError('LEDGER_AI_UNAVAILABLE')
  }

  /** 同一原始请求使用同一登记，数据库中不保存原话或实际身份。 */
  function identity(
    /* 由账本域组装的本次请求或取消引用。 */
    value,
  ) {
    /** 只用确定且有限的后端范围，不用文本或模型结果。 */
    const scope = createHash('sha256').update(JSON.stringify([value.userRef, value.householdRef, value.draftId])).digest('hex')
    /** 请求编号绑定原草稿和所属。 */
    const key = createHash('sha256').update(JSON.stringify([scope, value.requestId])).digest('hex')
    return { scope, key }
  }

  /** 在一个事务内处理接受、结算或取消，冲突由云数据库核对。 */
  async function transition(
    /* 当前确切请求引用。 */
    ref,
    /* 固定操作，模型不能选择。 */
    action,
    /* 从当前云函数已经核对的剩余时间计算。 */
    expiresAt,
  ) {
    return dependencies.repository.runTransaction(
      /** 这里只存控制事实，即使数据库重试也不会重复发送模型。 */
      async (
        /* 只用于当前事务的既有账本存储。 */
        tx,
      ) => {
        /** 在同一事务取得计数、旧试用记录和确切请求的防重凭据。 */
        const record = await tx.getBatch(gateId)
        const legacy = action === 'finish' ? undefined : await tx.getBatch(legacyGateId)
        const receiptId = `lai_request_${ref.key}`
        const receipt = action === 'finish' ? undefined : await tx.getBatch(receiptId)
        /** 以实际接受请求时的云端时间确定计入哪一天。 */
        const now = Date.now()
        const { day, calls, legacyCalls } = dailyUsage(record, legacy, now)
        /** 只保留仍在有效期内的请求和提前取消，已接受请求另有防重凭据。 */
        const requests = (record?.requests || []).filter(
          /** 判断当前登记是否还有防重作用。 */
          (
            /* 当前持久登记。 */
            item,
          ) => item.expiresAt > now,
        )
        /** 当前确切请求的旧记录。 */
        const entry = requests.find(
          /** 仅比较本次范围的摘要。 */
          (
            /* 当前可查登记。 */
            item,
          ) => item.key === ref.key,
        )
        /** 切换期间仍拒绝重放旧请求，也允许取消还在处理的旧请求。 */
        const legacyEntry = legacy?.requests.find((item) => item.key === ref.key && (item.used || item.expiresAt > now))
        if (action === 'begin') {
          if (entry || receipt || legacyEntry || calls + legacyCalls >= limit || requests.length >= 200 || expiresAt <= now ||
            requests.concat(legacy?.requests ?? []).some(
              /** 仍在执行时拒绝同一草稿的另一个请求。 */
              (
                /* 当前可查登记。 */
                item,
              ) => item.scope === ref.scope && item.state === 'running' && item.expiresAt > now,
            )) return false
          // 同时保存防重事实与当天用量，跨日或进程重启仍拒绝同一个请求。
          await tx.setBatch({ _id: receiptId, kind: 'online-ai-request-v1' })
          requests.push({ ...ref, used: true, expiresAt, state: 'running' })
        } else if (action === 'finish') {
          if (!entry || entry.state !== 'running' || entry.expiresAt <= now) return false
          entry.state = 'settled'
        } else if (entry) {
          if (entry.state !== 'running') return true
          entry.state = 'cancelled'
        } else if (legacyEntry) {
          if (legacyEntry.state === 'running' && legacyEntry.expiresAt > now) {
            legacyEntry.state = 'cancelled'
            await tx.setBatch(legacy)
          }
          return true
        } else if (receipt) {
          return true
        } else {
          if (requests.length >= 200) return false
          requests.push({ ...ref, used: false, expiresAt: now + 65_000, state: 'cancelled' })
        }
        await tx.setBatch({ _id: gateId, kind: 'online-ai-daily-v1', day, calls: calls + (action === 'begin' ? 1 : 0), requests })
        return true
      },
    )
  }

  return {
    /** 只读核对当前北京时间日的次数，零点之后立即按新一天判断。 */
    async health() {
      /** 此处不登记新的模型请求，也不改已有次数。 */
      const record = await dependencies.repository.getBatch(gateId)
      const legacy = await dependencies.repository.getBatch(legacyGateId)
      const { calls, legacyCalls } = dailyUsage(record, legacy, Date.now())
      if (calls + legacyCalls >= limit) throw new LedgerDomainError('LEDGER_AI_UNAVAILABLE')
      return true
    },
    /** 次数登记提交后只执行一次整理。 */
    async understand(
      /* 当前已由账本后台校验的资料。 */
      value,
    ) {
      /** 本次请求独立取消和截止时间。 */
      const ref = identity(value)
      /** 原期限包括数据库登记所需时间。 */
      const expiresAt = Date.now() + Math.min(60_000, value.timeoutMs)
      if (!await transition(ref, 'begin', expiresAt)) throw new LedgerDomainError('LEDGER_AI_BUSY')
      /** 只有同一次执行能取消本实例的模型接收。 */
      const controller = new AbortController()
      active.set(ref.key, controller)
      try {
        /** 登记之后也必须有足够的原请求剩余时间。 */
        const timeoutMs = expiresAt - Date.now()
        if (timeoutMs < 1000) throw new LedgerDomainError('LEDGER_AI_TIMEOUT')
        /** 结果仍是草稿，只有后续原确认流程才能写正式账目。 */
        const result = await runtime.understandCloudBookkeeping({ ...value, timeoutMs }, environment, controller.signal)
        if (controller.signal.aborted || !await transition(ref, 'finish', expiresAt))
          throw new LedgerDomainError('LEDGER_AI_FAILED')
        return result
      } catch (
        /* 只转换已有固定错误，避免供应商正文进入日志。 */
        error
      ) {
        await transition(ref, 'finish', expiresAt)
        if (error instanceof LedgerDomainError) throw error
        if (error?.code === 'DRAFT_TOO_MANY') throw new LedgerDomainError('LEDGER_DRAFT_LIMIT')
        if (error?.code === 'DRAFT_UNSUPPORTED') throw new LedgerDomainError('LEDGER_DRAFT_UNSUPPORTED')
        if (error?.code === 'DRAFT_TIMEOUT') throw new LedgerDomainError('LEDGER_AI_TIMEOUT')
        throw new LedgerDomainError('LEDGER_AI_FAILED')
      } finally {
        active.delete(ref.key)
      }
    },
    /** 取消先记录并拒绝已撤回的结果，已经消耗的次数保留。 */
    async cancel(
      /* 只含本人的确切请求引用。 */
      value,
    ) {
      /** 本次取消只作用于原请求。 */
      const ref = identity(value)
      if (!await transition(ref, 'cancel')) throw new LedgerDomainError('LEDGER_AI_BUSY')
      active.get(ref.key)?.abort()
      return null
    },
  }
}

module.exports = { createCloudAiCenterClient }
