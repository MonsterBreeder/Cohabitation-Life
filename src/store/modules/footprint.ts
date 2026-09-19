// 共享足迹状态：所有异步回执都核对家庭上下文，换家后丢弃旧结果。
import { defineStore } from 'pinia'
import {
  acknowledgeFootprintHistoryInCloud,
  createFootprintEntryInCloud,
  deleteFootprintEntryInCloud,
  getFootprintEntryInCloud,
  getFootprintSummaryInCloud,
  getFootprintPhotoUrlsInCloud,
  humaniseFootprintError,
  listFootprintEntriesInCloud,
  listFootprintPlacesInCloud,
  updateFootprintEntryInCloud,
} from '../../services/footprint-cloud'
import { listHikesInCloud } from '../../services/hiking-cloud'
import type {
  FootprintEntryDetail,
  FootprintEntrySummary,
  FootprintHomeSummary,
  FootprintPhoto,
  FootprintPlace,
  FootprintPlaceSummary,
  FootprintTimelineEntry,
} from '../../types/footprint'
import type { HikingEntrySummary } from '../../types/hiking'

interface State {
  householdId: string
  contextVersion: number
  summary: FootprintHomeSummary | null
  places: FootprintPlaceSummary[]
  entries: FootprintTimelineEntry[]
  hikes: HikingEntrySummary[]
  placesCursor: string | null
  entriesCursor: string | null
  listPlaceKey: string
  listVersion: number
  currentDetail: FootprintEntryDetail | null
  detailVersion: number
  phase: 'idle' | 'loading' | 'saving' | 'deleting' | 'failed'
  mapError: string | null
  listError: string | null
  summaryError: string | null
  errorMessage: string | null
  errorCode: string | null
  showPreJoinHistoryNotice: boolean
  pending: Record<string, boolean>
}

export const useFootprintStore = defineStore('footprint', {
  state: (): State => ({
    householdId: '',
    contextVersion: 0,
    summary: null,
    places: [],
    entries: [],
    hikes: [],
    placesCursor: null,
    entriesCursor: null,
    listPlaceKey: '',
    listVersion: 0,
    currentDetail: null,
    detailVersion: 0,
    phase: 'idle',
    mapError: null,
    listError: null,
    summaryError: null,
    errorMessage: null,
    errorCode: null,
    showPreJoinHistoryNotice: false,
    pending: {},
  }),
  actions: {
    setHouseholdContext(householdId: string): void {
      if (householdId === this.householdId) return
      this.resetFootprintStore()
      this.householdId = householdId
    },
    resetFootprintStore(): void {
      // 编号不能归零，防止退出后重新登录时旧请求被误接收。
      const version = this.contextVersion + 1
      this.$reset()
      this.contextVersion = version
    },
    async loadSummary(): Promise<void> {
      if (!this.householdId || this.pending.summary) return
      const version = this.contextVersion
      this.pending.summary = true
      try {
        const result = await getFootprintSummaryInCloud()
        if (version !== this.contextVersion) return
        if ('status' in result) throw result
        this.summary = result.summary
        this.showPreJoinHistoryNotice = result.showPreJoinHistoryNotice
        this.summaryError = null
      } catch (error) {
        if (version === this.contextVersion) this.summaryError = humaniseFootprintError(error)
      } finally {
        if (version === this.contextVersion) this.pending.summary = false
      }
    },
    async loadOverview(_preserveExisting = true): Promise<void> {
      if (!this.householdId || this.pending.overview) return
      const version = this.contextVersion
      this.pending.overview = true
      this.phase = 'loading'
      // 三类读取独立保留成功结果，地图失败不影响列表和首页卡片。
      await Promise.all([
        this.loadSummary(),
        this.loadEntries(this.listPlaceKey),
        this.loadPlaces(),
        this.loadHikes(),
      ])
      if (version !== this.contextVersion) return
      this.pending.overview = false
      this.phase = this.mapError && this.listError ? 'failed' : 'idle'
    },
    async loadHikes(): Promise<void> {
      if (!this.householdId || this.pending.hikes) return
      const version = this.contextVersion
      this.pending.hikes = true
      try {
        let cursor: string | null = null
        const loaded: HikingEntrySummary[] = []
        do {
          const result = await listHikesInCloud({ cursor, pageSize: 100 })
          if (version !== this.contextVersion) return
          if ('status' in result) throw result
          loaded.push(...result.entries)
          if (result.cursor && result.cursor === cursor) throw new Error('徒步分页未前进')
          cursor = result.cursor
        } while (cursor)
        this.hikes = loaded
      } catch {
        // 徒步标记读取失败不影响原有地点地图；时间列表仍有独立错误反馈。
      } finally {
        if (version === this.contextVersion) this.pending.hikes = false
      }
    },
    async loadEntries(placeKey = ''): Promise<void> {
      if (!this.householdId) return
      const version = this.contextVersion
      const listVersion = ++this.listVersion
      if (this.listPlaceKey !== placeKey) {
        this.entries = []
        this.entriesCursor = null
      }
      this.listPlaceKey = placeKey
      this.pending.entries = true
      try {
        const result = await listFootprintEntriesInCloud({ placeKey: placeKey || null })
        if (version !== this.contextVersion || listVersion !== this.listVersion) return
        if ('status' in result) throw result
        this.entries = result.entries
        this.entriesCursor = result.cursor
        this.listError = null
      } catch (error) {
        if (version === this.contextVersion && listVersion === this.listVersion)
          this.listError = humaniseFootprintError(error)
      } finally {
        if (version === this.contextVersion && listVersion === this.listVersion) this.pending.entries = false
      }
    },
    async loadMoreEntries(): Promise<void> {
      if (!this.entriesCursor || this.pending.entries) return
      const version = this.contextVersion
      const listVersion = this.listVersion
      this.pending.entries = true
      try {
        const result = await listFootprintEntriesInCloud({
          cursor: this.entriesCursor,
          placeKey: this.listPlaceKey || null,
        })
        if (version !== this.contextVersion || listVersion !== this.listVersion) return
        if ('status' in result) throw result
        const known = new Set(this.entries.map((entry) => entry.id))
        this.entries.push(...result.entries.filter((entry) => !known.has(entry.id)))
        this.entriesCursor = result.cursor
        this.listError = null
      } catch (error) {
        if (version === this.contextVersion && listVersion === this.listVersion)
          this.listError = humaniseFootprintError(error)
      } finally {
        if (version === this.contextVersion && listVersion === this.listVersion) this.pending.entries = false
      }
    },
    async loadPlaces(): Promise<void> {
      if (!this.householdId || this.pending.places) return
      const version = this.contextVersion
      this.pending.places = true
      let cursor: string | null = null
      const loaded: FootprintPlaceSummary[] = []
      try {
        do {
          const result = await listFootprintPlacesInCloud({ cursor })
          if (version !== this.contextVersion) return
          if ('status' in result) throw result
          const known = new Set(loaded.map((place) => place.placeKey))
          loaded.push(...result.places.filter((place) => !known.has(place.placeKey)))
          if (result.cursor && result.cursor === cursor) throw new Error('地点分页未前进')
          cursor = result.cursor
          this.places = [...loaded]
          this.placesCursor = cursor
          this.mapError = null
        } while (cursor)
      } catch (error) {
        if (version === this.contextVersion) this.mapError = humaniseFootprintError(error)
      } finally {
        if (version === this.contextVersion) this.pending.places = false
      }
    },
    async loadEntry(entryId: string): Promise<FootprintEntryDetail | null> {
      if (!this.householdId) return null
      const version = this.contextVersion
      const detailVersion = ++this.detailVersion
      this.phase = 'loading'
      this.errorMessage = null
      this.currentDetail = null
      try {
        const result = await getFootprintEntryInCloud(entryId)
        if (version !== this.contextVersion || detailVersion !== this.detailVersion) return null
        if ('status' in result) throw result
        this.currentDetail = result
        this.phase = 'idle'
        return result
      } catch (error) {
        if (version === this.contextVersion && detailVersion === this.detailVersion) {
          this.errorMessage = humaniseFootprintError(error)
          this.phase = 'failed'
        }
        return null
      }
    },
    async hydratePhotoUrls(photos: FootprintPhoto[]): Promise<Record<string, string>> {
      if (!this.householdId) return {}
      const version = this.contextVersion
      try {
        const loaded = await getFootprintPhotoUrlsInCloud(photos.map((photo) => photo.resourceId))
        if (version !== this.contextVersion) return {}
        return Object.fromEntries(
          loaded.filter((photo) => photo.url).map((photo) => [photo.resourceId, photo.url as string]),
        )
      } catch {
        return {}
      }
    },
    async createEntry(input: {
      requestId: string
      place: FootprintPlace
      visitedAt: string
      memory: string
      photoResourceIds: string[]
    }): Promise<FootprintEntrySummary | null> {
      if (!this.householdId || this.pending.write) return null
      const version = this.contextVersion
      this.pending.write = true
      this.phase = 'saving'
      this.errorMessage = null
      this.errorCode = null
      try {
        const result = await createFootprintEntryInCloud({ ...input, expectedHouseholdId: this.householdId })
        if (version !== this.contextVersion) return null
        if ('status' in result) throw result
        this.currentDetail = null
        await this.loadOverview()
        return version === this.contextVersion ? result : null
      } catch (error) {
        if (version === this.contextVersion) this.setWriteError(error)
        return null
      } finally {
        if (version === this.contextVersion) this.pending.write = false
      }
    },
    async updateEntry(input: {
      entryId: string
      operationToken: string
      editVersion: number
      place: FootprintPlace
      visitedAt: string
      memory: string
      photoResourceIds: string[]
    }): Promise<FootprintEntrySummary | null> {
      if (!this.householdId || this.pending.write) return null
      const version = this.contextVersion
      this.pending.write = true
      this.phase = 'saving'
      this.errorMessage = null
      this.errorCode = null
      try {
        const result = await updateFootprintEntryInCloud({ ...input, expectedHouseholdId: this.householdId })
        if (version !== this.contextVersion) return null
        if ('status' in result) throw result
        this.currentDetail = null
        await this.loadOverview()
        return version === this.contextVersion ? result : null
      } catch (error) {
        if (version === this.contextVersion) this.setWriteError(error)
        return null
      } finally {
        if (version === this.contextVersion) this.pending.write = false
      }
    },
    async deleteEntry(entryId: string, operationToken: string): Promise<boolean> {
      if (!this.householdId || this.pending.write) return false
      const version = this.contextVersion
      this.pending.write = true
      this.phase = 'deleting'
      this.errorMessage = null
      this.errorCode = null
      try {
        const result = await deleteFootprintEntryInCloud({ entryId, operationToken })
        if (version !== this.contextVersion) return false
        if ('status' in result) throw result
        this.currentDetail = null
        this.entries = this.entries.filter((entry) => entry.id !== entryId)
        await this.loadOverview()
        return version === this.contextVersion
      } catch (error) {
        if (version === this.contextVersion) this.setWriteError(error)
        return false
      } finally {
        if (version === this.contextVersion) this.pending.write = false
      }
    },
    // 冲突编号交给编辑页展示恢复操作，不靠中文文案猜测错误种类。
    setWriteError(error: unknown): void {
      this.errorMessage = humaniseFootprintError(error)
      this.errorCode = error && typeof error === 'object' && 'status' in error ? String(error.status) : null
      this.phase = 'failed'
    },
    async acknowledgeHistoryNotice(): Promise<void> {
      const version = this.contextVersion
      try {
        const acknowledged = await acknowledgeFootprintHistoryInCloud()
        if (version === this.contextVersion && acknowledged) this.showPreJoinHistoryNotice = false
      } catch {
        /* 未成功确认时保留提示，用户可继续重试。 */
      }
    },
  },
})
