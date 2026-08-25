// 家庭共同流水账 Pinia 状态（PRD 008）。
// 模式与 task store 一致：单飞保护 + 双重凭证 + 超时恢复 + 严格响应校验。

import { defineStore } from 'pinia'
import debounce from 'lodash.debounce'
import {
  addLedgerCategoryInCloud,
  addLedgerEntryInCloud,
  deleteLedgerEntryInCloud,
  getLedgerEntryInCloud,
  getLedgerStatsInCloud,
  humaniseLedgerError,
  initLedgerCategoriesInCloud,
  LedgerCloudError,
  listLedgerEntriesInCloud,
  removeLedgerCategoryInCloud,
  restoreLedgerEntryInCloud,
  setLedgerCloudContext,
  setLedgerCloudEnvironmentForTesting,
  setLedgerCloudRuntimeForTesting,
  updateLedgerCategoryInCloud,
  updateLedgerEntryInCloud,
} from '../../services/ledger-cloud'
import type {
  AddLedgerCategoryRequest,
  AddLedgerEntryRequest,
  LedgerCategory,
  LedgerEntryDetail,
  LedgerEntrySummary,
  LedgerStats,
} from '../../types/ledger'

// === 类型 ===

type LedgerPhase = 'idle' | 'loading' | 'adding' | 'updating' | 'deleting' | 'restoring' | 'categoryMutating' | 'failed'

interface LedgerCloudClient {
  initCategories(input: { requestId: string }): Promise<{ status: 'INITED'; categories: LedgerCategory[] }>
  addEntry(input: AddLedgerEntryRequest): Promise<{ status: 'ADDED'; entry: LedgerEntrySummary }>
  updateEntry(input: { entryId: string; operationToken: string; amountCents: number; categoryId: string; note: string; occurredAt: string; receiptMediaId: string | null }): Promise<{ status: 'UPDATED'; entry: LedgerEntrySummary }>
  deleteEntry(input: { entryId: string; operationToken: string }): Promise<{ status: 'DELETED'; entryId: string; deletedAt: string }>
  restoreEntry(input: { entryId: string; operationToken: string }): Promise<{ status: 'RESTORED'; entry: LedgerEntrySummary }>
  listEntries(input: { month: string; payerMode: string; typeFilter?: 'all' | 'expense' | 'income'; categoryIds: string[]; includeDeleted?: boolean; page?: number; pageSize?: number }): Promise<{ status: 'LISTED'; entries: LedgerEntrySummary[]; deletedEntries: LedgerEntrySummary[]; hasMore?: boolean }>
  getEntry(input: { entryId: string }): Promise<{ status: 'LOADED'; detail: LedgerEntryDetail }>
  addCategory(input: AddLedgerCategoryRequest): Promise<{ status: 'ADDED'; category: LedgerCategory }>
  updateCategory(input: { categoryId: string; operationToken: string; name?: string; setHiddenByMe?: boolean }): Promise<{ status: 'UPDATED'; category: LedgerCategory; hiddenByMe: boolean }>
  removeCategory(input: { categoryId: string; operationToken: string }): Promise<{ status: 'REMOVED'; categoryId: string }>
  getStats(input: { month: string; payerMode?: string; typeFilter?: 'all' | 'expense' | 'income'; categoryIds?: string[] }): Promise<{ status: 'LOADED'; stats: LedgerStats }>
}

const defaultCloudClient: LedgerCloudClient = {
  initCategories: (input) => initLedgerCategoriesInCloud(input),
  addEntry: (input) => addLedgerEntryInCloud(input),
  updateEntry: (input) => updateLedgerEntryInCloud(input),
  deleteEntry: (input) => deleteLedgerEntryInCloud(input),
  restoreEntry: (input) => restoreLedgerEntryInCloud(input),
  listEntries: (input) => listLedgerEntriesInCloud(input),
  getEntry: (input) => getLedgerEntryInCloud(input),
  addCategory: (input) => addLedgerCategoryInCloud(input),
  updateCategory: (input) => updateLedgerCategoryInCloud(input),
  removeCategory: (input) => removeLedgerCategoryInCloud(input),
  getStats: (input) => getLedgerStatsInCloud(input),
}

let cloudClient: LedgerCloudClient = defaultCloudClient

export function setLedgerStoreCloudClientForTesting(client: LedgerCloudClient | undefined): void {
  cloudClient = client || defaultCloudClient
}

// === 状态 ===

interface LedgerStateShape {
  entries: LedgerEntrySummary[]
  deletedEntries: LedgerEntrySummary[]
  categories: LedgerCategory[]
  /** 我自己隐藏的类目 id 集合 */
  hiddenByMeCategoryIds: string[]
  stats: LedgerStats | null
  currentMonth: string
  payerMode: 'all' | 'me'
  /** 按类型筛（'all' / 'expense' / 'income'）；PRD 008 优化 R1 双维度 chip 第二行 */
  typeFilter: 'all' | 'expense' | 'income'
  /** 按日筛，'yyyy-MM-dd'；空串 = 按月（R6-KTD2 / KTD4） */
  selectedDate: string
  selectedCategoryIds: string[]
  phase: LedgerPhase
  errorMessage: string | null
  entriesPage: number
  entriesHasMore: boolean
  isLoadingMore: boolean
  activeEntryQueryKey: string
  entryLoadVersion: number
  /** 当前家庭 + 当前用户；调用时由入口 store 注入 */
  householdId: string
  selfMemberKey: string
  /** 内部持有 loadStats 防抖实例（U4 KTD3） */
  _debouncedLoadStats: ReturnType<typeof debounce> | null
}

const initialState = (): LedgerStateShape => ({
  entries: [],
  deletedEntries: [],
  categories: [],
  hiddenByMeCategoryIds: [],
  stats: null,
  currentMonth: '',
  payerMode: 'all',
  typeFilter: 'all',
  selectedDate: '',
  selectedCategoryIds: [],
  phase: 'idle',
  errorMessage: null,
  entriesPage: 0,
  entriesHasMore: true,
  isLoadingMore: false,
  activeEntryQueryKey: '',
  entryLoadVersion: 0,
  householdId: '',
  selfMemberKey: '',
  _debouncedLoadStats: null,
})

// === 单飞 / 幂等锁 ===

const inFlight = new Set<string>()
const LEDGER_PAGE_SIZE = 20

function inFlightKey(scope: string, key: string): string {
  return `${scope}:${key}`
}

// === 防抖 loadStats ===
// U4 KTD3：5 个 setter 变化触发 200ms 防抖 loadStats；queryKey 用全部 state 拼，确保同筛选只打一次。
// store getter 第一次访问时构造一次，复用同一个 debounced 实例。
// resetLedgerStoreForTesting 会重置 _debouncedLoadStats 让 test 重新构造。

// === store ===

export const useLedgerStore = defineStore('ledger', {
  state: (): LedgerStateShape => initialState(),

  getters: {
    /** 类目视图（含 hiddenByMe 标志） */
    categoriesWithHidden(state): Array<LedgerCategory & { hiddenByMe: boolean }> {
      const list = Array.isArray(state.categories) ? state.categories : []
      const hidden = new Set(Array.isArray(state.hiddenByMeCategoryIds) ? state.hiddenByMeCategoryIds : [])
      return list.map((c) => ({ ...c, hiddenByMe: hidden.has(c.id) }))
    },
    /** 可见类目（排除自己隐藏的） */
    visibleCategories(state): LedgerCategory[] {
      const list = Array.isArray(state.categories) ? state.categories : []
      const hidden = new Set(Array.isArray(state.hiddenByMeCategoryIds) ? state.hiddenByMeCategoryIds : [])
      return list.filter((c) => !hidden.has(c.id))
    },
    categoriesMap(state): Record<string, LedgerCategory> {
      const map: Record<string, LedgerCategory> = {}
      const list = Array.isArray(state.categories) ? state.categories : []
      for (const c of list) map[c.id] = c
      return map
    },
    /** 当前筛选下的账目（active）。payerMode / typeFilter 过滤由云端在 listEntries 时完成；
     *  前端在 selectedCategoryIds 上做二次过滤（云端也会做；前端兜底）。 */
    monthEntries(state): LedgerEntrySummary[] {
      const entries = Array.isArray(state.entries) ? state.entries : []
      const ids = Array.isArray(state.selectedCategoryIds) ? state.selectedCategoryIds : []
      let list = entries.slice()
      if (ids.length > 0) {
        const set = new Set(ids)
        list = list.filter((e) => set.has(e.categoryId))
      }
      return list.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    },
  },

  actions: {
    resetLedgerStoreForTesting(): void {
      if (this._debouncedLoadStats) {
        // lodash.debounce 返回的 DebouncedFn 有 cancel() 方法
        (this._debouncedLoadStats as { cancel: () => void }).cancel?.()
      }
      Object.assign(this, initialState())
      inFlight.clear()
    },

    setHouseholdContext(householdId: string, selfMemberKey: string): void {
      this.householdId = householdId
      this.selfMemberKey = selfMemberKey
      // 同步 ledger cloud 客户端的 context，让后续每个 action 自动带上 householdId + selfMemberKey
      // （云端从这两个字段做身份校验；不依赖前端在每个 payload 里传）
      setLedgerCloudContext(householdId, selfMemberKey)
    },

    setMonth(month: string): void {
      this.currentMonth = month
    },

    setPayerMode(mode: 'all' | 'me'): void {
      this.payerMode = mode
    },

    setTypeFilter(type: 'all' | 'expense' | 'income'): void {
      this.typeFilter = type
    },

    setSelectedDate(date: string): void {
      this.selectedDate = date
    },

    setSelectedCategoryIds(ids: string[]): void {
      this.selectedCategoryIds = ids.slice()
    },

    applyError(error: unknown): string {
      if (error instanceof LedgerCloudError) {
        this.errorMessage = humaniseLedgerError(error.code) || error.message
      } else if (error && typeof error === 'object' && 'status' in error) {
        this.errorMessage = humaniseLedgerError((error as { status: string }).status) || '请求失败'
      } else {
        this.errorMessage = error instanceof Error ? error.message : '请求失败'
      }
      this.phase = 'failed'
      return this.errorMessage || '请求失败'
    },

    async loadCategories(): Promise<void> {
      if (!this.householdId) return
      try {
        const result = await cloudClient.initCategories({ requestId: `loadcat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` })
        this.categories = result.categories
        // 重新同步 hiddenByMe 状态（initCategories 不返回 hiddenByMe；由本地缓存推算）
        const hidden = new Set(this.hiddenByMeCategoryIds)
        this.hiddenByMeCategoryIds = this.categories.filter((c) => hidden.has(c.id)).map((c) => c.id)
      } catch (error) {
        this.applyError(error)
      }
    },

    async loadEntries(reset = true): Promise<void> {
      if (!this.householdId) return
      // PRD 008 优化：queryKey 包含 typeFilter + selectedDate，KTD4 date 模式不分页
      const effectiveMonth = this.selectedDate || this.currentMonth
      const queryKey = `${effectiveMonth}|${this.payerMode}|${this.typeFilter}|${this.selectedCategoryIds.join(',')}`
      const nextPage = reset ? 1 : this.entriesPage + 1
      // KTD4：date 模式不分页（pageSize 拉大；hasMore 始终 false）
      const effectivePageSize = this.selectedDate ? 100 : LEDGER_PAGE_SIZE
      if (!reset && (!this.entriesHasMore || this.isLoadingMore)) return
      const key = inFlightKey('list', `${queryKey}|${nextPage}`)
      if (inFlight.has(key)) return
      inFlight.add(key)
      if (reset) this.entryLoadVersion += 1
      const loadVersion = this.entryLoadVersion
      if (reset) {
        this.phase = 'loading'
        if (this.activeEntryQueryKey !== queryKey) {
          this.entries = []
          this.entriesPage = 0
          this.entriesHasMore = true
        }
        this.activeEntryQueryKey = queryKey
      } else {
        this.isLoadingMore = true
      }
      this.errorMessage = null
      try {
        const result = await cloudClient.listEntries({
          month: effectiveMonth,
          payerMode: this.payerMode,
          typeFilter: this.typeFilter,
          categoryIds: this.selectedCategoryIds,
          page: nextPage,
          pageSize: effectivePageSize,
        })
        if (this.activeEntryQueryKey !== queryKey || this.entryLoadVersion !== loadVersion) return
        const knownIds = new Set(reset ? [] : this.entries.map((entry) => entry.id))
        const newEntries = result.entries.filter((entry) => !knownIds.has(entry.id))
        this.entries = reset ? newEntries : [...this.entries, ...newEntries]
        this.entriesPage = nextPage
        // KTD4：date 模式无 hasMore（永远只有一天的账目）
        this.entriesHasMore = this.selectedDate ? false : Boolean(result.hasMore)
        this.phase = 'idle'
      } catch (error) {
        if (this.activeEntryQueryKey === queryKey && this.entryLoadVersion === loadVersion) this.applyError(error)
      } finally {
        if (this.entryLoadVersion === loadVersion) this.isLoadingMore = false
        inFlight.delete(key)
      }
    },

    async loadMoreEntries(): Promise<void> {
      await this.loadEntries(false)
    },

    async loadDeletedEntries(): Promise<void> {
      if (!this.householdId) return
      try {
        const result = await cloudClient.listEntries({
          month: 'all',
          payerMode: 'all',
          categoryIds: [],
          includeDeleted: true,
        })
        this.deletedEntries = result.deletedEntries
      } catch (error) {
        this.applyError(error)
      }
    },

    async loadStats(month: string): Promise<void> {
      if (!this.householdId) return
      try {
        const effectiveMonth = this.selectedDate || month
        const result = await cloudClient.getStats({
          month: effectiveMonth,
          payerMode: this.payerMode,
          typeFilter: this.typeFilter,
          categoryIds: this.selectedCategoryIds,
        })
        this.stats = result.stats
      } catch (error) {
        this.applyError(error)
      }
    },

    /** 触发一次 200ms 防抖的 loadStats。多次快速调用合并为一次云函数调用。 */
    loadStatsDebounced(): void {
      if (!this._debouncedLoadStats) {
        this._debouncedLoadStats = debounce(() => {
          void this.loadStats(this.currentMonth)
        }, 200)
      }
      this._debouncedLoadStats()
    },

    async addEntry(input: AddLedgerEntryRequest): Promise<LedgerEntrySummary | null> {
      if (inFlight.has(inFlightKey('add', input.requestId))) return null
      inFlight.add(inFlightKey('add', input.requestId))
      this.phase = 'adding'
      this.errorMessage = null
      try {
        const result = await cloudClient.addEntry(input)
        if (result.status === 'ADDED') {
          this.entries = [result.entry, ...this.entries]
          this.phase = 'idle'
          // 重新算 stats
          if (this.stats) this.loadStats(this.stats.month).catch(() => undefined)
          return result.entry
        }
        // 失败
        this.errorMessage = humaniseLedgerError(result.status) || '添加失败'
        this.phase = 'failed'
        return null
      } catch (error) {
        this.applyError(error)
        return null
      } finally {
        inFlight.delete(inFlightKey('add', input.requestId))
      }
    },

    async updateEntry(input: { entryId: string; operationToken: string; amountCents: number; categoryId: string; note: string; occurredAt: string; receiptMediaId: string | null }): Promise<LedgerEntrySummary | null> {
      const key = inFlightKey('update', input.entryId + input.operationToken)
      if (inFlight.has(key)) return null
      inFlight.add(key)
      this.phase = 'updating'
      this.errorMessage = null
      try {
        const result = await cloudClient.updateEntry(input)
        if (result.status === 'UPDATED') {
          this.entries = this.entries.map((e) => (e.id === result.entry.id ? result.entry : e))
          this.phase = 'idle'
          if (this.stats) this.loadStats(this.stats.month).catch(() => undefined)
          return result.entry
        }
        this.errorMessage = humaniseLedgerError(result.status) || '更新失败'
        this.phase = 'failed'
        return null
      } catch (error) {
        this.applyError(error)
        return null
      } finally {
        inFlight.delete(key)
      }
    },

    async deleteEntry(input: { entryId: string; operationToken: string }): Promise<boolean> {
      const key = inFlightKey('delete', input.entryId + input.operationToken)
      if (inFlight.has(key)) return false
      inFlight.add(key)
      this.phase = 'deleting'
      this.errorMessage = null
      try {
        const result = await cloudClient.deleteEntry(input)
        if (result.status === 'DELETED') {
          this.entries = this.entries.filter((e) => e.id !== input.entryId)
          this.deletedEntries = [this.entries.find((e) => e.id === input.entryId) || { ...(this.entries[0] || {}), id: input.entryId, deletedAt: result.deletedAt } as any, ...this.deletedEntries].filter(Boolean)
          // 重新算 stats
          if (this.stats) this.loadStats(this.stats.month).catch(() => undefined)
          this.phase = 'idle'
          return true
        }
        this.errorMessage = humaniseLedgerError(result.status) || '删除失败'
        this.phase = 'failed'
        return false
      } catch (error) {
        this.applyError(error)
        return false
      } finally {
        inFlight.delete(key)
      }
    },

    async restoreEntry(input: { entryId: string; operationToken: string }): Promise<LedgerEntrySummary | null> {
      const key = inFlightKey('restore', input.entryId + input.operationToken)
      if (inFlight.has(key)) return null
      inFlight.add(key)
      this.phase = 'restoring'
      this.errorMessage = null
      try {
        const result = await cloudClient.restoreEntry(input)
        if (result.status === 'RESTORED') {
          this.entries = [result.entry, ...this.entries.filter((e) => e.id !== result.entry.id)]
          this.deletedEntries = this.deletedEntries.filter((e) => e.id !== result.entry.id)
          if (this.stats) this.loadStats(this.stats.month).catch(() => undefined)
          this.phase = 'idle'
          return result.entry
        }
        this.errorMessage = humaniseLedgerError(result.status) || '恢复失败'
        this.phase = 'failed'
        return null
      } catch (error) {
        this.applyError(error)
        return null
      } finally {
        inFlight.delete(key)
      }
    },

    async addCategory(input: AddLedgerCategoryRequest): Promise<LedgerCategory | null> {
      if (inFlight.has(inFlightKey('addcat', input.requestId))) return null
      inFlight.add(inFlightKey('addcat', input.requestId))
      this.phase = 'categoryMutating'
      this.errorMessage = null
      try {
        const result = await cloudClient.addCategory(input)
        if (result.status === 'ADDED') {
          this.categories = [...this.categories, result.category]
          this.phase = 'idle'
          return result.category
        }
        this.errorMessage = humaniseLedgerError(result.status) || '添加类目失败'
        this.phase = 'failed'
        return null
      } catch (error) {
        this.applyError(error)
        return null
      } finally {
        inFlight.delete(inFlightKey('addcat', input.requestId))
      }
    },

    async updateCategoryHidden(categoryId: string, hiddenByMe: boolean): Promise<void> {
      this.phase = 'categoryMutating'
      try {
        const result = await cloudClient.updateCategory({
          categoryId,
          operationToken: `togglehide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          setHiddenByMe: hiddenByMe,
        })
        if (result.status === 'UPDATED') {
          if (hiddenByMe) {
            this.hiddenByMeCategoryIds = [...this.hiddenByMeCategoryIds, categoryId]
          } else {
            this.hiddenByMeCategoryIds = this.hiddenByMeCategoryIds.filter((id) => id !== categoryId)
          }
        }
        this.phase = 'idle'
      } catch (error) {
        this.applyError(error)
      }
    },

    async removeCategory(categoryId: string): Promise<boolean> {
      this.phase = 'categoryMutating'
      try {
        const result = await cloudClient.removeCategory({
          categoryId,
          operationToken: `removecat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        })
        if (result.status === 'REMOVED') {
          this.categories = this.categories.filter((c) => c.id !== categoryId)
          this.phase = 'idle'
          return true
        }
        this.errorMessage = humaniseLedgerError(result.status) || '删除类目失败'
        this.phase = 'failed'
        return false
      } catch (error) {
        this.applyError(error)
        return false
      }
    },

    // 读取单条账目详情。封装云端 RPC，让 subpackage 页面通过 store 访问
    // （避免 subpackage 内的 `await import('...services/...')` 被 mp-weixin 构建
    // 错误地编成 `await <string>` 字面量——参见 ledger-store bug history）。
    async loadEntry(entryId: string): Promise<LedgerEntryDetail | null> {
      this.phase = 'loading'
      this.errorMessage = null
      try {
        const result = await cloudClient.getEntry({ entryId })
        if (result.status === 'LOADED') {
          this.phase = 'idle'
          // detail 包含 updatedAt/deletedAt，列表只持有 summary 字段；
          // 这里直接交给调用方（详情页 / 编辑页）处理，不回填到 this.entries。
          return result.detail
        }
        this.errorMessage = humaniseLedgerError(result.status) || '读取账目失败'
        this.phase = 'failed'
        return null
      } catch (error) {
        this.applyError(error)
        return null
      }
    },

    // 重命名自定义类目。封装云端 RPC，同样是为了让 subpackage 走静态 import 路径。
    async renameCategory(categoryId: string, name: string): Promise<LedgerCategory | null> {
      this.phase = 'categoryMutating'
      this.errorMessage = null
      try {
        const result = await cloudClient.updateCategory({
          categoryId,
          operationToken: `rename_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name,
        })
        if (result.status === 'UPDATED') {
          // 本地缓存的类目名同步刷新，避免列表显示旧名
          this.categories = this.categories.map((c) => (c.id === categoryId ? result.category : c))
          this.phase = 'idle'
          return result.category
        }
        this.errorMessage = humaniseLedgerError(result.status) || '重命名失败'
        this.phase = 'failed'
        return null
      } catch (error) {
        this.applyError(error)
        return null
      }
    },
  },
})
