// 徒步云端客户端：路线先写私有临时文件并经云端复核，记录保存成功后才变成共同内容。
import { cloudEnvironmentId, hasCloudEnvironment } from '../config/cloud'
import type { FootprintFailure } from '../types/footprint'
import type {
  HikingEntryDetail,
  HikingEntrySummary,
  HikingPhoto,
  HikingPlace,
  HikingRoute,
} from '../types/hiking'

interface FileSystemManager {
  writeFile(options: {
    filePath: string
    data: string
    encoding: 'utf8'
    success(): void
    fail(error: { errMsg?: string }): void
  }): void
  unlink(options: { filePath: string; complete(): void }): void
}
interface HikingRuntime {
  env: { USER_DATA_PATH: string }
  getFileSystemManager(): FileSystemManager
  cloud: {
    init(options: { env: string }): void
    callFunction(options: { name: string; data: Record<string, unknown> }): Promise<{ result: unknown }>
    uploadFile(options: { cloudPath: string; filePath: string }): Promise<{ fileID: string }>
  }
}

let initialized = false
let runtimeForTesting: HikingRuntime | undefined
let environmentForTesting: string | undefined

function runtime(): HikingRuntime {
  const value = runtimeForTesting ?? (globalThis as typeof globalThis & { wx?: HikingRuntime }).wx
  if (!value?.cloud) throw new Error('当前环境暂不支持微信云开发')
  if (!initialized) {
    const environment = environmentForTesting ?? cloudEnvironmentId
    if (!(environmentForTesting === undefined ? hasCloudEnvironment() : environment.trim().length > 0)) {
      throw new Error('尚未配置微信云开发环境')
    }
    value.cloud.init({ env: environment })
    initialized = true
  }
  return value
}

export function setHikingCloudRuntimeForTesting(value: HikingRuntime | undefined): void {
  runtimeForTesting = value
  initialized = false
}
export function setHikingCloudEnvironmentForTesting(value: string | undefined): void {
  environmentForTesting = value
  initialized = false
}
export function resetHikingCloudForTesting(): void {
  runtimeForTesting = undefined
  environmentForTesting = undefined
  initialized = false
}

async function call(action: string, input: Record<string, unknown> = {}): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      runtime().cloud.callFunction({ name: 'footprint', data: { action, ...input } }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('请求超时，请稍后重试')), 12_000)
      }),
    ])
    return result.result
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function isFailure(value: unknown): value is FootprintFailure {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as FootprintFailure).status === 'string' &&
    typeof (value as FootprintFailure).retryable === 'boolean' &&
    typeof (value as FootprintFailure).errorMessage === 'string',
  )
}

function isMapPoint(value: unknown): boolean {
  if (value === null) return true
  if (!value || typeof value !== 'object') return false
  const point = value as Record<string, unknown>
  return (
    typeof point.latitude === 'number' &&
    Math.abs(point.latitude) <= 90 &&
    typeof point.longitude === 'number' &&
    Math.abs(point.longitude) <= 180 &&
    (point.source === 'route' || point.source === 'place')
  )
}

function isHike(value: unknown): value is HikingEntrySummary {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    item.entryKind === 'hike' &&
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    (item.hikedAt === null || typeof item.hikedAt === 'string') &&
    isMapPoint(item.mapPoint) &&
    typeof item.hasRoute === 'boolean' &&
    (item.coverPhoto === null || isPhoto(item.coverPhoto)) &&
    typeof item.metrics === 'object' &&
    item.metrics !== null &&
    Number.isInteger(item.editVersion)
  )
}

function isPhoto(value: unknown): value is HikingPhoto {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as HikingPhoto).resourceId === 'string' &&
    typeof (value as HikingPhoto).digest === 'string',
  )
}

function isRoute(value: unknown): value is HikingRoute {
  if (!value || typeof value !== 'object') return false
  const route = value as HikingRoute
  return (
    route.version === 1 &&
    ['kml', 'tracking'].includes(route.source) &&
    Array.isArray(route.segments) &&
    route.segments.length > 0 &&
    route.segments.length <= 100 &&
    route.segments.every(
      (segment) =>
        Array.isArray(segment.points) &&
        segment.points.length >= 2 &&
        segment.points.every(
          (point) =>
            Number.isFinite(point.latitude) &&
            Math.abs(point.latitude) <= 90 &&
            Number.isFinite(point.longitude) &&
            Math.abs(point.longitude) <= 180,
        ),
    )
  )
}

function strictFailure(raw: unknown): FootprintFailure | null {
  return isFailure(raw) ? raw : null
}

export async function listHikesInCloud(
  input: { cursor?: string | null; pageSize?: number } = {},
): Promise<{ entries: HikingEntrySummary[]; cursor: string | null } | FootprintFailure> {
  const raw = await call('listHikes', input)
  const failure = strictFailure(raw)
  if (failure) return failure
  if (!raw || typeof raw !== 'object') throw new Error('徒步列表返回格式不正确')
  const value = raw as Record<string, unknown>
  if (
    value.status !== 'LISTED' ||
    !Array.isArray(value.entries) ||
    !value.entries.every(isHike) ||
    (value.cursor !== null && typeof value.cursor !== 'string')
  )
    throw new Error('徒步列表返回格式不正确')
  return { entries: value.entries, cursor: value.cursor as string | null }
}

export async function getHikeInCloud(entryId: string): Promise<HikingEntryDetail | FootprintFailure> {
  const raw = await call('getHike', { entryId })
  const failure = strictFailure(raw)
  if (failure) return failure
  if (!raw || typeof raw !== 'object') throw new Error('徒步详情返回格式不正确')
  const detail = (raw as Record<string, unknown>).detail
  if ((raw as Record<string, unknown>).status !== 'LOADED' || !isHike(detail)) {
    throw new Error('徒步详情返回格式不正确')
  }
  const routeResourceId = (detail as unknown as Record<string, unknown>).routeResourceId
  if (routeResourceId !== null && typeof routeResourceId !== 'string')
    throw new Error('徒步详情返回格式不正确')
  const photos = (detail as unknown as Record<string, unknown>).photos
  if (!Array.isArray(photos) || !photos.every(isPhoto)) throw new Error('徒步详情返回格式不正确')
  return detail as HikingEntryDetail
}

export async function getHikingRouteInCloud(resourceId: string): Promise<HikingRoute> {
  const raw = await call('getRouteUrl', { resourceId })
  if (isFailure(raw)) throw raw
  if (
    !raw ||
    typeof raw !== 'object' ||
    (raw as Record<string, unknown>).status !== 'LOADED' ||
    typeof (raw as Record<string, unknown>).url !== 'string'
  )
    throw new Error('路线访问结果不正确')
  const response = await uni.request({ url: String((raw as Record<string, unknown>).url), method: 'GET' })
  if (response.statusCode !== 200 || !isRoute(response.data)) throw new Error('路线暂时无法读取，请重试')
  return response.data
}

export async function uploadHikingRoute(route: HikingRoute): Promise<{ resourceId: string; digest: string }> {
  const prepared = await call('prepareRoute')
  if (isFailure(prepared)) throw prepared
  if (
    !prepared ||
    typeof prepared !== 'object' ||
    typeof (prepared as Record<string, unknown>).resourceId !== 'string' ||
    typeof (prepared as Record<string, unknown>).cloudPath !== 'string'
  )
    throw new Error('路线预约返回格式不正确')
  const resourceId = String((prepared as Record<string, unknown>).resourceId)
  const cloudPath = String((prepared as Record<string, unknown>).cloudPath)
  const localPath = `${runtime().env.USER_DATA_PATH}/${resourceId}.json`
  const manager = runtime().getFileSystemManager()
  try {
    await new Promise<void>((resolve, reject) =>
      manager.writeFile({
        filePath: localPath,
        data: JSON.stringify(route),
        encoding: 'utf8',
        success: resolve,
        fail: (error) => reject(new Error(error.errMsg || '路线临时文件写入失败')),
      }),
    )
    await runtime().cloud.uploadFile({ cloudPath, filePath: localPath })
    const reviewed = await call('reviewRoute', { resourceId })
    if (isFailure(reviewed)) throw reviewed
    if (
      !reviewed ||
      typeof reviewed !== 'object' ||
      (reviewed as Record<string, unknown>).status !== 'APPROVED' ||
      typeof (reviewed as Record<string, unknown>).digest !== 'string'
    )
      throw new Error('路线复核返回格式不正确')
    return { resourceId, digest: String((reviewed as Record<string, unknown>).digest) }
  } catch (error) {
    try {
      await call('abandonRoute', { resourceId })
    } catch {
      /* 云端过期清理会兜底，不能覆盖原始保存错误。 */
    }
    throw error
  } finally {
    manager.unlink({ filePath: localPath, complete: () => undefined })
  }
}

export async function abandonHikingRoute(resourceId: string): Promise<void> {
  await call('abandonRoute', { resourceId })
}

export async function createHikeInCloud(input: {
  expectedHouseholdId: string
  requestId: string
  name: string
  hikedAt: string | null
  place: HikingPlace | null
  memory: string
  distanceMeters: number | null
  durationSeconds: number | null
  routeResourceId: string | null
  photoResourceIds: string[]
}): Promise<HikingEntrySummary | FootprintFailure> {
  const raw = await call('createHike', input)
  const failure = strictFailure(raw)
  if (failure) return failure
  if (
    !raw ||
    typeof raw !== 'object' ||
    (raw as Record<string, unknown>).status !== 'CREATED' ||
    !isHike((raw as Record<string, unknown>).entry)
  )
    throw new Error('共同徒步保存结果不正确')
  return (raw as { entry: HikingEntrySummary }).entry
}

export async function updateHikeInCloud(input: {
  expectedHouseholdId: string
  entryId: string
  editVersion: number
  operationToken: string
  name: string
  hikedAt: string | null
  place: HikingPlace | null
  memory: string
  distanceMeters: number | null
  durationSeconds: number | null
  routeResourceId: string | null
  photoResourceIds: string[]
}): Promise<HikingEntrySummary | FootprintFailure> {
  const raw = await call('updateHike', input)
  const failure = strictFailure(raw)
  if (failure) return failure
  if (
    !raw ||
    typeof raw !== 'object' ||
    (raw as Record<string, unknown>).status !== 'UPDATED' ||
    !isHike((raw as Record<string, unknown>).entry)
  )
    throw new Error('共同徒步更新结果不正确')
  return (raw as { entry: HikingEntrySummary }).entry
}

export function humaniseHikingError(error: unknown): string {
  if (isFailure(error)) return error.errorMessage
  return error instanceof Error ? error.message : '暂时无法完成徒步操作，请稍后重试'
}
