// 共同徒步状态：家庭切换会清空旧记录，异步结果必须匹配当前上下文。
import { defineStore } from 'pinia'
import {
  abandonHikingRoute,
  createHikeInCloud,
  humaniseHikingError,
  listHikesInCloud,
  updateHikeInCloud,
  uploadHikingRoute,
} from '../../services/hiking-cloud'
import type { HikingEntrySummary, HikingFormDraft } from '../../types/hiking'
import { hikingFormMetrics } from '../../subpackages/hiking/hiking-form/hiking-form-view'

interface HikingState {
  householdId: string
  contextVersion: number
  records: HikingEntrySummary[]
  cursor: string | null
  phase: 'idle' | 'loading' | 'saving' | 'failed'
  errorMessage: string
}

export const useHikingStore = defineStore('hiking', {
  state: (): HikingState => ({
    householdId: '',
    contextVersion: 0,
    records: [],
    cursor: null,
    phase: 'idle',
    errorMessage: '',
  }),
  actions: {
    setHouseholdContext(householdId: string): void {
      if (householdId === this.householdId) return
      const version = this.contextVersion + 1
      this.$reset()
      this.contextVersion = version
      this.householdId = householdId
    },
    async loadRecords(): Promise<void> {
      if (!this.householdId || this.phase === 'loading') return
      const version = this.contextVersion
      this.phase = 'loading'
      this.errorMessage = ''
      try {
        const result = await listHikesInCloud()
        if (version !== this.contextVersion) return
        if ('status' in result) throw result
        this.records = result.entries
        this.cursor = result.cursor
        this.phase = 'idle'
      } catch (error) {
        if (version === this.contextVersion) {
          this.errorMessage = humaniseHikingError(error)
          this.phase = 'failed'
        }
      }
    },
    async loadMoreRecords(): Promise<void> {
      if (!this.householdId || !this.cursor || this.phase === 'loading') return
      const version = this.contextVersion
      const cursor = this.cursor
      this.phase = 'loading'
      this.errorMessage = ''
      try {
        const result = await listHikesInCloud({ cursor })
        if (version !== this.contextVersion) return
        if ('status' in result) throw result
        const known = new Set(this.records.map((entry) => entry.id))
        this.records.push(...result.entries.filter((entry) => !known.has(entry.id)))
        this.cursor = result.cursor
        this.phase = 'idle'
      } catch (error) {
        if (version === this.contextVersion) {
          this.errorMessage = humaniseHikingError(error)
          this.phase = 'failed'
        }
      }
    },
    async saveDraft(
      draft: HikingFormDraft,
      requestId: string,
      photoResourceIds: string[] = [],
    ): Promise<HikingEntrySummary | null> {
      if (!this.householdId || this.phase === 'saving') return null
      const version = this.contextVersion
      this.phase = 'saving'
      this.errorMessage = ''
      let routeResourceId: string | null = null
      try {
        if (draft.route) routeResourceId = (await uploadHikingRoute(draft.route)).resourceId
        const metrics = hikingFormMetrics(draft)
        const result = await createHikeInCloud({
          expectedHouseholdId: this.householdId,
          requestId,
          name: draft.name,
          hikedAt: draft.hikedAt || null,
          place: draft.place,
          memory: draft.memory,
          distanceMeters: draft.route ? null : metrics.distanceMeters,
          durationSeconds: metrics.durationSeconds,
          routeResourceId,
          photoResourceIds,
        })
        if (version !== this.contextVersion) return null
        if ('status' in result) throw result
        this.records = [result, ...this.records.filter((entry) => entry.id !== result.id)]
        this.phase = 'idle'
        return result
      } catch (error) {
        // 已批准但未关联的路线主动放弃；失败时原共同记录完全不变。
        if (routeResourceId) {
          try {
            await abandonHikingRoute(routeResourceId)
          } catch {
            /* 过期清理兜底。 */
          }
        }
        if (version === this.contextVersion) {
          this.errorMessage = humaniseHikingError(error)
          this.phase = 'failed'
        }
        return null
      }
    },
    async updateDraft(input: {
      draft: HikingFormDraft
      entryId: string
      editVersion: number
      operationToken: string
      photoResourceIds: string[]
      existingRouteResourceId: string | null
      routeChanged: boolean
    }): Promise<HikingEntrySummary | null> {
      if (!this.householdId || this.phase === 'saving') return null
      const version = this.contextVersion
      this.phase = 'saving'
      this.errorMessage = ''
      let uploadedRouteId: string | null = null
      try {
        if (input.routeChanged && input.draft.route) {
          uploadedRouteId = (await uploadHikingRoute(input.draft.route)).resourceId
        }
        const metrics = hikingFormMetrics(input.draft)
        const result = await updateHikeInCloud({
          expectedHouseholdId: this.householdId,
          entryId: input.entryId,
          editVersion: input.editVersion,
          operationToken: input.operationToken,
          name: input.draft.name,
          hikedAt: input.draft.hikedAt || null,
          place: input.draft.place,
          memory: input.draft.memory,
          distanceMeters: input.draft.route ? null : metrics.distanceMeters,
          durationSeconds: metrics.durationSeconds,
          routeResourceId: input.routeChanged ? uploadedRouteId : input.existingRouteResourceId,
          photoResourceIds: input.photoResourceIds,
        })
        if (version !== this.contextVersion) return null
        if ('status' in result) throw result
        this.records = [result, ...this.records.filter((entry) => entry.id !== result.id)]
        this.phase = 'idle'
        return result
      } catch (error) {
        // 替换失败时只释放新路线，旧路线继续与共同记录关联。
        if (uploadedRouteId) {
          try {
            await abandonHikingRoute(uploadedRouteId)
          } catch {
            /* 过期清理兜底。 */
          }
        }
        if (version === this.contextVersion) {
          this.errorMessage = humaniseHikingError(error)
          this.phase = 'failed'
        }
        return null
      }
    },
  },
})
