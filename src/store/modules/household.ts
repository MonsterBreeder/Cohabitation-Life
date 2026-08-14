import { defineStore } from 'pinia'
import { confirmHouseholdInCloud, createHouseholdInCloud, getCurrentHouseholdInCloud, HouseholdCloudError, updateHouseholdInCloud, updateProfileInCloud } from '../../services/household-cloud'
import type { ConfirmHouseholdRequest, CreateHouseholdRequest, CurrentProfile, HouseholdResult, HouseholdSummary, UpdateHouseholdRequest, UpdateProfileRequest } from '../../types/household'
import { addPendingHousehold, listPendingHouseholds, removePendingHousehold, type PendingHousehold } from '../../utils/pending-household'
import store from '..'

type HouseholdPhase = 'checking' | 'editable' | 'checking-content' | 'creating' | 'confirming' | 'loaded' | 'failed'
type HouseholdDraft = Pick<CreateHouseholdRequest, 'name' | 'avatar'>

interface HouseholdCloudClient {
  create(input: CreateHouseholdRequest): Promise<HouseholdResult>
  confirm(input: ConfirmHouseholdRequest): Promise<HouseholdResult>
  get(): Promise<HouseholdResult>
  updateHousehold(input: UpdateHouseholdRequest): Promise<HouseholdResult>
  updateProfile(input: UpdateProfileRequest): Promise<HouseholdResult>
}

let cloudClient: HouseholdCloudClient = { create: createHouseholdInCloud, confirm: confirmHouseholdInCloud, get: getCurrentHouseholdInCloud, updateHousehold: updateHouseholdInCloud, updateProfile: updateProfileInCloud }
let createInFlight: Promise<void> | undefined
let successRevision = 0

function credential(prefix: string): string {
  const random = Math.random().toString(36).slice(2)
  return `${prefix}_${Date.now().toString(36)}_${random}_${random}`.slice(0, 96)
}

export const useHouseholdStore = defineStore('household', {
  state: () => ({
    phase: 'checking' as HouseholdPhase,
    draft: { name: '我们的小家', avatar: { kind: 'builtin', id: 'household-01' } } as HouseholdDraft,
    pending: undefined as PendingHousehold | undefined,
    household: undefined as HouseholdSummary | undefined,
    profile: undefined as CurrentProfile | undefined,
    errorMessage: undefined as string | undefined,
    authoritativeRevision: successRevision,
  }),
  getters: {
    canCreate: (state) => state.phase === 'editable' || state.phase === 'failed',
  },
  actions: {
    applyHome(result: Extract<HouseholdResult, { status: 'HOME' }>) {
      this.household = result.household
      this.profile = result.profile
      this.phase = 'loaded'
      this.errorMessage = undefined
      successRevision += 1
      this.authoritativeRevision = successRevision
      if (this.pending) removePendingHousehold(this.pending.operationToken)
      this.pending = undefined
    },
    applyNoHome(requestRevision: number): boolean {
      if (requestRevision !== this.authoritativeRevision || this.phase === 'loaded') return false
      this.phase = 'editable'
      this.household = undefined
      this.profile = undefined
      return true
    },
    /** 首页每次显示都重新读取当前家庭，失败时清空旧资料，避免把缓存误当成真实结果。 */
    async loadCurrent() {
      this.phase = 'checking'
      this.household = undefined
      this.profile = undefined
      this.errorMessage = undefined
      try {
        const result = await cloudClient.get()
        if (result.status === 'HOME') this.applyHome(result)
        else if (result.status === 'NO_HOME') this.applyNoHome(this.authoritativeRevision)
        else {
          this.phase = 'failed'
          this.errorMessage = result.status === 'MULTIPLE_HOUSEHOLDS'
            ? '家庭归属存在异常，请稍后联系处理'
            : '暂时无法读取家庭资料，请稍后重试'
        }
        return result
      } catch {
        this.phase = 'failed'
        this.errorMessage = '暂时无法读取家庭资料，请稍后重试'
        return undefined
      }
    },
    async create(draft: HouseholdDraft) {
      if (createInFlight || !this.canCreate) return createInFlight
      this.draft = { name: draft.name, avatar: { ...draft.avatar } }
      const pending: PendingHousehold = {
        version: 1,
        requestId: credential('request'),
        operationToken: credential('operation'),
        draft: this.draft,
        createdAt: Date.now(),
      }
      this.pending = pending
      addPendingHousehold(pending)
      this.phase = 'creating'
      this.errorMessage = undefined

      createInFlight = cloudClient.create({ ...pending.draft, requestId: pending.requestId, operationToken: pending.operationToken })
        .then((result) => {
          if (result.status === 'HOME') this.applyHome(result)
          else {
            removePendingHousehold(pending.operationToken)
            this.pending = undefined
            this.phase = 'failed'
            this.errorMessage = '家庭创建没有完成，请检查后重试'
          }
        })
        .catch((error: unknown) => {
          if (error instanceof HouseholdCloudError && error.code === 'TIMEOUT') {
            this.phase = 'confirming'
            this.errorMessage = '正在确认创建结果'
          } else {
            removePendingHousehold(pending.operationToken)
            this.pending = undefined
            this.phase = 'failed'
            this.errorMessage = '家庭创建没有完成，请稍后重试'
          }
        })
        .finally(() => { createInFlight = undefined })
      return createInFlight
    },
    async confirmPending() {
      const pending = this.pending
      if (!pending) return
      this.phase = 'confirming'
      try {
        const result = await cloudClient.confirm(pending)
        if (result.status === 'HOME') this.applyHome(result)
        else if (result.status === 'NO_HOME') {
          removePendingHousehold(pending.operationToken)
          this.pending = undefined
          this.phase = 'editable'
        } else if (result.status === 'OPERATION_MISMATCH') {
          this.pending = undefined
          this.phase = 'editable'
        } else {
          this.errorMessage = '创建结果暂时无法确认，请稍后再试'
        }
      } catch {
        this.errorMessage = '创建结果暂时无法确认，请稍后再试'
      }
    },
    async restorePending() {
      this.phase = 'checking'
      for (const pending of listPendingHouseholds()) {
        this.pending = pending
        this.draft = pending.draft
        await this.confirmPending()
        const currentPhase: HouseholdPhase = this.$state.phase
        if (currentPhase === 'loaded' || currentPhase === 'confirming') return
      }
      if ((this.$state.phase as HouseholdPhase) !== 'loaded') this.phase = 'editable'
    },
    async saveHousehold(input: UpdateHouseholdRequest): Promise<boolean> {
      try {
        const result = await cloudClient.updateHousehold(input)
        if (result.status !== 'HOME') return false
        this.applyHome(result)
        return true
      } catch { return false }
    },
    async saveProfile(input: UpdateProfileRequest): Promise<boolean> {
      try {
        const result = await cloudClient.updateProfile(input)
        if (result.status !== 'HOME') return false
        this.applyHome(result)
        return true
      } catch { return false }
    },
  },
})

export function useHouseholdStoreWithOut() { return useHouseholdStore(store) }
export function getHouseholdSuccessRevision(): number { return successRevision }
export function setHouseholdCloudClientForTesting(client: HouseholdCloudClient): void { cloudClient = client }
export function resetHouseholdCloudClientForTesting(): void {
  cloudClient = { create: createHouseholdInCloud, confirm: confirmHouseholdInCloud, get: getCurrentHouseholdInCloud, updateHousehold: updateHouseholdInCloud, updateProfile: updateProfileInCloud }
  createInFlight = undefined
  successRevision = 0
}
