import { defineStore } from 'pinia'
import { AuthCloudError, resolveLoginInCloud } from '../../services/auth-cloud'
import { resolveEntryRoute } from '../../services/entry-router'
import type { AuthIntent, EntryNotice, EntryResolution, EntryRoute } from '../../types/auth'
import { getStringStorage, setStringStorage } from '../../utils/storage'
import store from '..'
import { getHouseholdSuccessRevision } from './household'

const loginMarkerKey = 'auth.login.completed'
const inviteTokenKey = 'auth.invite.pending'

// 云端客户端通过接口注入，单元测试可以验证状态变化而不访问真实微信环境。
interface AuthCloudClient {
  resolve(input: { intent: AuthIntent; inviteToken?: string }): Promise<EntryResolution>
}

interface AuthState {
  hasCompletedLogin: boolean
  pendingInviteToken: string | undefined
  isResolving: boolean
  errorMessage: string | undefined
  notice: EntryNotice | undefined
  navigationIntent: EntryRoute | undefined
  lastIntent: AuthIntent | undefined
}

let cloudClient: AuthCloudClient = { resolve: resolveLoginInCloud }
let inFlight: Promise<void> | undefined

/** 登录与启动分流状态，采用参考项目一致的对象式 Pinia 写法。 */
export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    /** 是否曾经主动完成登录 */
    hasCompletedLogin: getStringStorage(loginMarkerKey) === '1',
    /** 登录期间临时保存的邀请 */
    pendingInviteToken: getStringStorage(inviteTokenKey),
    /** 是否正在请求云端 */
    isResolving: false,
    /** 当前可展示的错误 */
    errorMessage: undefined,
    /** 当前有限提示编号 */
    notice: undefined,
    /** 等待页面消费的一次性跳转 */
    navigationIntent: undefined,
    /** 上一次调用意图，用于失败重试 */
    lastIntent: undefined,
  }),
  getters: {
    /** 当前是否允许重新执行上一次动作 */
    canRetry: (state) => !state.isResolving && state.lastIntent !== undefined,
  },
  actions: {
    /** 暂存分享入口中的邀请，直到完成分流或交给加入页面。 */
    captureInviteToken(inviteToken?: string) {
      if (!inviteToken) return
      this.pendingInviteToken = inviteToken
      setStringStorage(inviteTokenKey, inviteToken)
    },
    /** 清理已完成或已经失效的邀请。 */
    clearInviteToken() {
      this.pendingInviteToken = undefined
      setStringStorage(inviteTokenKey)
    },
    /** 记录用户曾主动完成登录，后续重开只执行查询。 */
    markLoginCompleted() {
      this.hasCompletedLogin = true
      setStringStorage(loginMarkerKey, '1')
    },
    /** 云端找不到用户时清除过期的本地登录标记。 */
    clearLoginMarker() {
      this.hasCompletedLogin = false
      setStringStorage(loginMarkerKey)
    },
    /** 根据云端状态一次性更新登录标记、邀请和页面去向。 */
    applyResolution(resolution: EntryResolution) {
      // 云函数正常响应不代表业务成功；暂时失败必须留在当前页并明确提示。
      this.errorMessage = resolution.status === 'TEMPORARY_FAILURE'
        ? '云端暂时无法完成登录，请稍后重试'
        : undefined
      const route = resolveEntryRoute(resolution.status)
      this.notice = route.type === 'relaunch' ? route.notice : undefined

      if (resolution.status === 'NEED_LOGIN') {
        this.clearLoginMarker()
      } else if (resolution.status !== 'TEMPORARY_FAILURE' && resolution.status !== 'INVITE_INVALID') {
        this.markLoginCompleted()
      }

      if (
        resolution.status !== 'TEMPORARY_FAILURE'
        && resolution.status !== 'NEED_LOGIN'
        && resolution.status !== 'JOIN_CONFIRM'
        && resolution.status !== 'TRANSFER_CONFIRM'
      ) {
        this.clearInviteToken()
      }

      this.navigationIntent = route.type === 'relaunch' ? route : undefined
    },
    /** 串行执行登录或恢复，重复生命周期调用会复用同一个请求。 */
    async resolve(intent: AuthIntent) {
      if (inFlight) return inFlight

      const householdRevision = getHouseholdSuccessRevision()
      this.lastIntent = intent
      this.isResolving = true
      this.errorMessage = undefined

      inFlight = cloudClient.resolve({ intent, inviteToken: this.pendingInviteToken })
        .then((resolution) => {
          // 创建成功比更早发出的入口查询更新，旧结果不能把用户送回创建页。
          if (resolution.status === 'CREATE_HOME' && householdRevision !== getHouseholdSuccessRevision()) return
          this.applyResolution(resolution)
        })
        .catch((error: unknown) => {
          this.navigationIntent = undefined
          this.notice = undefined
          this.errorMessage = error instanceof AuthCloudError
            ? error.message
            : '暂时无法连接服务，请稍后重试'
        })
        .finally(() => {
          this.isResolving = false
          inFlight = undefined
        })

      return inFlight
    },
    /** 已有登录标记时查询最新身份和家庭状态。 */
    async restore() {
      if (!this.hasCompletedLogin) return
      await this.resolve('resume')
    },
    /** 用户主动点击后执行首次登录。 */
    async login() {
      await this.resolve('login')
    },
    /** 重试上一次失败的登录或恢复动作。 */
    async retry() {
      if (!this.lastIntent) return
      await this.resolve(this.lastIntent)
    },
    /** 页面读取一次导航意图后立即清空，防止重复跳转。 */
    consumeNavigationIntent(): EntryRoute | undefined {
      const route = this.navigationIntent
      this.navigationIntent = undefined
      return route
    },
  },
})

/** 在组件 setup 之外使用登录状态。 */
export function useAuthStoreWithOut() {
  return useAuthStore(store)
}

/** 单元测试替换真实云端客户端。 */
export function setAuthCloudClientForTesting(client: AuthCloudClient): void {
  cloudClient = client
}

/** 单元测试结束后恢复真实云端客户端和请求状态。 */
export function resetAuthCloudClientForTesting(): void {
  cloudClient = { resolve: resolveLoginInCloud }
  inFlight = undefined
}
