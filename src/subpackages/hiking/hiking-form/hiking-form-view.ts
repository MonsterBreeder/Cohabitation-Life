// 徒步表单纯规则：页面、单元测试和云端入参换算共用同一套缺失值语义。
import type { HikingFormDraft, HikingPlace, HikingRoute } from '../../../types/hiking'
import { calculateHikingMetrics } from '../../../utils/hiking-route'

export function createEmptyHikingFormDraft(): HikingFormDraft {
  return {
    name: '',
    hikedAt: '',
    place: null,
    memory: '',
    manualDistanceKm: '',
    durationMinutes: '',
    route: null,
    routeFileName: '',
  }
}

export function normalizePositiveNumber(value: string, max: number): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : null
}

export function validateHikingForm(draft: HikingFormDraft): string | null {
  // 有路线时允许资料为空；无路线时必须靠名称和地点形成可识别的共同记录。
  if (!draft.name.trim() && !draft.route) return '请填写徒步名称，或先导入一条 KML 路线'
  if (!draft.route && !draft.place) return '无路线补录需要选择一个地点'
  if (draft.name.length > 50) return '徒步名称不能超过 50 个字'
  if (draft.memory.length > 300) return '感受不能超过 300 个字'
  if (draft.manualDistanceKm && normalizePositiveNumber(draft.manualDistanceKm, 1_000) == null)
    return '距离应在 0 到 1000 公里之间'
  if (draft.durationMinutes && normalizePositiveNumber(draft.durationMinutes, 100_000) == null)
    return '时长格式不正确'
  return null
}

export function hikingFormMetrics(draft: HikingFormDraft) {
  // KML 距离只从完整路线计算，手填距离不能覆盖路线成果。
  const distance = draft.route ? null : normalizePositiveNumber(draft.manualDistanceKm, 1_000)
  const duration = normalizePositiveNumber(draft.durationMinutes, 100_000)
  return calculateHikingMetrics(
    draft.route as HikingRoute | null,
    duration == null ? null : duration * 60,
    distance == null ? null : distance * 1000,
  )
}

export function placeFromChooseLocation(result: {
  name?: string
  address?: string
  latitude: number
  longitude: number
}): HikingPlace {
  return {
    name: result.name?.trim() || result.address?.trim() || '已选地点',
    address: result.address?.trim() || '',
    latitude: result.latitude,
    longitude: result.longitude,
  }
}
