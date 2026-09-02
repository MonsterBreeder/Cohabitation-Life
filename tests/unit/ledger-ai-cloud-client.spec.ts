// 问账本客户端测试：保护请求最小化、响应白名单和失败状态映射。
import {
  askLedgerAi,
  getLedgerAiStatus,
  resetLedgerAiCloudForTesting,
  setLedgerAiCloudContext,
  setLedgerAiCloudEnvironmentForTesting,
  setLedgerAiCloudRuntimeForTesting,
  resolveLedgerAiSource,
} from '../../src/services/ledger-ai-cloud'

describe('ledger-ai-cloud', () => {
  afterEach(() => resetLedgerAiCloudForTesting())

  function setup(result: unknown) {
    const callFunction = jest.fn(async () => ({ result }))
    setLedgerAiCloudEnvironmentForTesting('test-env')
    setLedgerAiCloudRuntimeForTesting({ cloud: { init: jest.fn(), callFunction } })
    setLedgerAiCloudContext('household_123456789')
    return callFunction
  }

  test('状态和候选回答通过严格校验', async () => {
    setup({ status: 'READY', retryable: false, remainingQuestions: 10 })
    await expect(getLedgerAiStatus()).resolves.toEqual({ status: 'READY', retryable: false, remainingQuestions: 10 })

    setup({
      status: 'ANSWERED', retryable: false, remainingQuestions: 9,
      answer: { kind: 'candidates', message: '找到 1 笔', totalMatches: 1, hasMore: false, candidates: [{ sourceRef: 'S1', type: 'expense', amountCents: 19800, categoryName: '餐饮', note: '火锅', occurredAt: '2026-08-15T12:00:00.000Z', payerName: '我', matchReasons: ['金额接近'] }] },
    })
    await expect(askLedgerAi({ question: '两百左右火锅', sessionId: 'session_12345678', requestId: 'request_12345678' })).resolves.toMatchObject({ status: 'ANSWERED' })
  })

  test('请求不携带模型、成员身份或账目', async () => {
    const callFunction = setup({ status: 'ANSWERED', retryable: false, remainingQuestions: 9, answer: { kind: 'no_evidence', message: '没有找到', candidates: [] } })
    await askLedgerAi({ question: '找火锅', sessionId: 'session_12345678', requestId: 'request_12345678' })
    expect(callFunction).toHaveBeenCalledWith({ name: 'ledger-ai', data: { action: 'ask', householdId: 'household_123456789', question: '找火锅', sessionId: 'session_12345678', requestId: 'request_12345678' } })
  })

  test('候选详情只能通过当前会话临时序号解析', async () => {
    const callFunction = setup({ status: 'SOURCE_RESOLVED', retryable: false, entryId: 'ledger_123456789' })
    await expect(resolveLedgerAiSource({ sessionId: 'session_12345678', sourceRef: 'S1' })).resolves.toMatchObject({ status: 'SOURCE_RESOLVED' })
    expect(callFunction).toHaveBeenCalledWith({ name: 'ledger-ai', data: { action: 'source', householdId: 'household_123456789', sessionId: 'session_12345678', sourceRef: 'S1' } })
  })

  test('查看全部只传会话和分页位置', async () => {
    const callFunction = setup({
      status: 'SOURCES_RESOLVED', retryable: false, nextOffset: 10, hasMore: false,
      candidates: [{ sourceRef: 'S6', type: 'expense', amountCents: 8800, categoryName: '餐饮', note: '晚餐', occurredAt: '2026-08-20T12:00:00.000Z', payerName: '我', matchReasons: ['类目相关'] }],
    })
    const { loadLedgerAiSources } = await import('../../src/services/ledger-ai-cloud')
    await expect(loadLedgerAiSources({ sessionId: 'session_12345678', offset: 5 })).resolves.toMatchObject({ status: 'SOURCES_RESOLVED' })
    expect(callFunction).toHaveBeenCalledWith({ name: 'ledger-ai', data: { action: 'sources', householdId: 'household_123456789', sessionId: 'session_12345678', offset: 5 } })
  })

  test('体验额度耗尽的提问失败会保留错误文案', async () => {
    setup({ status: 'PLATFORM_QUOTA_EXHAUSTED', retryable: false, errorMessage: '体验额度暂不可用，原账本功能不受影响。' })
    await expect(askLedgerAi({ question: '找火锅', sessionId: 'session_12345678', requestId: 'request_12345678' })).resolves.toEqual({
      status: 'PLATFORM_QUOTA_EXHAUSTED', retryable: false, errorMessage: '体验额度暂不可用，原账本功能不受影响。',
    })
  })

  test.each([
    ['percent', { confidence: 0.9 }],
    ['receipt', { receiptMediaId: 'cloud://secret' }],
    ['internal', { householdId: 'secret-home' }],
  ])('候选包含非法字段 %s 时拒绝整包', async (_name, extra) => {
    setup({ status: 'ANSWERED', retryable: false, remainingQuestions: 9, answer: { kind: 'candidates', message: '找到', totalMatches: 1, hasMore: false, candidates: [{ sourceRef: 'S1', type: 'expense', amountCents: 100, categoryName: '餐饮', note: '', occurredAt: '2026-08-15T12:00:00.000Z', payerName: '我', matchReasons: ['类目相关'], ...extra }] } })
    await expect(askLedgerAi({ question: '餐饮', sessionId: 'session_12345678', requestId: 'request_12345678' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
})
