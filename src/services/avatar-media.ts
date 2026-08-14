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

export async function uploadAvatar(filePath: string, purpose: CustomAvatarPurpose): Promise<CustomAvatar> {
  const prepared = await action('prepareAvatar', { purpose })
  if (prepared?.status !== 'UPLOAD_READY') throw new Error('暂时无法准备头像上传')
  await cloudApi().uploadFile({ cloudPath: prepared.cloudPath, filePath })
  const checked = await action('checkAvatar', { resourceId: prepared.resourceId })
  if (checked?.status !== 'APPROVED') throw new Error(checked?.status === 'REJECTED' ? '这张图片未通过安全检查' : '图片检查暂时不可用')
  return { kind: 'custom', resourceId: prepared.resourceId, digest: checked.digest }
}

export async function getAvatarTemporaryUrl(resourceId: string): Promise<string> {
  const result = await action('getAvatarUrl', { resourceId })
  if (result?.status !== 'URL_READY' || typeof result.url !== 'string') throw new Error('暂时无法读取头像')
  return result.url
}
