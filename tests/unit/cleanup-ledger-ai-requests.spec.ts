// 临时问答记录清理测试：只删除到期记录，防止提前清除当前会话。
declare function require(path: string): any
const { isExpiredLedgerAiRecord } = require('../../cloudfunctions/cleanup-ledger-ai-requests/cleanup-domain')

describe('cleanup-ledger-ai-requests', () => {
  const now = new Date('2026-08-31T12:00:00.000Z')
  test('到期和未到期记录区分稳定', () => {
    expect(isExpiredLedgerAiRecord({ expiresAt: '2026-08-31T11:59:59.000Z' }, now)).toBe(true)
    expect(isExpiredLedgerAiRecord({ expiresAt: '2026-08-31T12:00:01.000Z' }, now)).toBe(false)
    expect(isExpiredLedgerAiRecord({ expiresAt: 'invalid' }, now)).toBe(false)
  })
})
