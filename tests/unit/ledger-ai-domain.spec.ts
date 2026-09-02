// “问账本”纯规则测试：保护硬条件、模糊候选、准确金额和安全降级。
declare function require(path: string): any

const {
  buildLedgerAnswer,
  validateQueryPlan,
  validateGeneratedAnswer,
  LedgerAiDomainError,
} = require('../../cloudfunctions/ledger-ai/ledger-ai-domain')

const entries = [
  {
    id: 'entry-hotpot-198', type: 'expense', amountCents: 19800, categoryId: 'cat-dining',
    categoryName: '餐饮', note: '周末海底捞火锅', occurredAt: '2026-08-15T12:00:00.000Z',
    payerRole: 'self', payerName: '我', createdAt: '2026-08-15T12:00:00.000Z',
  },
  {
    id: 'entry-hotpot-230', type: 'expense', amountCents: 23000, categoryId: 'cat-dining',
    categoryName: '餐饮', note: '朋友聚餐吃火锅', occurredAt: '2026-08-21T12:00:00.000Z',
    payerRole: 'other', payerName: '小睦', createdAt: '2026-08-21T12:00:00.000Z',
  },
  {
    id: 'entry-rice-cooker', type: 'expense', amountCents: 35900, categoryId: 'cat-home',
    categoryName: '居家', note: '新家电饭锅', occurredAt: '2025-05-02T12:00:00.000Z',
    payerRole: 'self', payerName: '我', createdAt: '2025-05-02T12:00:00.000Z',
  },
  {
    id: 'entry-income', type: 'income', amountCents: 20000, categoryId: 'cat-other',
    categoryName: '其他', note: '退款', occurredAt: '2026-08-16T12:00:00.000Z',
    payerRole: 'self', payerName: '我', createdAt: '2026-08-16T12:00:00.000Z',
  },
]

describe('ledger-ai-domain', () => {
  test('金额和备注作为软线索排序，支出类型不会被放宽', () => {
    const answer = buildLedgerAnswer({
      kind: 'find', entryType: 'expense', amount: { targetCents: 20000, toleranceCents: 5000 },
      noteTerms: ['火锅'], categoryTerms: [], synonymTerms: [],
    }, entries)

    expect(answer.kind).toBe('candidates')
    expect(answer.candidates.map((item: any) => item.sourceRef)).toEqual(['S1', 'S2'])
    expect(answer.candidates[0].amountCents).toBe(19800)
    expect(answer.candidates.every((item: any) => item.type === 'expense')).toBe(true)
    expect(answer.candidates[0].matchReasons).toEqual(expect.arrayContaining(['金额接近', '备注提到相关内容']))
  })

  test('日期是硬条件，近义词可以帮助找到电饭煲', () => {
    const answer = buildLedgerAnswer({
      kind: 'find', dateRange: { start: '2025-01-01', end: '2025-12-31' },
      noteTerms: ['电饭煲'], synonymTerms: ['电饭锅'], categoryTerms: ['居家'],
    }, entries)

    expect(answer.candidates).toHaveLength(1)
    expect(answer.candidates[0].sourceRef).toBe('S1')
    expect(answer.candidates[0].note).toBe('新家电饭锅')
  })

  test('自然日按中国时区边界计算', () => {
    const boundaryEntries = [
      { ...entries[0], id: 'start-in-china', occurredAt: '2026-07-31T16:00:00.000Z' },
      { ...entries[0], id: 'before-start-in-china', occurredAt: '2026-07-31T15:59:59.999Z' },
    ]
    const answer = buildLedgerAnswer({
      kind: 'sum', dateRange: { start: '2026-08-01', end: '2026-08-01' },
      entryType: 'expense', categoryTerms: ['餐饮'], noteTerms: [], synonymTerms: [],
    }, boundaryEntries)

    expect(answer.sourceCount).toBe(1)
    expect(answer.totalCents).toBe(19800)
  })

  test('只命中日期等弱条件时返回无依据', () => {
    const answer = buildLedgerAnswer({
      kind: 'find', dateRange: { start: '2025-01-01', end: '2025-12-31' },
      noteTerms: ['完全不存在'], synonymTerms: [], categoryTerms: [],
    }, entries)

    expect(answer.kind).toBe('no_evidence')
    expect(answer.candidates).toEqual([])
  })

  test('简单金额由整数分准确相加', () => {
    const answer = buildLedgerAnswer({
      kind: 'sum', dateRange: { start: '2026-08-01', end: '2026-08-31' },
      entryType: 'expense', categoryTerms: ['餐饮'], noteTerms: [], synonymTerms: [],
    }, entries)

    expect(answer.kind).toBe('amount')
    expect(answer.totalCents).toBe(42800)
    expect(answer.sourceCount).toBe(2)
  })

  test('多月份趋势直接分流到统计页', () => {
    expect(buildLedgerAnswer({ kind: 'trend' }, entries)).toEqual({
      kind: 'stats_redirect', message: '多月份变化请到“账本统计”中查看。',
    })
  })

  test('未知字段和无边界查询计划会被拒绝', () => {
    expect(() => validateQueryPlan({ kind: 'find', householdId: 'other-home' })).toThrow(LedgerAiDomainError)
    expect(() => validateQueryPlan({ kind: 'sum' })).toThrow(LedgerAiDomainError)
  })

  test('模型文字引用未知来源或错误金额时降级', () => {
    const facts = buildLedgerAnswer({
      kind: 'sum', dateRange: { start: '2026-08-01', end: '2026-08-31' },
      entryType: 'expense', categoryTerms: ['餐饮'], noteTerms: [], synonymTerms: [],
    }, entries)
    expect(validateGeneratedAnswer('一共 999 元，见 S99。', facts)).toBe('共找到 2 笔，合计 ¥428.00。')
  })

  test('多候选时拒绝模型强行选中唯一账目', () => {
    const facts = buildLedgerAnswer({
      kind: 'find', entryType: 'expense', noteTerms: ['火锅'], categoryTerms: [], synonymTerms: [],
    }, entries)
    expect(validateGeneratedAnswer('确定是 S1，就是这笔。', facts)).toBe('找到 2 笔可能相关的账目，请核对。')
  })

  test('首屏只展示 5 笔但保留全部短时来源供分页', () => {
    const manyEntries = Array.from({ length: 7 }, (_, index) => ({
      ...entries[0], id: `entry-${index + 1}`, amountCents: 1000 + index,
      occurredAt: `2026-08-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
    }))
    const answer = buildLedgerAnswer({ kind: 'find', noteTerms: ['火锅'], categoryTerms: [], synonymTerms: [] }, manyEntries)
    expect(answer.candidates).toHaveLength(5)
    expect(answer.totalMatches).toBe(7)
    expect(answer.hasMore).toBe(true)
    expect(answer.sourceMap.S6.entryId).toBeTruthy()
    expect(answer.sourceMap.S7.entryId).toBeTruthy()
  })

  test('两人比较也返回可核对的参与账目', () => {
    const answer = buildLedgerAnswer({
      kind: 'compare', compareBy: 'payer', entryType: 'expense',
      categoryTerms: ['餐饮'], noteTerms: [], synonymTerms: [],
    }, entries)
    expect(answer.kind).toBe('comparison')
    expect(answer.groups).toEqual([{ label: '我', totalCents: 19800 }, { label: '对方', totalCents: 23000 }])
    expect(answer.candidates).toHaveLength(2)
    expect(answer.sourceMap.S2.entryId).toBe('entry-hotpot-230')
  })
})
