// 文件用途：用真实的额度判断和受控仓储核对北京时间换日、并发和试用记录切换。
import { createHash, randomUUID } from 'node:crypto'

jest.mock('../../cloudfunctions/ledger/ai-center-bookkeeping-runtime.cjs', () => ({
  // 只替换模型入口，额度判断、请求登记与撤回使用正式实现。
  cloudBookkeepingConfig: jest.fn(),
  understandCloudBookkeeping: jest.fn(),
}), { virtual: true })

const { createCloudAiCenterClient } = require('../../cloudfunctions/ledger/ai-center-cloud-client.js')
const { fixture } = require('../fixtures/ledger-ai.cjs')
const model = jest.requireMock('../../cloudfunctions/ledger/ai-center-bookkeeping-runtime.cjs')
  .understandCloudBookkeeping as jest.Mock

// 用北京时间零点前后同一毫秒边界检验归属。
const midnight = Date.parse('2026-11-12T00:00:00+08:00')
const unavailable = { code: 'LEDGER_AI_UNAVAILABLE' }
const refused = { code: 'LEDGER_AI_BUSY' }

/** 创建独立的家庭事务和明确的每日上限。 */
function scenario(limit = 50) {
  const data = fixture()
  const environment = {
    AI_CENTER_CLOUD_BOOKKEEPING: '1',
    AI_CENTER_CLOUD_HOUSEHOLD: data.deps.householdId,
    AI_CENTER_CLOUD_DAILY_MAX_REQUESTS: String(limit),
  }
  return { ...data, environment, client: createCloudAiCenterClient(data.deps, environment) }
}

/** 两个家庭成员分别使用不同草稿，但共享同一个家庭编号。 */
function request(userRef = 'owner') {
  return { userRef, householdRef: 'test-home', draftId: randomUUID(), requestId: randomUUID(), timeoutMs: 60_000 }
}

beforeEach(() => {
  model.mockReset().mockResolvedValue({ ready: true })
})

afterEach(() => jest.restoreAllMocks())

test('家庭并发最多使用五十次，零点后恢复且拒绝重放旧请求', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(midnight - 1)
  const { client, batches, deps, environment } = scenario()
  const attempts = Array.from({ length: 51 }, (_, index) => request(index % 2 ? 'owner' : 'partner'))
  const results = await Promise.allSettled(attempts.map((attempt) => client.understand(attempt)))
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(50)
  expect(results[50]).toMatchObject({ status: 'rejected', reason: refused })
  expect(model).toHaveBeenCalledTimes(50)
  await expect(client.health()).rejects.toMatchObject(unavailable)

  clock.mockReturnValue(midnight)
  const restarted = createCloudAiCenterClient(deps, environment)
  const previousRecords = JSON.stringify([...batches])
  await expect(restarted.health()).resolves.toBe(true)
  expect(JSON.stringify([...batches])).toBe(previousRecords)
  clock.mockReturnValue(midnight + 120_000)
  await expect(restarted.understand(attempts[0])).rejects.toMatchObject(refused)
  await expect(restarted.understand(request())).resolves.toEqual({ ready: true })
  expect(model).toHaveBeenCalledTimes(51)
})

test.each(['完成', '取消'])('零点前占用的请求可在零点后%s，且不占新一天额度', async (outcome) => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(midnight - 1)
  const { client } = scenario(1)
  const original = request()
  // 与线上 Node.js 20 使用同一套可手动推进的等待方式。
  let notifyStarted!: () => void
  let deliverResult!: (result: { ready: boolean }) => void
  const started = new Promise<void>((resolve) => { notifyStarted = resolve })
  const response = new Promise<{ ready: boolean }>((resolve) => { deliverResult = resolve })
  model.mockImplementationOnce(() => {
    notifyStarted()
    return response
  })
  const pending = client.understand(original)
  // 提前监听失败，避免取消路径在测试期间形成未处理拒绝。
  const settled = Promise.allSettled([pending])
  await started
  await expect(client.health()).rejects.toMatchObject(unavailable)

  clock.mockReturnValue(midnight)
  await expect(client.health()).resolves.toBe(true)
  await expect(client.understand({ ...original, requestId: randomUUID() })).rejects.toMatchObject(refused)
  if (outcome === '取消') await client.cancel(original)
  deliverResult({ ready: true })
  await expect(settled).resolves.toEqual(outcome === '完成'
    ? [{ status: 'fulfilled', value: { ready: true } }]
    : [{ status: 'rejected', reason: expect.objectContaining({ code: 'LEDGER_AI_FAILED' }) }])
  await expect(client.understand(request())).resolves.toEqual({ ready: true })
  await expect(client.health()).rejects.toMatchObject(unavailable)
})

test('切换时只计入当天旧用量，保留原记录并继续防止旧请求重复发送', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(midnight + 120_000)
  const { client, batches } = scenario(2)
  const old = request()
  const scope = createHash('sha256').update(JSON.stringify([old.userRef, old.householdRef, old.draftId])).digest('hex')
  const key = createHash('sha256').update(JSON.stringify([scope, old.requestId])).digest('hex')
  const legacy = {
    _id: 'lai_online_gate_v1', kind: 'online-ai-gate-v1', calls: 2,
    requests: [
      { key, scope, used: true, expiresAt: midnight, state: 'settled' },
      { key: 'today', scope, used: true, expiresAt: midnight + 60_000, state: 'settled' },
    ],
  }
  batches.set(legacy._id, structuredClone(legacy))
  await expect(client.health()).resolves.toBe(true)
  await expect(client.understand(old)).rejects.toMatchObject(refused)
  await expect(client.understand(request())).resolves.toEqual({ ready: true })
  await expect(client.health()).rejects.toMatchObject(unavailable)
  expect(model).toHaveBeenCalledTimes(1)
  expect(batches.get(legacy._id)).toEqual(legacy)
})

test('提前取消不扣次数，发送后的失败保留已占额度', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(midnight)
  const { client } = scenario(1)
  const cancelled = request()
  await client.cancel(cancelled)
  await expect(client.understand(cancelled)).rejects.toMatchObject(refused)
  expect(model).not.toHaveBeenCalled()
  await expect(client.health()).resolves.toBe(true)
  model.mockRejectedValueOnce(new Error('虚构模型失败'))
  await expect(client.understand(request())).rejects.toMatchObject({ code: 'LEDGER_AI_FAILED' })
  await expect(client.health()).rejects.toMatchObject(unavailable)
})
