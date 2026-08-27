import { cloudEnvironmentId, hasCloudEnvironment } from '../config/cloud'
import type { InvitationResult, JoinInvitationRequest } from '../types/invitation'

interface Runtime {
  cloud?: { init(options: { env: string }): void; callFunction(options: { name: string; data: Record<string, unknown> }): Promise<{ result: unknown }> }
}

let initialized = false
let runtimeForTesting: Runtime | undefined
let environmentForTesting: string | undefined
let timeoutForTesting: number | undefined
const cloudRequestTimeout = 12_000

/** 邀请服务与家庭资料服务独立校验结果，避免页面把未知云端数据当作可操作状态。 */
function runtime(): NonNullable<Runtime['cloud']> {
  const cloud = (runtimeForTesting ?? (globalThis as typeof globalThis & { wx?: Runtime }).wx)?.cloud
  if (!cloud) throw new Error('当前环境不支持微信云服务')
  return cloud
}

function initialize(): void {
  if (initialized) return
  const environment = environmentForTesting ?? cloudEnvironmentId
  if (!(environmentForTesting === undefined ? hasCloudEnvironment() : environment.trim())) throw new Error('尚未配置云环境')
  runtime().init({ env: environment })
  initialized = true
}

function isResult(value: unknown): value is InvitationResult {
  if (!value || typeof value !== 'object' || typeof (value as { status?: unknown }).status !== 'string' || typeof (value as { retryable?: unknown }).retryable !== 'boolean') return false
  const result = value as { status: string; inviteToken?: unknown; expiresAt?: unknown; inviteeName?: unknown; household?: { name?: unknown; memberCount?: unknown; members?: unknown }; inviter?: { nickname?: unknown; avatar?: unknown } }
  if (result.status === 'INVITE_READY') return typeof result.inviteToken === 'string' && typeof result.expiresAt === 'string' && typeof result.inviteeName === 'string'
  if (result.status === 'INVITE_PREVIEW') return typeof result.household?.name === 'string' && typeof result.household?.memberCount === 'number' && typeof result.inviter?.nickname === 'string' && Boolean(result.inviter.avatar)
  if (result.status === 'TRANSFER_CONFIRM') return true
  if (result.status === 'HOME') return typeof result.household?.name === 'string' && Array.isArray(result.household?.members)
  return ['INVITE_INVALID', 'INVITE_EXPIRED', 'INVITE_USED', 'HOME_FULL', 'ALREADY_IN_HOME', 'FORBIDDEN', 'NO_OTHER_MEMBER', 'NO_HOME', 'MULTIPLE_HOUSEHOLDS', 'INVALID_REQUEST', 'CONTENT_REJECTED', 'TEMPORARY_FAILURE'].includes(result.status)
}

/** 兼容手机仍连接旧版云端时缺少邀请对象昵称的返回，避免新页面把有效邀请误判成失败。 */
function normalizeCreateInvitationResult(value: unknown, inviteeName: string): unknown {
  if (!value || typeof value !== 'object') return value
  const result = value as { status?: unknown; inviteeName?: unknown }
  if (result.status === 'INVITE_READY' && typeof result.inviteeName !== 'string') return { ...result, inviteeName }
  return value
}

/** 云端没有及时回应时主动结束等待，避免真机页面永久停留在准备状态。 */
function withTimeout<T>(work: Promise<T>): Promise<T> {
  const timeout = timeoutForTesting ?? cloudRequestTimeout
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('INVITATION_TIMEOUT')), timeout)
    work.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

async function call(action: string, data: object = {}): Promise<InvitationResult> {
  initialize()
  const response = await withTimeout(runtime().callFunction({ name: 'household', data: { action, ...data } }))
  const result = action === 'createInvite' && typeof (data as { inviteeName?: unknown }).inviteeName === 'string'
    ? normalizeCreateInvitationResult(response.result, (data as { inviteeName: string }).inviteeName)
    : response.result
  if (!isResult(result)) throw new Error('邀请服务返回的数据无效')
  return result
}

export const createInvitationInCloud = (inviteeName: string) => call('createInvite', { inviteeName })
export const previewInvitationInCloud = (inviteToken: string) => call('previewInvite', { inviteToken })
export const joinInvitationInCloud = (input: JoinInvitationRequest) => call('joinInvite', input)
export const removeOtherMemberInCloud = () => call('removeOtherMember')

export function setInvitationCloudRuntimeForTesting(value?: Runtime): void { runtimeForTesting = value }
export function setInvitationCloudEnvironmentForTesting(value?: string): void { environmentForTesting = value }
export function setInvitationCloudTimeoutForTesting(value?: number): void { timeoutForTesting = value }
export function resetInvitationCloudForTesting(): void { initialized = false; runtimeForTesting = undefined; environmentForTesting = undefined; timeoutForTesting = undefined }
