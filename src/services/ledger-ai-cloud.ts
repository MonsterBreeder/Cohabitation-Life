// “问账本”唯一前端调用入口：只发送问题与临时编号，并严格拒绝包含内部字段的云端响应。
import { cloudEnvironmentId, hasCloudEnvironment } from '../config/cloud'
import type { LedgerAiAnswer, LedgerAiAnsweredResult, LedgerAiCandidate, LedgerAiFailureResult, LedgerAiMatchReason, LedgerAiResult, LedgerAiSourceResult, LedgerAiSourcesResult, LedgerAiStatusResult } from '../types/ledger-ai'

interface LedgerAiCloudRuntime {
  cloud?: {
    init(options: { env: string }): void
    callFunction(options: { name: string; data: Record<string, unknown> }): Promise<{ result: unknown }>
  }
}
let runtimeForTesting: LedgerAiCloudRuntime | undefined
let environmentForTesting: string | undefined
let initialized = false
let householdId = ''
let timeoutMs = 30_000

export class LedgerAiCloudError extends Error {
  constructor(public readonly code: 'CONFIGURATION' | 'PLATFORM_UNSUPPORTED' | 'TIMEOUT' | 'TEMPORARY_FAILURE' | 'INVALID_RESPONSE', message: string) {
    super(message)
    this.name = 'LedgerAiCloudError'
  }
}
function runtime() {
  const value = runtimeForTesting ?? (globalThis as typeof globalThis & { wx?: LedgerAiCloudRuntime }).wx
  if (!value?.cloud) throw new LedgerAiCloudError('PLATFORM_UNSUPPORTED', '当前环境暂不支持问账本')
  return value.cloud
}
function initialize() {
  if (initialized) return
  const env = environmentForTesting ?? cloudEnvironmentId
  if (!(environmentForTesting === undefined ? hasCloudEnvironment() : env.trim().length > 0)) throw new LedgerAiCloudError('CONFIGURATION', '尚未配置微信云开发环境')
  runtime().init({ env })
  initialized = true
}
export function setLedgerAiCloudContext(value: string): void { householdId = value || '' }
export function setLedgerAiCloudRuntimeForTesting(value: LedgerAiCloudRuntime | undefined): void { runtimeForTesting = value; initialized = false }
export function setLedgerAiCloudEnvironmentForTesting(value: string | undefined): void { environmentForTesting = value; initialized = false }
export function setLedgerAiCloudTimeoutForTesting(value: number): void { timeoutMs = value }
export function resetLedgerAiCloudForTesting(): void { runtimeForTesting = undefined; environmentForTesting = undefined; initialized = false; householdId = ''; timeoutMs = 30_000 }

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index])
}
const REASONS: ReadonlySet<string> = new Set<LedgerAiMatchReason>(['金额接近', '类目相关', '备注提到相关内容', '备注含有相近说法'])
function isCandidate(value: unknown): value is LedgerAiCandidate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (!exactKeys(v, ['sourceRef', 'type', 'amountCents', 'categoryName', 'note', 'occurredAt', 'payerName', 'matchReasons'])) return false
  return /^S(?:[1-9]\d{0,2}|1000)$/.test(String(v.sourceRef)) && ['expense', 'income'].includes(String(v.type)) && Number.isSafeInteger(v.amountCents) && Number(v.amountCents) >= 0 && typeof v.categoryName === 'string' && typeof v.note === 'string' && typeof v.occurredAt === 'string' && typeof v.payerName === 'string' && Array.isArray(v.matchReasons) && v.matchReasons.every((reason) => typeof reason === 'string' && REASONS.has(reason))
}
function areCandidates(value: unknown): value is LedgerAiCandidate[] {
  if (!Array.isArray(value) || value.length > 5 || !value.every(isCandidate)) return false
  return new Set(value.map((item) => item.sourceRef)).size === value.length
}
function isAnswer(value: unknown): value is LedgerAiAnswer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (v.kind === 'candidates') return exactKeys(v, ['kind', 'message', 'candidates', 'totalMatches', 'hasMore']) && typeof v.message === 'string' && areCandidates(v.candidates) && Number.isSafeInteger(v.totalMatches) && Number(v.totalMatches) >= (v.candidates as unknown[]).length && typeof v.hasMore === 'boolean'
  if (v.kind === 'amount') return exactKeys(v, ['kind', 'message', 'totalCents', 'sourceCount', 'range', 'candidates', 'totalMatches', 'hasMore']) && typeof v.message === 'string' && Number.isSafeInteger(v.totalCents) && Number.isSafeInteger(v.sourceCount) && Number.isSafeInteger(v.totalMatches) && v.totalMatches === v.sourceCount && typeof v.hasMore === 'boolean' && (v.range === null || (!!v.range && typeof v.range === 'object' && exactKeys(v.range as Record<string, unknown>, ['start', 'end']) && Object.values(v.range as Record<string, unknown>).every((item) => typeof item === 'string'))) && areCandidates(v.candidates)
  if (v.kind === 'comparison') return exactKeys(v, ['kind', 'message', 'sourceCount', 'groups', 'candidates', 'totalMatches', 'hasMore']) && typeof v.message === 'string' && Number.isSafeInteger(v.sourceCount) && Number.isSafeInteger(v.totalMatches) && v.totalMatches === v.sourceCount && typeof v.hasMore === 'boolean' && areCandidates(v.candidates) && Array.isArray(v.groups) && v.groups.length === 2 && v.groups.every((group) => !!group && typeof group === 'object' && exactKeys(group as Record<string, unknown>, ['label', 'totalCents']) && typeof (group as Record<string, unknown>).label === 'string' && Number.isSafeInteger((group as Record<string, unknown>).totalCents))
  if (v.kind === 'stats_redirect') return exactKeys(v, ['kind', 'message']) && typeof v.message === 'string'
  if (v.kind === 'no_evidence') return exactKeys(v, ['kind', 'message', 'candidates']) && typeof v.message === 'string' && Array.isArray(v.candidates) && v.candidates.length === 0
  return false
}
function isResult(value: unknown): value is LedgerAiResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  if (v.status === 'ANSWERED') return exactKeys(v, ['status', 'retryable', 'remainingQuestions', 'answer']) && v.retryable === false && Number.isInteger(v.remainingQuestions) && isAnswer(v.answer)
  if (v.status === 'SOURCE_RESOLVED') return exactKeys(v, ['status', 'retryable', 'entryId']) && v.retryable === false && typeof v.entryId === 'string' && v.entryId.length > 8
  if (v.status === 'SOURCES_RESOLVED') return exactKeys(v, ['status', 'retryable', 'candidates', 'nextOffset', 'hasMore']) && v.retryable === false && areCandidates(v.candidates) && Number.isInteger(v.nextOffset) && Number(v.nextOffset) >= 5 && Number(v.nextOffset) <= 1000 && typeof v.hasMore === 'boolean'
  // 同一个额度耗尽状态可能来自状态检查（带剩余次数）或提问失败（带错误文案），必须按字段形态分别校验。
  if (['READY', 'DISABLED', 'DAILY_LIMIT_REACHED'].includes(String(v.status)) || (v.status === 'PLATFORM_QUOTA_EXHAUSTED' && 'remainingQuestions' in v)) return exactKeys(v, ['status', 'retryable', 'remainingQuestions']) && typeof v.retryable === 'boolean' && Number.isInteger(v.remainingQuestions)
  if (['INVALID_REQUEST', 'FORBIDDEN', 'EXPIRED', 'CANDIDATE_CHANGED', 'MODEL_UNAVAILABLE', 'PLATFORM_QUOTA_EXHAUSTED', 'TEMPORARY_FAILURE'].includes(String(v.status))) return (exactKeys(v, ['status', 'retryable', 'errorMessage']) || exactKeys(v, ['status', 'retryable', 'errorMessage', 'remainingQuestions'])) && typeof v.retryable === 'boolean' && typeof v.errorMessage === 'string' && (v.remainingQuestions === undefined || Number.isInteger(v.remainingQuestions))
  return false
}
async function call(action: 'status' | 'ask' | 'source' | 'sources', payload: Record<string, unknown>): Promise<LedgerAiResult> {
  initialize()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new LedgerAiCloudError('TIMEOUT', '问账本响应超时')), timeoutMs) })
    const response = await Promise.race([runtime().callFunction({ name: 'ledger-ai', data: { action, householdId, ...payload } }), timeout])
    if (!isResult(response?.result)) throw new LedgerAiCloudError('INVALID_RESPONSE', '问账本响应格式错误')
    return response.result
  } catch (error) {
    if (error instanceof LedgerAiCloudError) throw error
    throw new LedgerAiCloudError('TEMPORARY_FAILURE', '问账本暂时不可用')
  } finally { if (timer) clearTimeout(timer) }
}
export async function getLedgerAiStatus(): Promise<LedgerAiStatusResult | LedgerAiFailureResult> { return await call('status', {}) as LedgerAiStatusResult | LedgerAiFailureResult }
export async function askLedgerAi(input: { question: string; sessionId: string; requestId: string }): Promise<LedgerAiAnsweredResult | LedgerAiStatusResult | LedgerAiFailureResult> { return await call('ask', { question: input.question, sessionId: input.sessionId, requestId: input.requestId }) as LedgerAiAnsweredResult | LedgerAiStatusResult | LedgerAiFailureResult }
/** 点击候选时用当前会话的临时序号换取真实详情目标；云端会重新校验家庭和账目状态。 */
export async function resolveLedgerAiSource(input: { sessionId: string; sourceRef: string }): Promise<LedgerAiSourceResult | LedgerAiFailureResult> { return await call('source', input) as LedgerAiSourceResult | LedgerAiFailureResult }
/** 只从当前短时会话继续读取已匹配来源，不再调用模型或扣减次数。 */
export async function loadLedgerAiSources(input: { sessionId: string; offset: number }): Promise<LedgerAiSourcesResult | LedgerAiFailureResult> { return await call('sources', input) as LedgerAiSourcesResult | LedgerAiFailureResult }
