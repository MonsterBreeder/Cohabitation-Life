import { cloudEnvironmentId, hasCloudEnvironment } from '../config/cloud'
import type { ConfirmHouseholdRequest, CreateHouseholdRequest, HouseholdResult, UpdateHouseholdRequest, UpdateProfileRequest } from '../types/household'

interface HouseholdCloudRuntime {
  cloud?: {
    init(options: { env: string }): void
    callFunction(options: { name: string; data: Record<string, unknown> }): Promise<{ result: unknown }>
  }
}

let initialized = false
let timeoutMs = 10_000
let runtimeForTesting: HouseholdCloudRuntime | undefined
let environmentForTesting: string | undefined

export class HouseholdCloudError extends Error {
  constructor(
    public readonly code: 'CONFIGURATION' | 'PLATFORM_UNSUPPORTED' | 'TIMEOUT' | 'TEMPORARY_FAILURE' | 'INVALID_RESPONSE',
    message: string,
  ) {
    super(message)
    this.name = 'HouseholdCloudError'
  }
}

function cloudRuntime() {
  const runtime = runtimeForTesting ?? (globalThis as typeof globalThis & { wx?: HouseholdCloudRuntime }).wx
  if (!runtime?.cloud) throw new HouseholdCloudError('PLATFORM_UNSUPPORTED', '当前环境暂不支持微信云开发')
  return runtime.cloud
}

function initialize(): void {
  if (initialized) return
  const environmentId = environmentForTesting ?? cloudEnvironmentId
  if (!(environmentForTesting === undefined ? hasCloudEnvironment() : environmentId.trim().length > 0)) {
    throw new HouseholdCloudError('CONFIGURATION', '尚未配置微信云开发测试环境')
  }
  cloudRuntime().init({ env: environmentId })
  initialized = true
}

function isBuiltinAvatar(value: unknown, prefix: 'household' | 'person'): boolean {
  if (!value || typeof value !== 'object') return false
  const avatar = value as { kind?: unknown; id?: unknown }
  return avatar.kind === 'builtin' && typeof avatar.id === 'string' && avatar.id.startsWith(prefix === 'household' ? 'household-' : 'person-')
}
function isAvatar(value: unknown, prefix: 'household' | 'person'): boolean {
  if (isBuiltinAvatar(value, prefix)) return true
  if (!value || typeof value !== 'object') return false
  const avatar = value as { kind?: unknown; resourceId?: unknown; digest?: unknown }
  return avatar.kind === 'custom' && /^avatar_[a-f0-9]{32}$/.test(String(avatar.resourceId || '')) && /^[a-f0-9]{64}$/.test(String(avatar.digest || ''))
}

/** 首页成员列表只接受两条受限展示资料，拒绝携带身份编号或任意扩展字段的伪造结果。 */
function isMemberDisplay(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const member = value as { nickname?: unknown; avatar?: unknown; isSelf?: unknown }
  return typeof member.nickname === 'string'
    && isAvatar(member.avatar, 'person')
    && typeof member.isSelf === 'boolean'
}

function isHouseholdResult(value: unknown): value is HouseholdResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<HouseholdResult>
  const finiteStatuses = ['NO_HOME', 'OPERATION_MISMATCH', 'INVALID_REQUEST', 'MULTIPLE_HOUSEHOLDS', 'TEMPORARY_FAILURE']
  if (typeof result.retryable !== 'boolean' || typeof result.status !== 'string') return false
  if (finiteStatuses.includes(result.status)) return true
  if (result.status !== 'HOME') return false
  const home = result as Extract<HouseholdResult, { status: 'HOME' }>
  return typeof home.created === 'boolean'
    && typeof home.household?.id === 'string'
    && typeof home.household?.name === 'string'
    && typeof home.household?.memberCount === 'number'
    && ['owner', 'member'].includes(home.household?.currentMemberRole)
    && isAvatar(home.household?.avatar, 'household')
    && Array.isArray(home.household?.members)
    && home.household.members.length === home.household.memberCount
    && home.household.members.length >= 1
    && home.household.members.length <= 2
    && home.household.members.filter((member) => member.isSelf).length === 1
    && home.household.members.every(isMemberDisplay)
    && typeof home.profile?.nickname === 'string'
    && isAvatar(home.profile?.avatar, 'person')
}

async function call(action: 'create' | 'confirm' | 'get' | 'updateHousehold' | 'updateProfile', input: CreateHouseholdRequest | ConfirmHouseholdRequest | UpdateHouseholdRequest | UpdateProfileRequest | Record<string, never>): Promise<HouseholdResult> {
  initialize()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const response = await Promise.race([
      cloudRuntime().callFunction({ name: 'household', data: { action, ...input } }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new HouseholdCloudError('TIMEOUT', '创建结果仍在确认中')), timeoutMs)
      }),
    ])
    if (!isHouseholdResult(response.result)) throw new HouseholdCloudError('INVALID_RESPONSE', '云端返回的家庭资料无效')
    return response.result
  } catch (error) {
    if (error instanceof HouseholdCloudError) throw error
    throw new HouseholdCloudError('TEMPORARY_FAILURE', '暂时无法连接家庭服务，请稍后重试')
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const createHouseholdInCloud = (input: CreateHouseholdRequest) => call('create', input)
export const confirmHouseholdInCloud = (input: ConfirmHouseholdRequest) => call('confirm', input)
/** 首页重开只发送查询动作，家庭归属由云端可信身份决定。 */
export const getCurrentHouseholdInCloud = () => call('get', {})
export const updateHouseholdInCloud = (input: UpdateHouseholdRequest) => call('updateHousehold', input)
export const updateProfileInCloud = (input: UpdateProfileRequest) => call('updateProfile', input)

export function resetHouseholdCloudForTesting(): void {
  initialized = false
  timeoutMs = 10_000
  runtimeForTesting = undefined
  environmentForTesting = undefined
}
export function setHouseholdCloudRuntimeForTesting(runtime?: HouseholdCloudRuntime): void { runtimeForTesting = runtime }
export function setHouseholdCloudEnvironmentForTesting(environment?: string): void { environmentForTesting = environment }
export function setHouseholdCloudTimeoutForTesting(value: number): void { timeoutMs = value }
