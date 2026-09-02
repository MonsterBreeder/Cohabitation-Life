// “问账本”前后端公开契约：只包含页面展示所需数据，明确排除家庭、成员和凭证内部字段。
export type LedgerAiMatchReason = '金额接近' | '类目相关' | '备注提到相关内容' | '备注含有相近说法'

export interface LedgerAiCandidate {
  sourceRef: string
  type: 'expense' | 'income'
  amountCents: number
  categoryName: string
  note: string
  occurredAt: string
  payerName: string
  matchReasons: LedgerAiMatchReason[]
}

export type LedgerAiAnswer =
  | { kind: 'candidates'; message: string; candidates: LedgerAiCandidate[]; totalMatches: number; hasMore: boolean }
  | { kind: 'amount'; message: string; totalCents: number; sourceCount: number; range: { start: string; end: string } | null; candidates: LedgerAiCandidate[]; totalMatches: number; hasMore: boolean }
  | { kind: 'comparison'; message: string; sourceCount: number; groups: Array<{ label: string; totalCents: number }>; candidates: LedgerAiCandidate[]; totalMatches: number; hasMore: boolean }
  | { kind: 'stats_redirect'; message: string }
  | { kind: 'no_evidence'; message: string; candidates: [] }

export interface LedgerAiStatusResult {
  status: 'READY' | 'DISABLED' | 'DAILY_LIMIT_REACHED' | 'PLATFORM_QUOTA_EXHAUSTED'
  retryable: boolean
  remainingQuestions: number
}

export interface LedgerAiAnsweredResult {
  status: 'ANSWERED'
  retryable: false
  remainingQuestions: number
  answer: LedgerAiAnswer
}
export interface LedgerAiSourceResult { status: 'SOURCE_RESOLVED'; retryable: false; entryId: string }
export interface LedgerAiSourcesResult { status: 'SOURCES_RESOLVED'; retryable: false; candidates: LedgerAiCandidate[]; nextOffset: number; hasMore: boolean }

export type LedgerAiFailureStatus = 'INVALID_REQUEST' | 'FORBIDDEN' | 'EXPIRED' | 'CANDIDATE_CHANGED' | 'MODEL_UNAVAILABLE' | 'PLATFORM_QUOTA_EXHAUSTED' | 'TEMPORARY_FAILURE'
export interface LedgerAiFailureResult { status: LedgerAiFailureStatus; retryable: boolean; errorMessage: string; remainingQuestions?: number }
export type LedgerAiResult = LedgerAiStatusResult | LedgerAiAnsweredResult | LedgerAiSourceResult | LedgerAiSourcesResult | LedgerAiFailureResult
