import { cloudEnvironmentId, hasCloudEnvironment } from '../config/cloud'
import type { CustomAvatar, CustomAvatarPurpose } from '../types/household'

interface AvatarRuntime { cloud?: { init(options: { env: string }): void; callFunction(options: { name: string; data: Record<string, unknown> }): Promise<{ result: any }>; uploadFile(options: { cloudPath: string; filePath: string }): Promise<{ fileID: string }> } }
let initialized = false

function cloudApi() {
  const api = (globalThis as typeof globalThis & { wx?: AvatarRuntime }).wx?.cloud
  if (!api || !hasCloudEnvironment()) throw new Error('当前环境暂不支持安全上传头像')
  if (!initialized) { api.init({ env: cloudEnvironmentId }); initialized = true }
  return api
}

async function action(name: string, data: Record<string, unknown>) {
  const response = await cloudApi().callFunction({ name: 'household', data: { action: name, ...data } })
  return response.result
}

/**
 * 头像云函数返回的状态联合：prepareAvatar / checkAvatar / getAvatarUrl 三处
 * 都共用 cloudfunctions/household/avatar-media.js 里的 AvatarMediaError 集合。
 * 用 string 兜底是给未来新增状态留余地，避免前端报错而不是显示兜底文案。
 */
export type AvatarCloudStatus =
  | 'UPLOAD_READY' | 'APPROVED' | 'URL_READY' | 'RELEASED'
  | 'REJECTED'
  | 'INVALID_REQUEST' | 'INVALID_MEDIA'
  | 'MEDIA_NOT_FOUND' | 'MEDIA_FORBIDDEN'
  | 'NO_HOME'
  | 'RATE_LIMITED' | 'RESOURCE_LIMIT' | 'TEMPORARY_FAILURE'
  | string

/**
 * 把云函数 status 翻译成用户能看懂的提示；找不到映射时落到"头像服务暂时不可用"。
 * 集中在这里而不是散在调用方：crop-avatar / create-home / edit-profile 三个入口
 * 共用同一套文案，避免出现"同一原因、提示不同"的情况——之前所有非 UPLOAD_READY
 * 都吐"暂时无法准备头像上传"是这次调试时一直定位不到真实原因的关键障碍。
 */
export function describeAvatarCloudError(status: unknown): string {
  switch (status) {
    case 'RATE_LIMITED': return '最近尝试次数过多，请稍后再试'
    case 'RESOURCE_LIMIT': return '头像上传占位已满，请先完成或放弃正在上传的头像'
    case 'INVALID_REQUEST': return '头像参数不正确，请重新选择'
    case 'INVALID_MEDIA': return '这张图片无法识别，请换一张 JPG / PNG / WebP 试试'
    case 'MEDIA_NOT_FOUND': return '头像已被清理，请重新上传'
    case 'MEDIA_FORBIDDEN': return '当前头像无法访问，请重新上传'
    case 'NO_HOME': return '请先加入一个家庭再上传头像'
    case 'REJECTED': return '这张图片未通过安全检查'
    case 'TEMPORARY_FAILURE': return '云端暂时无法处理，请稍后再试'
    default: return '头像服务暂时不可用，请稍后再试'
  }
}

export async function uploadAvatar(filePath: string, purpose: CustomAvatarPurpose): Promise<CustomAvatar> {
  let prepared = await action('prepareAvatar', { purpose })
  // 旧版流程在上传中断时会留下占位。用户再次上传时自动恢复，
  // 只重试一次，避免云端异常时形成循环请求。
  if (prepared?.status === 'RESOURCE_LIMIT') {
    await releaseAvatarSlots()
    prepared = await action('prepareAvatar', { purpose })
  }
  // 透传具体 status：避免之前把所有失败都翻译成同一句话，让用户和开发者都看不到真实原因。
  if (prepared?.status !== 'UPLOAD_READY') throw asCloudError(prepared?.status)
  const uploaded = await cloudApi().uploadFile({ cloudPath: prepared.cloudPath, filePath })
  const checked = await action('checkAvatar', { resourceId: prepared.resourceId, fileID: uploaded.fileID })
  if (checked?.status !== 'APPROVED') throw asCloudError(checked?.status)
  return { kind: 'custom', resourceId: prepared.resourceId, digest: checked.digest }
}

export async function getAvatarTemporaryUrl(resourceId: string): Promise<string> {
  const result = await action('getAvatarUrl', { resourceId })
  if (result?.status !== 'URL_READY' || typeof result.url !== 'string') throw asCloudError(result?.status)
  return result.url
}

/**
 * 释放当前微信身份下所有 avatar upload slot，并把残留 prepared 记录标记为
 * replaced；用于 RESOURCE_LIMIT 时的"释放占位并重试"按钮。
 * 调用成功后下次 prepareAvatar 应当能正常走通；调用失败时抛出和 uploadAvatar 同款的 Error。
 */
export async function releaseAvatarSlots(): Promise<{ releasedSlots: number; releasedPending: number }> {
  const result = await action('releaseAvatarSlots', {})
  if (result?.status !== 'RELEASED') throw asCloudError(result?.status)
  return { releasedSlots: result.releasedSlots ?? 0, releasedPending: result.releasedPending ?? 0 }
}

/** 给 Error 加上 status 字段，让调用方不用解析中文文案也能区分 RESOURCE_LIMIT 等。 */
function asCloudError(status: unknown): Error {
  const message = describeAvatarCloudError(status)
  const error = new Error(message)
  ;(error as Error & { status?: unknown }).status = status
  return error
}
