// 问账本页面的纯展示规则：集中示例、输入限制和受控错误文案，页面不解析平台原始错误。
import { validateDisplayText } from '../../../utils/display-text'

export const LEDGER_AI_CONSENT_VERSION = 'ledger-ai-consent-v1'
export const ledgerAiExamples = ['两百元左右的火锅支出', '去年买电饭煲是哪一笔', '上个月餐饮花了多少'] as const
export const LEDGER_AI_STATS_URL = '/subpackages/ledger/ledger-stats/index'

export function validateLedgerAiQuestion(value: string): { valid: true; value: string; count: number } | { valid: false; message: string; count: number } {
  const result = validateDisplayText(value, 200)
  if (result.valid) return result
  if (result.reason === 'too_long') return { valid: false, message: '问题最多 200 个字。', count: result.count }
  if (result.reason === 'multiline') return { valid: false, message: '请用一段话描述要找的账目。', count: result.count }
  return { valid: false, message: '先说说你想找哪笔账。', count: result.count }
}

export function describeLedgerAiError(status: string): string {
  switch (status) {
    case 'DISABLED': return '问账本正在准备中，原账本仍可正常使用。'
    case 'DAILY_LIMIT_REACHED': return '这个家庭今天的 10 次提问已经用完，明天再来吧。'
    case 'PLATFORM_QUOTA_EXHAUSTED': return '体验额度暂不可用，原账本仍可正常使用。'
    case 'FORBIDDEN': return '你已经没有这个家庭的访问权限。'
    case 'INVALID_REQUEST': return '这句话暂时无法理解，请补充金额、用途或时间。'
    case 'MODEL_UNAVAILABLE': return '问账本暂时没有回答，请稍后重试。'
    case 'EXPIRED': return '本次结果已经过期，请重新提问。'
    case 'CANDIDATE_CHANGED': return '这笔账已经发生变化，请重新查找。'
    default: return '问账本暂时不可用，请稍后重试。'
  }
}
