// 文件用途：从既有微信云开发环境发送固定聊天动作，只接收足以展示的结构化结果。
import { cloudEnvironmentId, lifeChatPreviewFunctionName } from '../config/cloud'

export interface ChatCandidate {
  ref: string
  amountCents: number
  categoryName: string
  note: string
  occurredAt: string
  date?: string
  payerName: string
}

export interface ChatField {
  label: string
  before: string | number
  after: string | number
}

export interface LifeChatResult {
  kind: string
  state?: string
  version?: number
  sessionId?: string
  referenceVersion?: number
  candidates?: ChatCandidate[]
  hasMore?: boolean
  nextOffset?: number
  range?: { start: string; end: string }
  message?: string
  question?: string
  text?: string
  options?: string[]
  remainingActions?: { credential: string; count: number }
  credential?: string
  title?: string
  label?: string
  fields?: ChatField[]
  action?: 'create' | 'update' | 'delete'
  domain?: 'ledger' | 'task' | 'footprint'
  entryId?: string
  id?: string
  placeName?: string
  placeCandidate?: string
  operationId?: string
}

interface Runtime {
  init(options: { env: string }): void
  callFunction(options: { name: string; data: Record<string, unknown> }): Promise<{ result: unknown }>
}

const VALID_KINDS = new Set([
  'ready',
  'opened',
  'closed',
  'answer',
  'sources',
  'source',
  'stats',
  'clarify',
  'choose_action',
  'choose_record',
  'choose_place',
  'confirm',
  'saved',
  'ledger_draft',
  'cancelled',
  'invalid_request',
  'invalid_suggestion',
  'unsupported',
  'record_changed',
  'out_of_scope',
  'terminal',
  'forbidden',
  'daily_limit',
  'preview_limit',
  'question_limit',
  'unknown',
  'not_saved',
  'expired',
  'disabled',
  'unavailable',
  'busy',
  'duplicate',
  'narrow_scope',
  'content_rejected',
  'content_check_unavailable',
])

/** 运行数据始终来自固定云函数，未知结果按失败处理，不渲染云端原始错误。 */
function resultOf(value: unknown): LifeChatResult | null {
  if (
    !value ||
    typeof value !== 'object' ||
    !('kind' in value) ||
    typeof value.kind !== 'string' ||
    !VALID_KINDS.has(value.kind)
  )
    return null
  const result = value as LifeChatResult
  if (result.kind === 'opened' && typeof result.sessionId !== 'string') return null
  if (
    result.kind === 'confirm' &&
    (typeof result.credential !== 'string' ||
      typeof result.operationId !== 'string' ||
      !Array.isArray(result.fields))
  )
    return null
  if (['answer', 'sources'].includes(result.kind) && !Array.isArray(result.candidates)) return null
  return result
}

/** 首页只提供当前家庭作为操作目标，成员身份在后台取自微信上下文。 */
export function createLifeChatClient(householdId: string, injected?: Runtime, preview = false) {
  const runtime = injected ?? (globalThis as typeof globalThis & { wx?: { cloud?: Runtime } }).wx?.cloud
  let ready = false
  try {
    if (runtime && cloudEnvironmentId && householdId) {
      runtime.init({ env: cloudEnvironmentId })
      ready = true
    }
  } catch {
    /* 初始化失败由页面显示不可用。 */
  }
  return async (action: string, payload: Record<string, unknown> = {}): Promise<LifeChatResult> => {
    if (!runtime || !ready) return { kind: 'disabled' }
    const missingReply = { kind: action === 'ask' ? 'connection_interrupted' : 'unavailable' }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const data = JSON.parse(JSON.stringify({ ...payload, action, householdId })) as Record<string, unknown>
      const response = await Promise.race([
        runtime.callFunction({ name: preview ? lifeChatPreviewFunctionName : 'life-chat', data }),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), action === 'ask' ? 60_000 : 15_000)
        }),
      ])
      return (response && resultOf(response.result)) || missingReply
    } catch {
      return missingReply
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}
