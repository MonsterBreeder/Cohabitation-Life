/** 文件用途：在现有账本云函数内运行线上记账整理，先在数据库限制次数和重复请求。 */
const { createHash } = require('node:crypto')
const { LedgerDomainError } = require('./ledger-domain')

/** 此记录没有批次所属或版本，不出现在账目、历史批次及其清理查询中。 */
const gateId = 'lai_online_gate_v1'
/** 同一实例直接中断在途模型请求，其他实例通过持久登记撤回交付。 */
const active = new Map()

/** 已有登记必须符合本版格式，损坏时关闭入口并保留原记录。 */
function verifyGateRecord(
  /* 从账本后台读到的唯一线上次数登记。 */
  record,
) {
  if (record && (record.kind !== 'online-ai-gate-v1' || !Number.isSafeInteger(record.calls) ||
    record.calls < 0 || record.calls > 100 || !Array.isArray(record.requests) || record.requests.length > 200))
    throw new LedgerDomainError('LEDGER_AI_UNAVAILABLE')
}

/** 只有后端配置命中的当前家庭可以使用线上模块。 */
function createCloudAiCenterClient(
  /* 已通过账本当前身份与家庭核对的可信依赖。 */
  dependencies,
  /* 云函数环境设置，不从页面读取。 */
  environment = process.env,
) {
  /** 发布前明确给出本批次总量，进程重启和日历换日不会补充。 */
  const limit = Number(environment.AI_CENTER_CLOUD_MAX_REQUESTS)
  if (environment.AI_CENTER_CLOUD_BOOKKEEPING !== '1' ||
    environment.AI_CENTER_CLOUD_HOUSEHOLD !== dependencies.householdId ||
    !dependencies.householdId || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new LedgerDomainError('LEDGER_AI_UNAVAILABLE')

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
        /** 事务实际取得的原记录。 */
        const record = await tx.getBatch(gateId)
        verifyGateRecord(record)
        /** 只清理失效的提前取消占位，已计次数的编号仍可防重。 */
        const now = Date.now()
        /** 保留原先已接受的请求及尚未到期的取消。 */
        const requests = (record?.requests || []).filter(
          /** 判断当前登记是否还有防重作用。 */
          (
            /* 当前持久登记。 */
            item,
          ) => item.used || item.expiresAt > now,
        )
        /** 读取当次已占用的累计次数。 */
        let calls = record?.calls || 0
        /** 当前确切请求的旧记录。 */
        const entry = requests.find(
          /** 仅比较本次范围的摘要。 */
          (
            /* 当前可查登记。 */
            item,
          ) => item.key === ref.key,
        )
        if (action === 'begin') {
          if (entry || calls >= limit || requests.length >= 200 || expiresAt <= now ||
            requests.some(
              /** 仍在执行时拒绝同一草稿的另一个请求。 */
              (
                /* 当前可查登记。 */
                item,
              ) => item.scope === ref.scope && item.state === 'running' && item.expiresAt > now,
            )) return false
          calls += 1
          requests.push({ ...ref, used: true, expiresAt, state: 'running' })
        } else if (action === 'finish') {
          if (!entry || entry.state !== 'running' || entry.expiresAt <= now) return false
          entry.state = 'settled'
        } else if (entry) {
          if (entry.state !== 'running') return true
          entry.state = 'cancelled'
        } else {
          if (requests.length >= 200) return false
          requests.push({ ...ref, used: false, expiresAt: now + 65_000, state: 'cancelled' })
        }
        await tx.setBatch({ _id: gateId, kind: 'online-ai-gate-v1', calls, requests })
        return true
      },
    )
  }

  return {
    /** 只读核对本次累计次数，额度用完时页面显示不可用。 */
    async health() {
      /** 此处不登记新的模型请求，也不改已有次数。 */
      const record = await dependencies.repository.getBatch(gateId)
      verifyGateRecord(record)
      if (record?.calls >= limit) throw new LedgerDomainError('LEDGER_AI_UNAVAILABLE')
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
