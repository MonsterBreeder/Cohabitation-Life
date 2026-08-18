// 家庭共同流水账模块的统一类型契约（PRD 008）。
// 与 task.ts 一样：只暴露前端需要的展示字段；云端内部身份键
// （householdId / payerId / categoryId / entryId）不出现在这里。
// 任何携带内部键的响应都会被 service 层的 isLedger* 校验拒绝。

/** 账目类型：支出 / 收入。MVP 不做"转账"独立类型（PRD 008 §"核心规则 R7"）。 */
export type LedgerEntryType = 'expense' | 'income'

export const LEDGER_ENTRY_TYPES: readonly LedgerEntryType[] = ['expense', 'income'] as const

/** 类目的预设图标 key。MVP 锁定 8 个（Wot UI 内置图标集）；自定义类目不可上传图标。 */
export type LedgerCategoryIconKey =
  | 'fork-spoon'
  | 'car'
  | 'house'
  | 'gamepad'
  | 'first-aid'
  | 'shopping-bag'
  | 'book'
  | 'tag'

/** 类目的预设颜色 key；颜色池与 docs/brand/visual-standard.md 对齐。 */
export type LedgerCategoryColorKey = 'amber' | 'blue' | 'mint' | 'coral' | 'red' | 'purple' | 'teal' | 'gray'

/** 付款人展示。家庭成员被移除后仍按旧 key 展示（灰态）。 */
export interface LedgerPayerDisplay {
  /** 家庭成员内部 key；仅展示用，不作为业务键。 */
  memberKey: string
  nickname: string
  avatar: { kind: 'builtin'; id: string }
  /** 成员已被移除时为 true；列表上展示灰态（PRD 008 §"边缘场景"）。 */
  hasLeft?: boolean
}

/** 账目摘要：列表用。 */
export interface LedgerEntrySummary {
  id: string
  type: LedgerEntryType
  /** 整数分；展示时 formatYuan。 */
  amountCents: number
  categoryId: string
  /** 0-100 字；空时为 ''。 */
  note: string
  /** 账目发生时间，ISO 字符串；用于按日期分组。 */
  occurredAt: string
  /** 凭证图云存储 fileID；无凭证时为 null。 */
  receiptMediaId: string | null
  payer: LedgerPayerDisplay
  /** 服务端写入时间，ISO 字符串。 */
  createdAt: string
}

/** 账目详情：summary + 时间戳扩展。 */
export interface LedgerEntryDetail extends LedgerEntrySummary {
  /** 最后修改时间，ISO 字符串。 */
  updatedAt: string
  /** 软删除时间，ISO 字符串；30 天清理前的"已删除"区展示。未软删时为 null。 */
  deletedAt: string | null
  /** 服务端基于 identityKey 计算的"当前用户能否编辑"。前端拿不到 identityKey，只能信服务端。
   *  旧版本用 detail.payer.memberKey === selfMemberKey 算，但 selfMemberKey 在前端一直是 '',
   *  导致创建者也看不到编辑按钮。新版本直接由 getEntry 在响应里告诉前端。 */
  canEdit?: boolean
  /** 服务端基于 identityKey 计算的"当前用户能否软删"。PRD 008：只创建者可软删。 */
  canDelete?: boolean
}

/** 类目。 */
export interface LedgerCategory {
  id: string
  /** 8 字符以内；同家庭唯一。如 dining / transport。 */
  key: string
  name: string
  iconKey: LedgerCategoryIconKey
  colorKey: LedgerCategoryColorKey
  isCustom: boolean
  sortOrder: number
}

/** 类目展示（含隐藏状态）。前端用于列表 chip。 */
export interface LedgerCategoryView extends LedgerCategory {
  /** 当前用户是否已隐藏。hide 只对自己有效（PRD 008 §"核心规则 R6"）。 */
  hiddenByMe: boolean
}

/** 列表筛选。 */
export interface LedgerFilter {
  /** yyyy-MM 字符串；'all' = 不按月筛选。 */
  month: string
  /** 'all' = 全部；'me' = 仅我付的；具体 memberKey = 仅该成员。 */
  payerMode: 'all' | 'me' | string
  /** 类目 id 数组；空数组 = 全部类目。 */
  categoryIds: string[]
}

/** 统计结果。 */
export interface LedgerStats {
  month: string
  monthExpenseCents: number
  monthIncomeCents: number
  netCents: number
  byCategory: Array<{ categoryId: string; expenseCents: number; incomeCents: number }>
  byPayer: Array<{ payerMemberKey: string; expenseCents: number; incomeCents: number }>
}

// === 请求 / 响应 ===

export interface AddLedgerEntryRequest {
  /** 幂等锁：每次操作唯一；前端用 crypto.randomUUID()。 */
  requestId: string
  type: LedgerEntryType
  amountCents: number
  categoryId: string
  payerMemberKey: string
  note: string
  occurredAt: string
  /** 上传凭证图后获得的云存储 fileID；无凭证时为 null。 */
  receiptMediaId: string | null
}

export interface AddLedgerEntryResult {
  status: 'ADDED'
  entry: LedgerEntrySummary
}

export interface UpdateLedgerEntryRequest {
  entryId: string
  operationToken: string
  /** MVP 不允许改 type / payer；这两个字段即便传了也会被服务端拒绝。 */
  amountCents: number
  categoryId: string
  note: string
  occurredAt: string
  receiptMediaId: string | null
}

export interface UpdateLedgerEntryResult {
  status: 'UPDATED'
  entry: LedgerEntrySummary
}

export interface DeleteLedgerEntryRequest {
  entryId: string
  operationToken: string
}

export interface DeleteLedgerEntryResult {
  status: 'DELETED'
  entryId: string
  deletedAt: string
}

export interface RestoreLedgerEntryRequest {
  entryId: string
  operationToken: string
}

export interface RestoreLedgerEntryResult {
  status: 'RESTORED'
  entry: LedgerEntrySummary
}

export interface ListLedgerEntriesRequest {
  month: string
  payerMode: 'all' | 'me' | string
  categoryIds: string[]
  includeDeleted?: boolean
}

export interface ListLedgerEntriesResult {
  status: 'LISTED'
  entries: LedgerEntrySummary[]
  /** 已软删的账目（仅 includeDeleted=true 时返回）。 */
  deletedEntries: LedgerEntrySummary[]
}

export interface GetLedgerEntryRequest {
  entryId: string
}

export interface GetLedgerEntryResult {
  status: 'LOADED'
  detail: LedgerEntryDetail
}

export interface AddLedgerCategoryRequest {
  requestId: string
  name: string
  iconKey: LedgerCategoryIconKey
  colorKey: LedgerCategoryColorKey
}

export interface AddLedgerCategoryResult {
  status: 'ADDED'
  category: LedgerCategory
}

export interface UpdateLedgerCategoryRequest {
  categoryId: string
  operationToken: string
  /** 仅当是自定义类目时可改。 */
  name?: string
  /** 切换隐藏状态。 */
  setHiddenByMe?: boolean
}

export interface UpdateLedgerCategoryResult {
  status: 'UPDATED'
  category: LedgerCategory
  hiddenByMe: boolean
}

export interface RemoveLedgerCategoryRequest {
  categoryId: string
  operationToken: string
}

export interface RemoveLedgerCategoryResult {
  status: 'REMOVED'
  categoryId: string
}

export interface GetLedgerStatsRequest {
  month: string
}

export interface GetLedgerStatsResult {
  status: 'LOADED'
  stats: LedgerStats
}

export interface InitLedgerCategoriesRequest {
  /** 仅家庭创建时调一次。幂等。 */
  requestId: string
}

export interface InitLedgerCategoriesResult {
  status: 'INITED'
  categories: LedgerCategory[]
}

// === 错误码 ===

export type LedgerResultStatus =
  | 'LEDGER_INVALID_REQUEST'
  | 'LEDGER_NOT_FOUND'
  | 'LEDGER_FORBIDDEN'
  | 'LEDGER_CATEGORY_NOT_FOUND'
  | 'LEDGER_CATEGORY_IN_USE'
  | 'LEDGER_CATEGORY_NAME_TAKEN'
  | 'LEDGER_PAYER_NOT_MEMBER'
  | 'LEDGER_AMOUNT_INVALID'
  | 'LEDGER_TIME_INVALID'
  | 'LEDGER_RECEIPT_TOO_LARGE'
  | 'LEDGER_TEMPORARY_FAILURE'
  | 'ADDED'
  | 'UPDATED'
  | 'DELETED'
  | 'RESTORED'
  | 'LISTED'
  | 'LOADED'
  | 'INITED'

export interface LedgerResultBase {
  status: LedgerResultStatus
  retryable: boolean
}

export interface LedgerSuccessResult extends LedgerResultBase {
  status: Exclude<LedgerResultStatus, 'LEDGER_INVALID_REQUEST' | 'LEDGER_NOT_FOUND' | 'LEDGER_FORBIDDEN' | 'LEDGER_CATEGORY_NOT_FOUND' | 'LEDGER_CATEGORY_IN_USE' | 'LEDGER_CATEGORY_NAME_TAKEN' | 'LEDGER_PAYER_NOT_MEMBER' | 'LEDGER_AMOUNT_INVALID' | 'LEDGER_TIME_INVALID' | 'LEDGER_RECEIPT_TOO_LARGE' | 'LEDGER_TEMPORARY_FAILURE'>
}

export interface LedgerFailureResult extends LedgerResultBase {
  status: Extract<LedgerResultStatus, 'LEDGER_INVALID_REQUEST' | 'LEDGER_NOT_FOUND' | 'LEDGER_FORBIDDEN' | 'LEDGER_CATEGORY_NOT_FOUND' | 'LEDGER_CATEGORY_IN_USE' | 'LEDGER_CATEGORY_NAME_TAKEN' | 'LEDGER_PAYER_NOT_MEMBER' | 'LEDGER_AMOUNT_INVALID' | 'LEDGER_TIME_INVALID' | 'LEDGER_RECEIPT_TOO_LARGE' | 'LEDGER_TEMPORARY_FAILURE'>
  errorMessage: string
}

export type LedgerResult = LedgerSuccessResult | LedgerFailureResult

// === 简化的成功结果（按 action 区分） ===

export type LedgerAddedResult = LedgerResultBase & { status: 'ADDED'; entry: LedgerEntrySummary }
export type LedgerUpdatedResult = LedgerResultBase & { status: 'UPDATED'; entry: LedgerEntrySummary }
export type LedgerDeletedResult = LedgerResultBase & { status: 'DELETED'; entryId: string; deletedAt: string }
export type LedgerRestoredResult = LedgerResultBase & { status: 'RESTORED'; entry: LedgerEntrySummary }
export type LedgerListedResult = LedgerResultBase & { status: 'LISTED'; entries: LedgerEntrySummary[]; deletedEntries: LedgerEntrySummary[] }
export type LedgerLoadedResult = LedgerResultBase & { status: 'LOADED'; detail: LedgerEntryDetail }
export type LedgerCategoryAddedResult = LedgerResultBase & { status: 'ADDED'; category: LedgerCategory }
export type LedgerCategoryUpdatedResult = LedgerResultBase & { status: 'UPDATED'; category: LedgerCategory; hiddenByMe: boolean }
export type LedgerCategoryRemovedResult = LedgerResultBase & { status: 'REMOVED'; categoryId: string }
export type LedgerStatsLoadedResult = LedgerResultBase & { status: 'LOADED'; stats: LedgerStats }
export type LedgerInitedResult = LedgerResultBase & { status: 'INITED'; categories: LedgerCategory[] }
