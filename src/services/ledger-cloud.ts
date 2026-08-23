// 家庭共同流水账模块的云端客户端（PRD 008）。
// 模式与 task-cloud.ts 一致：
// 1) 严格校验响应（白名单字段），防止云端任意文字或伪造字段进入页面；
// 2) init / 超时 / 测试注入模式与 household-cloud / task-cloud 完全对齐；
// 3) 每次调用携带 requestId + operationToken，由云端做幂等去重。

import { cloudEnvironmentId, hasCloudEnvironment } from '../config/cloud'
import type {
  AddLedgerCategoryRequest,
  AddLedgerCategoryResult,
  AddLedgerEntryRequest,
  AddLedgerEntryResult,
  DeleteLedgerEntryRequest,
  DeleteLedgerEntryResult,
  GetLedgerEntryRequest,
  GetLedgerEntryResult,
  GetLedgerStatsRequest,
  GetLedgerStatsResult,
  InitLedgerCategoriesRequest,
  InitLedgerCategoriesResult,
  LedgerCategory,
  LedgerCategoryColorKey,
  LedgerCategoryIconKey,
  LedgerEntryDetail,
  LedgerEntrySummary,
  LedgerEntryType,
  LedgerStats,
  ListLedgerEntriesRequest,
  ListLedgerEntriesResult,
  RemoveLedgerCategoryRequest,
  RemoveLedgerCategoryResult,
  RestoreLedgerEntryRequest,
  RestoreLedgerEntryResult,
  UpdateLedgerCategoryRequest,
  UpdateLedgerCategoryResult,
  UpdateLedgerEntryRequest,
  UpdateLedgerEntryResult,
} from '../types/ledger'

interface LedgerCloudRuntime {
  cloud?: {
    init(options: { env: string }): void
    callFunction(options: { name: string; data: Record<string, unknown> }): Promise<{ result: unknown }>
  }
}

let initialized = false
let timeoutMs = 10_000
let runtimeForTesting: LedgerCloudRuntime | undefined
let environmentForTesting: string | undefined
// 当前请求上下文：household / self member。每次调云函数都自动注入到 event，
// 让云端可以独立校验身份（不需要前端在每个 action 显式传 householdId）。
let currentHouseholdId = ''
let currentSelfMemberKey = ''

export class LedgerCloudError extends Error {
  constructor(
    public readonly code: 'CONFIGURATION' | 'PLATFORM_UNSUPPORTED' | 'TIMEOUT' | 'TEMPORARY_FAILURE' | 'INVALID_RESPONSE',
    message: string,
  ) {
    super(message)
    this.name = 'LedgerCloudError'
  }
}

function cloudRuntime() {
  const runtime = runtimeForTesting ?? (globalThis as typeof globalThis & { wx?: LedgerCloudRuntime }).wx
  if (!runtime?.cloud) throw new LedgerCloudError('PLATFORM_UNSUPPORTED', '当前环境暂不支持微信云开发')
  return runtime.cloud
}

function initialize(): void {
  if (initialized) return
  const environmentId = environmentForTesting ?? cloudEnvironmentId
  if (!(environmentForTesting === undefined ? hasCloudEnvironment() : environmentId.trim().length > 0)) {
    throw new LedgerCloudError('CONFIGURATION', '尚未配置微信云开发测试环境')
  }
  cloudRuntime().init({ env: environmentId })
  initialized = true
}

export function resetLedgerCloudForTesting(): void {
  initialized = false
  runtimeForTesting = undefined
  environmentForTesting = undefined
  timeoutMs = 10_000
  currentHouseholdId = ''
  currentSelfMemberKey = ''
}

/** 设置当前账本上下文的家庭 + 成员 ID。后续所有 ledger 云函数调用都会自动带上这两个字段。 */
export function setLedgerCloudContext(householdId: string, selfMemberKey: string): void {
  currentHouseholdId = householdId || ''
  currentSelfMemberKey = selfMemberKey || ''
}

export function setLedgerCloudRuntimeForTesting(runtime: LedgerCloudRuntime | undefined): void {
  runtimeForTesting = runtime
  initialized = false
}

export function setLedgerCloudEnvironmentForTesting(environment: string | undefined): void {
  environmentForTesting = environment
  initialized = false
}

export function setLedgerCloudTimeoutForTesting(ms: number): void {
  timeoutMs = ms
}

const ENTRY_TYPE_SET: ReadonlySet<string> = new Set(['expense', 'income'])
const ICON_KEY_SET: ReadonlySet<string> = new Set([
  'fork-spoon', 'car', 'house', 'gamepad', 'first-aid', 'shopping-bag', 'book', 'tag',
])
const COLOR_KEY_SET: ReadonlySet<string> = new Set([
  'amber', 'blue', 'mint', 'coral', 'red', 'purple', 'teal', 'gray',
])

function isPersonAvatarId(value: unknown): value is string {
  return typeof value === 'string' && (value === 'person-neutral' || /^person-\d{2}$/.test(value))
}

function isPayerDisplay(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.memberKey !== 'string' || typeof v.nickname !== 'string') return false
  if (!v.avatar || typeof v.avatar !== 'object') return false
  const av = v.avatar as Record<string, unknown>
  if (av.kind !== 'builtin' || !isPersonAvatarId(av.id)) return false
  if (v.hasLeft !== undefined && typeof v.hasLeft !== 'boolean') return false
  return true
}

export function isLedgerEntry(value: unknown): value is LedgerEntrySummary {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string') return false
  if (typeof v.type !== 'string' || !ENTRY_TYPE_SET.has(v.type)) return false
  if (typeof v.amountCents !== 'number' || !Number.isInteger(v.amountCents) || v.amountCents < 0) return false
  if (typeof v.categoryId !== 'string') return false
  if (typeof v.note !== 'string') return false
  if (typeof v.occurredAt !== 'string') return false
  if (v.receiptMediaId !== null && typeof v.receiptMediaId !== 'string') return false
  if (v.receiptUrl !== undefined && typeof v.receiptUrl !== 'string') return false
  if (!isPayerDisplay(v.payer)) return false
  if (typeof v.createdAt !== 'string') return false
  return true
}

function isLedgerEntryDetail(value: unknown): value is LedgerEntryDetail {
  if (!isLedgerEntry(value)) return false
  const v = value as unknown as Record<string, unknown>
  if (typeof v.updatedAt !== 'string') return false
  if (v.deletedAt !== undefined && v.deletedAt !== null && typeof v.deletedAt !== 'string') return false
  // canEdit / canDelete 是可选的服务端计算字段；存在时必须是 boolean，
  // 缺省时调用方按 detail.payer.memberKey 兜底（不推荐——新部署必须返回）。
  if (v.canEdit !== undefined && typeof v.canEdit !== 'boolean') return false
  if (v.canDelete !== undefined && typeof v.canDelete !== 'boolean') return false
  return true
}

export function isLedgerCategory(value: unknown): value is LedgerCategory {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.id !== 'string') return false
  if (typeof v.key !== 'string') return false
  if (typeof v.name !== 'string') return false
  if (typeof v.iconKey !== 'string' || !ICON_KEY_SET.has(v.iconKey)) return false
  if (typeof v.colorKey !== 'string' || !COLOR_KEY_SET.has(v.colorKey)) return false
  if (typeof v.isCustom !== 'boolean') return false
  if (typeof v.sortOrder !== 'number') return false
  return true
}

function isLedgerStats(value: unknown): value is LedgerStats {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.month !== 'string') return false
  if (typeof v.monthExpenseCents !== 'number') return false
  if (typeof v.monthIncomeCents !== 'number') return false
  if (typeof v.netCents !== 'number') return false
  if (!Array.isArray(v.byCategory) || !Array.isArray(v.byPayer)) return false
  return true
}

function isLedgerFailure(value: unknown): value is { status: string; retryable: boolean; errorMessage: string } {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.status === 'string' && typeof v.retryable === 'boolean' && typeof v.errorMessage === 'string'
}

async function callLedger<TRes>(action: string, payload: Record<string, unknown>): Promise<TRes> {
  initialize()
  const runtime = cloudRuntime()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new LedgerCloudError('TIMEOUT', '账目云函数响应超时')), timeoutMs)
  })
  try {
    const result = await Promise.race([
      runtime.callFunction({
        name: 'ledger',
        data: {
          action,
          householdId: currentHouseholdId,
          selfMemberKey: currentSelfMemberKey,
          ...payload,
        },
      }),
      timeout,
    ])
    const body = (result && (result as { result: unknown }).result) as unknown
    if (isLedgerFailure(body)) {
      return body as TRes
    }
    return body as TRes
  } catch (error) {
    if (error instanceof LedgerCloudError) throw error
    if (error instanceof Error && /timeout|timed out/i.test(error.message)) {
      throw new LedgerCloudError('TIMEOUT', '账目云函数响应超时')
    }
    throw new LedgerCloudError('TEMPORARY_FAILURE', '暂时无法完成账目操作')
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function ensureEntry(value: unknown, action: string): LedgerEntrySummary {
  if (!isLedgerEntry(value)) throw new LedgerCloudError('INVALID_RESPONSE', `${action} 响应格式错误`)
  return value
}

function ensureCategory(value: unknown, action: string): LedgerCategory {
  if (!isLedgerCategory(value)) throw new LedgerCloudError('INVALID_RESPONSE', `${action} 响应格式错误`)
  return value
}

export async function initLedgerCategoriesInCloud(input: InitLedgerCategoriesRequest): Promise<InitLedgerCategoriesResult> {
  const raw = await callLedger<unknown>('initCategories', { ...input })
  if (!raw || typeof raw !== 'object') throw new LedgerCloudError('INVALID_RESPONSE', 'initCategories 响应格式错误')
  const r = raw as Record<string, unknown>
  if (r.status === 'INITED' && Array.isArray(r.categories)) {
    const cats = r.categories.filter(isLedgerCategory)
    if (cats.length !== r.categories.length) throw new LedgerCloudError('INVALID_RESPONSE', 'initCategories 响应包含非法类目')
    return { status: 'INITED', categories: cats as LedgerCategory[] }
  }
  if (isLedgerFailure(r)) return r as unknown as InitLedgerCategoriesResult
  throw new LedgerCloudError('INVALID_RESPONSE', 'initCategories 响应格式错误')
}

export async function addLedgerEntryInCloud(input: AddLedgerEntryRequest): Promise<AddLedgerEntryResult> {
  const raw = await callLedger<unknown>('addEntry', { ...input })
  if (!raw || typeof raw !== 'object') throw new LedgerCloudError('INVALID_RESPONSE', 'addEntry 响应格式错误')
  const r = raw as Record<string, unknown>
  if (r.status === 'ADDED') {
    return { status: 'ADDED', entry: ensureEntry(r.entry, 'addEntry') }
  }
  if (isLedgerFailure(r)) return r as unknown as AddLedgerEntryResult
  throw new LedgerCloudError('INVALID_RESPONSE', 'addEntry 响应格式错误')
}

export async function updateLedgerEntryInCloud(input: UpdateLedgerEntryRequest): Promise<UpdateLedgerEntryResult> {
  const raw = await callLedger<unknown>('updateEntry', { ...input })
  if (!raw || typeof raw !== 'object') throw new LedgerCloudError('INVALID_RESPONSE', 'updateEntry 响应格式错误')
  const r = raw as Record<string, unknown>
  if (r.status === 'UPDATED') {
    return { status: 'UPDATED', entry: ensureEntry(r.entry, 'updateEntry') }
  }
  if (isLedgerFailure(r)) return r as unknown as UpdateLedgerEntryResult
  throw new LedgerCloudError('INVALID_RESPONSE', 'updateEntry 响应格式错误')
}

export async function deleteLedgerEntryInCloud(input: DeleteLedgerEntryRequest): Promise<DeleteLedgerEntryResult> {
  const raw = await callLedger<unknown>('deleteEntry', { ...input })
  if (!raw || typeof raw !== 'object') throw new LedgerCloudError('INVALID_RESPONSE', 'deleteEntry 响应格式错误')
  const r = raw as Record<string, unknown>
  if (r.status === 'DELETED' && typeof r.entryId === 'string' && typeof r.deletedAt === 'string') {
    return { status: 'DELETED', entryId: r.entryId, deletedAt: r.deletedAt }
  }
  if (isLedgerFailure(r)) return r as unknown as DeleteLedgerEntryResult
  throw new LedgerCloudError('INVALID_RESPONSE', 'deleteEntry 响应格式错误')
}

export async function restoreLedgerEntryInCloud(input: RestoreLedgerEntryRequest): Promise<RestoreLedgerEntryResult> {
  const raw = await callLedger<unknown>('restoreEntry', { ...input })
  if (!raw || typeof raw !== 'object') throw new LedgerCloudError('INVALID_RESPONSE', 'restoreEntry 响应格式错误')
  const r = raw as Record<string, unknown>
  if (r.status === 'RESTORED') {
    return { status: 'RESTORED', entry: ensureEntry(r.entry, 'restoreEntry') }
  }
  if (isLedgerFailure(r)) return r as unknown as RestoreLedgerEntryResult
  throw new LedgerCloudError('INVALID_RESPONSE', 'restoreEntry 响应格式错误')
}

export async function listLedgerEntriesInCloud(input: ListLedgerEntriesRequest): Promise<ListLedgerEntriesResult> {
  const raw = await callLedger<unknown>('listEntries', { ...input })
  if (!raw || typeof raw !== 'object') throw new LedgerCloudError('INVALID_RESPONSE', 'listEntries 响应格式错误')
  const r = raw as Record<string, unknown>
  if (r.status === 'LISTED' && Array.isArray(r.entries) && Array.isArray(r.deletedEntries)) {
    const entries = r.entries.filter(isLedgerEntry) as LedgerEntrySummary[]
    const deletedEntries = r.deletedEntries.filter(isLedgerEntry) as LedgerEntrySummary[]
    if (entries.length !== r.entries.length || deletedEntries.length !== r.deletedEntries.length) {
      throw new LedgerCloudError('INVALID_RESPONSE', 'listEntries 响应包含非法账目')
    }
    if (r.hasMore !== undefined && typeof r.hasMore !== 'boolean') {
      throw new LedgerCloudError('INVALID_RESPONSE', 'listEntries 分页信息错误')
    }
    return { status: 'LISTED', entries, deletedEntries, hasMore: r.hasMore as boolean | undefined }
  }
  if (isLedgerFailure(r)) return r as unknown as ListLedgerEntriesResult
  throw new LedgerCloudError('INVALID_RESPONSE', 'listEntries 响应格式错误')
}

export async function getLedgerEntryInCloud(input: GetLedgerEntryRequest): Promise<GetLedgerEntryResult> {
  const raw = await callLedger<unknown>('getEntry', { ...input })
  if (!raw || typeof raw !== 'object') throw new LedgerCloudError('INVALID_RESPONSE', 'getEntry 响应格式错误')
  const r = raw as Record<string, unknown>
  if (r.status === 'LOADED' && isLedgerEntryDetail(r.detail)) {
    return { status: 'LOADED', detail: r.detail }
  }
  if (isLedgerFailure(r)) return r as unknown as GetLedgerEntryResult
  throw new LedgerCloudError('INVALID_RESPONSE', 'getEntry 响应格式错误')
}

export async function addLedgerCategoryInCloud(input: AddLedgerCategoryRequest): Promise<AddLedgerCategoryResult> {
  const raw = await callLedger<unknown>('addCategory', { ...input })
  if (!raw || typeof raw !== 'object') throw new LedgerCloudError('INVALID_RESPONSE', 'addCategory 响应格式错误')
  const r = raw as Record<string, unknown>
  if (r.status === 'ADDED') {
    return { status: 'ADDED', category: ensureCategory(r.category, 'addCategory') }
  }
  if (isLedgerFailure(r)) return r as unknown as AddLedgerCategoryResult
  throw new LedgerCloudError('INVALID_RESPONSE', 'addCategory 响应格式错误')
}

export async function updateLedgerCategoryInCloud(input: UpdateLedgerCategoryRequest): Promise<UpdateLedgerCategoryResult> {
  const raw = await callLedger<unknown>('updateCategory', { ...input })
  if (!raw || typeof raw !== 'object') throw new LedgerCloudError('INVALID_RESPONSE', 'updateCategory 响应格式错误')
  const r = raw as Record<string, unknown>
  if (r.status === 'UPDATED' && isLedgerCategory(r.category) && typeof r.hiddenByMe === 'boolean') {
    return { status: 'UPDATED', category: r.category, hiddenByMe: r.hiddenByMe }
  }
  if (isLedgerFailure(r)) return r as unknown as UpdateLedgerCategoryResult
  throw new LedgerCloudError('INVALID_RESPONSE', 'updateCategory 响应格式错误')
}

export async function removeLedgerCategoryInCloud(input: RemoveLedgerCategoryRequest): Promise<RemoveLedgerCategoryResult> {
  const raw = await callLedger<unknown>('removeCategory', { ...input })
  if (!raw || typeof raw !== 'object') throw new LedgerCloudError('INVALID_RESPONSE', 'removeCategory 响应格式错误')
  const r = raw as Record<string, unknown>
  if (r.status === 'REMOVED' && typeof r.categoryId === 'string') {
    return { status: 'REMOVED', categoryId: r.categoryId }
  }
  if (isLedgerFailure(r)) return r as unknown as RemoveLedgerCategoryResult
  throw new LedgerCloudError('INVALID_RESPONSE', 'removeCategory 响应格式错误')
}

export async function getLedgerStatsInCloud(input: GetLedgerStatsRequest): Promise<GetLedgerStatsResult> {
  const raw = await callLedger<unknown>('getStats', { ...input })
  if (!raw || typeof raw !== 'object') throw new LedgerCloudError('INVALID_RESPONSE', 'getStats 响应格式错误')
  const r = raw as Record<string, unknown>
  if (r.status === 'LOADED' && isLedgerStats(r.stats)) {
    return { status: 'LOADED', stats: r.stats }
  }
  if (isLedgerFailure(r)) return r as unknown as GetLedgerStatsResult
  throw new LedgerCloudError('INVALID_RESPONSE', 'getStats 响应格式错误')
}

export function humaniseLedgerError(code: string | undefined): string {
  switch (code) {
    case 'LEDGER_NOT_FOUND': return '账目不存在'
    case 'LEDGER_FORBIDDEN': return '你已经没有这个家庭的访问权限'
    case 'LEDGER_CATEGORY_NOT_FOUND': return '类目不存在'
    case 'LEDGER_CATEGORY_IN_USE': return '该类目下还有账目，请先修改或删除账目'
    case 'LEDGER_CATEGORY_NAME_TAKEN': return '类目名已被使用'
    case 'LEDGER_PAYER_NOT_MEMBER': return '付款人不是当前家庭成员'
    case 'LEDGER_AMOUNT_INVALID': return '金额格式不正确'
    case 'LEDGER_TIME_INVALID': return '时间格式不正确'
    case 'LEDGER_RECEIPT_TOO_LARGE': return '凭证图过大'
    case 'LEDGER_TEMPORARY_FAILURE': return '暂时无法完成账目操作，请稍后重试'
    default: return '请求暂时无法处理，请稍后重试'
  }
}

export type {
  AddLedgerCategoryRequest,
  AddLedgerCategoryResult,
  AddLedgerEntryRequest,
  AddLedgerEntryResult,
  DeleteLedgerEntryRequest,
  DeleteLedgerEntryResult,
  GetLedgerEntryRequest,
  GetLedgerEntryResult,
  GetLedgerStatsRequest,
  GetLedgerStatsResult,
  InitLedgerCategoriesRequest,
  InitLedgerCategoriesResult,
  LedgerCategory,
  LedgerEntryDetail,
  LedgerEntrySummary,
  LedgerEntryType,
  LedgerStats,
  ListLedgerEntriesRequest,
  ListLedgerEntriesResult,
  RemoveLedgerCategoryRequest,
  RemoveLedgerCategoryResult,
  RestoreLedgerEntryRequest,
  RestoreLedgerEntryResult,
  UpdateLedgerCategoryRequest,
  UpdateLedgerCategoryResult,
  UpdateLedgerEntryRequest,
  UpdateLedgerEntryResult,
}

export type { LedgerCategoryIconKey, LedgerCategoryColorKey }
