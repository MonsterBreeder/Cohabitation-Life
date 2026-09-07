// 足迹云端客户端：严格校验返回结构，页面不能直接信任云函数或云存储返回值。
import { cloudEnvironmentId, hasCloudEnvironment } from '../config/cloud'
import type {
  FootprintEntryDetail,
  FootprintEntrySummary,
  FootprintFailure,
  FootprintHomeSummary,
  FootprintOverview,
  FootprintPhoto,
  FootprintPhotoReservation,
  FootprintPlace,
  FootprintPlaceSummary,
} from '../types/footprint'

interface CloudRuntime {
  cloud?: {
    init(options: { env: string }): void
    callFunction(options: { name: string; data: Record<string, unknown> }): Promise<{ result: unknown }>
    uploadFile(options: { cloudPath: string; filePath: string }): Promise<{ fileID: string }>
  }
}

let initialized = false
let runtimeForTesting: CloudRuntime | undefined
let environmentForTesting: string | undefined
let timeoutMs = 12_000

export class FootprintCloudError extends Error {
  constructor(public readonly code: 'CONFIGURATION' | 'PLATFORM_UNSUPPORTED' | 'TIMEOUT' | 'TEMPORARY_FAILURE' | 'INVALID_RESPONSE', message: string) {
    super(message)
    this.name = 'FootprintCloudError'
  }
}

function runtime(): Required<CloudRuntime>['cloud'] {
  const value = runtimeForTesting ?? (globalThis as typeof globalThis & { wx?: CloudRuntime }).wx
  if (!value?.cloud) throw new FootprintCloudError('PLATFORM_UNSUPPORTED', '当前环境暂不支持微信云开发')
  return value.cloud
}

function initialize(): void {
  if (initialized) return
  const environment = environmentForTesting ?? cloudEnvironmentId
  if (!(environmentForTesting === undefined ? hasCloudEnvironment() : environment.trim().length > 0)) {
    throw new FootprintCloudError('CONFIGURATION', '尚未配置微信云开发环境')
  }
  runtime().init({ env: environment })
  initialized = true
}

export function setFootprintCloudRuntimeForTesting(value: CloudRuntime | undefined): void { runtimeForTesting = value; initialized = false }
export function setFootprintCloudEnvironmentForTesting(value: string | undefined): void { environmentForTesting = value; initialized = false }
export function setFootprintCloudTimeoutForTesting(value: number): void { timeoutMs = value }
export function resetFootprintCloudForTesting(): void { initialized = false; runtimeForTesting = undefined; environmentForTesting = undefined; timeoutMs = 12_000 }

function isPlace(value: unknown): value is FootprintPlace {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.name === 'string' && typeof item.address === 'string'
    && item.name.trim().length > 0
    && typeof item.latitude === 'number' && Number.isFinite(item.latitude) && Math.abs(item.latitude) <= 90
    && typeof item.longitude === 'number' && Number.isFinite(item.longitude) && Math.abs(item.longitude) <= 180
}

export function isFootprintPhoto(value: unknown): value is FootprintPhoto {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.resourceId === 'string' && typeof item.digest === 'string'
    && (item.url === undefined || typeof item.url === 'string')
}

export function isFootprintEntry(value: unknown): value is FootprintEntrySummary {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.id === 'string' && typeof item.placeKey === 'string' && isPlace(item.place)
    && typeof item.visitedAt === 'string' && typeof item.memory === 'string'
    && (item.coverPhoto === null || isFootprintPhoto(item.coverPhoto))
    && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string'
    && Number.isInteger(item.editVersion) && Number(item.editVersion) >= 1
}

function isPlaceSummary(value: unknown): value is FootprintPlaceSummary {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.placeKey === 'string' && isPlace(item.place) && Number.isInteger(item.visitCount) && Number(item.visitCount) >= 1 && isFootprintEntry(item.latestEntry)
}

function isHomeSummary(value: unknown): value is FootprintHomeSummary {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return Number.isInteger(item.placeCount) && Number(item.placeCount) >= 0 && (item.latestEntry === null || isFootprintEntry(item.latestEntry))
}

function isFailure(value: unknown): value is FootprintFailure {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  const failureStatuses = new Set([
    'NO_HOME', 'FOOTPRINT_NOT_FOUND', 'FOOTPRINT_CONFLICT', 'FOOTPRINT_INVALID',
    'FOOTPRINT_FORBIDDEN', 'FOOTPRINT_MEDIA_INVALID', 'FOOTPRINT_MEDIA_REJECTED',
    'FOOTPRINT_CONTENT_REJECTED', 'FOOTPRINT_RATE_LIMITED', 'TEMPORARY_FAILURE',
  ])
  return typeof item.status === 'string' && failureStatuses.has(item.status)
    && typeof item.retryable === 'boolean' && typeof item.errorMessage === 'string'
}

async function call(action: string, input: Record<string, unknown> = {}): Promise<unknown> {
  initialize()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new FootprintCloudError('TIMEOUT', '足迹服务响应超时')), timeoutMs) })
  try {
    const response = await Promise.race([runtime().callFunction({ name: 'footprint', data: { action, ...input } }), timeout])
    return response.result
  } catch (error) {
    if (error instanceof FootprintCloudError) throw error
    throw new FootprintCloudError('TEMPORARY_FAILURE', '暂时无法完成足迹操作')
  } finally { if (timer) clearTimeout(timer) }
}

export async function getFootprintOverviewInCloud(): Promise<FootprintOverview | FootprintFailure> {
  const raw = await call('getOverview')
  if (isFailure(raw)) return raw
  if (!raw || typeof raw !== 'object') throw new FootprintCloudError('INVALID_RESPONSE', '足迹概览格式错误')
  const item = raw as Record<string, unknown>
  if (item.status !== 'LOADED' || !isHomeSummary(item.summary) || !Array.isArray(item.places) || !item.places.every(isPlaceSummary)
    || !Array.isArray(item.entries) || !item.entries.every(isFootprintEntry) || typeof item.showPreJoinHistoryNotice !== 'boolean'
    || (item.entriesCursor !== null && typeof item.entriesCursor !== 'string') || (item.placesCursor !== null && typeof item.placesCursor !== 'string')) {
    throw new FootprintCloudError('INVALID_RESPONSE', '足迹概览格式错误')
  }
  return { summary: item.summary, places: item.places, entries: item.entries, entriesCursor: item.entriesCursor, placesCursor: item.placesCursor, showPreJoinHistoryNotice: item.showPreJoinHistoryNotice }
}

/** 首页不下载地图和时间列表；三个读请求独立失败，互不拖累。 */
export async function getFootprintSummaryInCloud(): Promise<{ summary: FootprintHomeSummary; showPreJoinHistoryNotice: boolean } | FootprintFailure> {
  const raw = await call('getSummary')
  if (isFailure(raw)) return raw
  const item = raw as Record<string, unknown>
  if (!item || item.status !== 'LOADED' || !isHomeSummary(item.summary) || typeof item.showPreJoinHistoryNotice !== 'boolean') throw new FootprintCloudError('INVALID_RESPONSE', '足迹摘要格式错误')
  return { summary: item.summary, showPreJoinHistoryNotice: item.showPreJoinHistoryNotice }
}

export async function listFootprintEntriesInCloud(input: { cursor?: string | null; placeKey?: string | null }): Promise<{ entries: FootprintEntrySummary[]; cursor: string | null } | FootprintFailure> {
  const raw = await call('listEntries', input)
  if (isFailure(raw)) return raw
  const item = raw as Record<string, unknown>
  if (!item || item.status !== 'LISTED' || !Array.isArray(item.entries) || !item.entries.every(isFootprintEntry) || (item.cursor !== null && typeof item.cursor !== 'string')) throw new FootprintCloudError('INVALID_RESPONSE', '足迹列表格式错误')
  return { entries: item.entries, cursor: item.cursor as string | null }
}

export async function listFootprintPlacesInCloud(input: { cursor?: string | null }): Promise<{ places: FootprintPlaceSummary[]; cursor: string | null } | FootprintFailure> {
  const raw = await call('listPlaces', input)
  if (isFailure(raw)) return raw
  const item = raw as Record<string, unknown>
  if (!item || item.status !== 'LISTED' || !Array.isArray(item.places) || !item.places.every(isPlaceSummary) || (item.cursor !== null && typeof item.cursor !== 'string')) throw new FootprintCloudError('INVALID_RESPONSE', '足迹地点格式错误')
  return { places: item.places, cursor: item.cursor as string | null }
}

export async function getFootprintEntryInCloud(entryId: string): Promise<FootprintEntryDetail | FootprintFailure> {
  const raw = await call('getEntry', { entryId })
  if (isFailure(raw)) return raw
  const item = raw as Record<string, unknown>
  const detail = item?.detail as Record<string, unknown>
  if (!item || item.status !== 'LOADED' || !isFootprintEntry(detail) || !Array.isArray(detail.photos) || !detail.photos.every(isFootprintPhoto)
    || !detail.creator || typeof detail.creator !== 'object' || !Number.isInteger(detail.samePlaceCount)) throw new FootprintCloudError('INVALID_RESPONSE', '足迹详情格式错误')
  return detail as unknown as FootprintEntryDetail
}

export async function createFootprintEntryInCloud(input: { expectedHouseholdId?: string; requestId: string; place: FootprintPlace; visitedAt: string; memory: string; photoResourceIds: string[] }): Promise<FootprintEntrySummary | FootprintFailure> {
  const raw = await call('createEntry', input)
  if (isFailure(raw)) return raw
  const item = raw as Record<string, unknown>
  if (!item || item.status !== 'CREATED' || !isFootprintEntry(item.entry)) throw new FootprintCloudError('INVALID_RESPONSE', '新增足迹格式错误')
  return item.entry
}

export async function updateFootprintEntryInCloud(input: { expectedHouseholdId?: string; entryId: string; operationToken: string; editVersion: number; place: FootprintPlace; visitedAt: string; memory: string; photoResourceIds: string[] }): Promise<FootprintEntrySummary | FootprintFailure> {
  const raw = await call('updateEntry', input)
  if (isFailure(raw)) return raw
  const item = raw as Record<string, unknown>
  if (!item || item.status !== 'UPDATED' || !isFootprintEntry(item.entry)) throw new FootprintCloudError('INVALID_RESPONSE', '编辑足迹格式错误')
  return item.entry
}

export async function deleteFootprintEntryInCloud(input: { entryId: string; operationToken: string }): Promise<{ entryId: string; deletedAt: string } | FootprintFailure> {
  const raw = await call('deleteEntry', input)
  if (isFailure(raw)) return raw
  const item = raw as Record<string, unknown>
  if (!item || item.status !== 'DELETED' || typeof item.entryId !== 'string' || typeof item.deletedAt !== 'string') throw new FootprintCloudError('INVALID_RESPONSE', '删除足迹格式错误')
  return { entryId: item.entryId, deletedAt: item.deletedAt }
}

export async function acknowledgeFootprintHistoryInCloud(): Promise<boolean> {
  const raw = await call('acknowledgeHistoryNotice')
  return Boolean(raw && typeof raw === 'object' && (raw as Record<string, unknown>).status === 'ACKNOWLEDGED')
}

export async function prepareFootprintPhotoInCloud(): Promise<FootprintPhotoReservation> {
  const raw = await call('preparePhoto')
  if (isFailure(raw)) throw raw
  const item = raw as Record<string, unknown>
  if (!item || item.status !== 'UPLOAD_READY' || typeof item.resourceId !== 'string' || typeof item.cloudPath !== 'string') throw new FootprintCloudError('INVALID_RESPONSE', '照片上传准备失败')
  return { resourceId: item.resourceId, cloudPath: item.cloudPath }
}

export interface FootprintUploadProgress { reservation?: FootprintPhotoReservation; fileID?: string }

export async function uploadAndReviewFootprintPhoto(localPath: string, progress: FootprintUploadProgress = {}): Promise<FootprintPhoto> {
  // 草稿保留预约与上传结果，审核超时只重试审核，避免反复预约和重复文件。
  if (!progress.reservation) progress.reservation = await prepareFootprintPhotoInCloud()
  const prepared = progress.reservation
  if (!progress.fileID) progress.fileID = (await runtime().uploadFile({ cloudPath: prepared.cloudPath, filePath: localPath })).fileID
  const raw = await call('reviewPhoto', { resourceId: prepared.resourceId, fileID: progress.fileID })
  if (isFailure(raw)) throw raw
  const item = raw as Record<string, unknown>
  if (!item || item.status !== 'APPROVED' || typeof item.resourceId !== 'string' || typeof item.digest !== 'string') throw new FootprintCloudError('INVALID_RESPONSE', '照片审核失败')
  return { resourceId: item.resourceId, digest: item.digest }
}

export async function getFootprintPhotoUrlsInCloud(resourceIds: string[]): Promise<FootprintPhoto[]> {
  if (resourceIds.length === 0) return []
  // 每次最多六张，但整页封面必须全部处理，不能静默丢掉第七张以后。
  const ids = [...new Set(resourceIds)]
  const photos: FootprintPhoto[] = []
  for (let offset = 0; offset < ids.length; offset += 6) {
  const raw = await call('getPhotoUrls', { resourceIds: ids.slice(offset, offset + 6) })
  if (isFailure(raw)) throw raw
  const item = raw as Record<string, unknown>
  if (!item || item.status !== 'URLS_READY' || !Array.isArray(item.photos) || !item.photos.every(isFootprintPhoto)) throw new FootprintCloudError('INVALID_RESPONSE', '照片地址格式错误')
  photos.push(...item.photos)
  }
  return photos
}

/** 放弃草稿只释放未关联照片；离开页面的网络失败由到期清理兜底。 */
export async function abandonFootprintPhotosInCloud(resourceIds: string[]): Promise<void> {
  if (resourceIds.length) await call('abandonPhotos', { resourceIds: [...new Set(resourceIds)].slice(0, 6) })
}

export function humaniseFootprintError(error: unknown): string {
  if (error instanceof FootprintCloudError) return error.message
  if (error && typeof error === 'object' && 'errorMessage' in error) return String((error as { errorMessage: unknown }).errorMessage)
  return '暂时无法完成足迹操作，请稍后重试'
}
