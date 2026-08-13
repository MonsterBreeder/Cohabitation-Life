import { cloudEnvironmentId, hasCloudEnvironment } from '../config/cloud'
import { entryStatuses, type AuthIntent, type EntryResolution } from '../types/auth'

export interface WeChatCloud {
  init(options: { env: string }): void
  callFunction(options: {
    name: string
    data: { intent: AuthIntent; inviteToken?: string }
  }): Promise<{ result: unknown }>
}

export interface WeChatRuntime {
  cloud?: WeChatCloud
}

let initialized = false
// 十秒无响应时恢复页面操作，避免用户无限停留在加载状态。
const defaultTimeoutMs = 10_000
let timeoutMs = defaultTimeoutMs
let runtimeForTesting: WeChatRuntime | undefined
let environmentForTesting: string | undefined

export class AuthCloudError extends Error {
  constructor(
    public readonly code: 'CONFIGURATION' | 'PLATFORM_UNSUPPORTED' | 'TEMPORARY_FAILURE',
    message: string,
  ) {
    super(message)
    this.name = 'AuthCloudError'
  }
}

/** 获取微信云开发能力；网页预览会明确返回平台不支持。 */
function getWeChatCloud(): WeChatCloud {
  const runtime = runtimeForTesting ?? (globalThis as typeof globalThis & { wx?: WeChatRuntime }).wx

  if (!runtime?.cloud) {
    throw new AuthCloudError('PLATFORM_UNSUPPORTED', '当前环境暂不支持微信云开发')
  }

  return runtime.cloud
}

/** 获取正式配置或测试注入的云环境编号。 */
function configuredEnvironmentId(): string {
  return environmentForTesting ?? cloudEnvironmentId
}

/** 为云函数调用增加前端等待上限，底层迟到结果不会改变当前页面。 */
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AuthCloudError('TEMPORARY_FAILURE', '连接云端服务超时，请稍后重试'))
    }, timeoutMs)

    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** 校验云端结果只包含前端认识的有限状态。 */
function isEntryResolution(value: unknown): value is EntryResolution {
  if (!value || typeof value !== 'object') return false

  const resolution = value as Partial<EntryResolution>
  return typeof resolution.status === 'string'
    && entryStatuses.includes(resolution.status as EntryResolution['status'])
    && typeof resolution.retryable === 'boolean'
}

/** 提取微信平台可安全展示的简短错误，避免登录失败时只剩下笼统提示。 */
function readableCloudError(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined

  const platformError = error as { errMsg?: unknown; message?: unknown }
  const message = typeof platformError.errMsg === 'string'
    ? platformError.errMsg
    : typeof platformError.message === 'string'
      ? platformError.message
      : undefined

  return message?.trim().slice(0, 180) || undefined
}

/** 只初始化一次微信云开发，缺少环境编号时立即给出明确错误。 */
export function initializeAuthCloud(): void {
  if (initialized) return

  const environmentId = configuredEnvironmentId()
  if (!(environmentForTesting === undefined ? hasCloudEnvironment() : environmentId.trim().length > 0)) {
    throw new AuthCloudError('CONFIGURATION', '尚未配置微信云开发测试环境')
  }

  getWeChatCloud().init({ env: environmentId })
  initialized = true
}

/** 调用统一登录云函数，并把平台错误转换为可重试错误。 */
export async function resolveLoginInCloud(input: {
  intent: AuthIntent
  inviteToken?: string
}): Promise<EntryResolution> {
  initializeAuthCloud()

  try {
    const response = await withTimeout(getWeChatCloud().callFunction({
      name: 'resolve-login',
      data: input,
    }))

    if (!isEntryResolution(response.result)) {
      throw new AuthCloudError('TEMPORARY_FAILURE', '云端返回结果无效')
    }

    return response.result
  } catch (error) {
    if (error instanceof AuthCloudError) throw error
    const detail = readableCloudError(error)
    throw new AuthCloudError(
      'TEMPORARY_FAILURE',
      detail ? `云端调用失败：${detail}` : '暂时无法连接服务，请稍后重试',
    )
  }
}

// 以下方法仅供单元测试隔离运行环境，不参与产品页面调用。
export function resetAuthCloudForTesting(): void {
  initialized = false
  timeoutMs = defaultTimeoutMs
  runtimeForTesting = undefined
  environmentForTesting = undefined
}

export function setAuthCloudRuntimeForTesting(runtime?: WeChatRuntime): void {
  runtimeForTesting = runtime
}

export function setAuthCloudEnvironmentForTesting(environment?: string): void {
  environmentForTesting = environment
}

export function setAuthCloudTimeoutForTesting(timeout: number): void {
  timeoutMs = timeout
}
