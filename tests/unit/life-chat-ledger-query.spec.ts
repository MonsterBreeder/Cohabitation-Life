// 文件用途：用同一批虚构账目对照新旧查账，并检查两段时间比较。
import { buildLedgerAnswer } from '../../cloudfunctions/ledger-ai/ledger-ai-domain'
import { buildLifeChatLedgerAnswer } from '../../cloudfunctions/life-chat/ledger-query'

// 三笔固定账目用于检查日期、收支、成员和已删除边界。
const entries = [
  {
    id: 'oct',
    occurredAt: '2026-10-15T12:00:00+08:00',
    amountCents: 1250,
    type: 'expense',
    categoryName: '餐饮',
    note: '面条',
    payerRole: 'self',
  },
  {
    id: 'nov',
    occurredAt: '2026-11-15T12:00:00+08:00',
    amountCents: 2999,
    type: 'expense',
    categoryName: '餐饮',
    note: '午饭',
    payerRole: 'other',
  },
  {
    id: 'hidden',
    occurredAt: '2026-11-16T12:00:00+08:00',
    amountCents: 5555,
    type: 'expense',
    categoryName: '餐饮',
    note: '咖啡',
    payerRole: 'other',
    deletedAt: '2026-11-16T15:00:00+08:00',
  },
]

describe('聊天助手查账', () => {
  test.each([
    { kind: 'find', noteTerms: ['面条'] },
    { kind: 'sum', entryType: 'expense', categoryTerms: ['餐饮'] },
    { kind: 'compare', compareBy: 'payer', entryType: 'expense' },
    { kind: 'trend' },
  ])('旧查询条件按同一批真实结构数据得到相同结果：%j', (plan) => {
    expect(buildLifeChatLedgerAnswer(plan, entries)).toEqual(buildLedgerAnswer(plan, entries))
  })

  test('比较两个完整日期区间，只用各自范围的有效账目', () => {
    const plan = {
      kind: 'compare',
      compareBy: 'period',
      entryType: 'expense',
      categoryTerms: ['餐饮'],
      dateRange: { start: '2026-10-01', end: '2026-10-31' },
      otherDateRange: { start: '2026-11-01', end: '2026-11-30' },
    }
    const answer = buildLifeChatLedgerAnswer(plan, entries)
    expect(answer.groups.map((group: { totalCents: number }) => group.totalCents)).toEqual([1250, 2999])
    expect(Object.values(answer.sourceMap).map((source) => (source as { entryId: string }).entryId)).toEqual([
      'oct',
      'nov',
    ])
    expect(() =>
      buildLifeChatLedgerAnswer(
        { ...plan, otherDateRange: { start: '2026-02-01', end: '2026-02-30' } },
        entries,
      ),
    ).toThrow('日期无效')
  })
})
