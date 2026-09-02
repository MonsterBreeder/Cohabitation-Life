// 模型适配器测试：限制查询计划和检索后回答事实，防止内部字段进入模型。
declare function require(path: string): any
const { createModelAdapter, extractJson, buildAnswerPrompt, describeModelFailure } = require('../../cloudfunctions/ledger-ai/model-adapter')

describe('ledger-ai model adapter', () => {
  test('支持纯 JSON 和代码块中的 JSON', () => {
    expect(extractJson('{"kind":"find","noteTerms":["火锅"]}')).toMatchObject({ kind: 'find' })
    expect(extractJson('```json\n{"kind":"trend"}\n```')).toEqual({ kind: 'trend' })
  })
  test('自由文本会被拒绝', () => {
    expect(() => extractJson('我觉得是第一笔')).toThrow('MODEL_RESPONSE_INVALID')
  })

  test('检索结果只向模型提供展示白名单字段', () => {
    const prompt = buildAnswerPrompt({
      kind: 'candidates', message: '找到 1 笔', householdId: 'secret-home',
      candidates: [{ sourceRef: 'S1', type: 'expense', amountCents: 19800, categoryName: '餐饮', note: '火锅', occurredAt: '2026-08-15T12:00:00.000Z', payerName: '我', matchReasons: ['金额接近'], entryId: 'secret-entry', receiptMediaId: 'cloud://secret' }],
    })
    expect(prompt).toContain('"sourceRef":"S1"')
    expect(prompt).not.toContain('secret-home')
    expect(prompt).not.toContain('secret-entry')
    expect(prompt).not.toContain('cloud://secret')
  })

  test('模型失败日志会移除问题正文和云端编号', () => {
    const failure = describeModelFailure(
      { name: 'CloudBaseError', code: 'MODEL_DISABLED', message: '最近的交通支出有哪些 env cloud1-secret request abcdef12-3456-7890-abcd-ef1234567890' },
      '最近的交通支出有哪些',
    )

    expect(failure).toEqual({ name: 'CloudBaseError', code: 'MODEL_DISABLED', message: '[问题已隐藏] env [环境已隐藏] request [编号已隐藏]' })
  })

  test('云函数内使用当前环境标记，避免模型请求丢失环境编号', () => {
    const createModel = jest.fn(() => ({ generateText: jest.fn() }))
    const init = jest.fn(() => ({ ai: () => ({ createModel }) }))
    const currentEnv = Symbol('current')

    createModelAdapter({ init, SYMBOL_CURRENT_ENV: currentEnv, SYMBOL_DEFAULT_ENV: Symbol('default') })

    expect(init).toHaveBeenCalledWith({ env: currentEnv })
    expect(createModel).toHaveBeenCalledWith('cloudbase')
  })
})
