// 问账本页面规则测试：保护输入边界、示例填充和错误文案。
import { describeLedgerAiError, ledgerAiExamples, validateLedgerAiQuestion } from '../../src/subpackages/ledger/ledger-ai/ledger-ai-view'

describe('ledger-ai-view', () => {
  test('示例以模糊找账为主', () => {
    expect(ledgerAiExamples).toContain('两百元左右的火锅支出')
    expect(ledgerAiExamples).toContain('去年买电饭煲是哪一笔')
  })
  test('空白和超过 200 个显示字符在本地拒绝', () => {
    expect(validateLedgerAiQuestion('   ').valid).toBe(false)
    expect(validateLedgerAiQuestion('账'.repeat(201))).toMatchObject({ valid: false, message: '问题最多 200 个字。' })
    expect(validateLedgerAiQuestion('去年买电饭煲是哪一笔')).toMatchObject({ valid: true })
  })
  test('各类失败使用明确且不泄露平台细节的文案', () => {
    expect(describeLedgerAiError('DAILY_LIMIT_REACHED')).toContain('今天的 10 次')
    expect(describeLedgerAiError('PLATFORM_QUOTA_EXHAUSTED')).toContain('原账本仍可正常使用')
    expect(describeLedgerAiError('FORBIDDEN')).toContain('家庭')
  })
})
