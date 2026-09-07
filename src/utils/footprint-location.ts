import type { FootprintPlace } from '../types/footprint'

export type FootprintLocationFailure = 'cancelled' | 'denied' | 'privacy' | 'unavailable'

export interface FootprintLocationResult {
  ok: true
  place: FootprintPlace
}
export interface FootprintLocationError {
  ok: false
  reason: FootprintLocationFailure
  message: string | null
}

/** 微信位置选择结果只保留足迹所需字段，非法坐标不能进入草稿。 */
export function normaliseFootprintPlace(value: unknown): FootprintPlace | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const name = typeof record.name === 'string' ? record.name.trim() : ''
  const address = typeof record.address === 'string' ? record.address.trim() : ''
  const latitude = Number(record.latitude)
  const longitude = Number(record.longitude)
  if (!name || name.length > 100 || address.length > 200) return null
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null
  return { name, address, latitude, longitude }
}

/** 区分用户取消、授权拒绝和平台故障，避免取消也弹错误提示。 */
export function describeFootprintLocationFailure(error: unknown): FootprintLocationError {
  const errMsg = typeof error === 'object' && error !== null && 'errMsg' in error
    ? String((error as { errMsg: unknown }).errMsg)
    : error instanceof Error ? error.message : ''
  if (/cancel/i.test(errMsg)) return { ok: false, reason: 'cancelled', message: null }
  if (/privacy|scope is not declared/i.test(errMsg)) {
    return { ok: false, reason: 'privacy', message: '位置功能尚未完成隐私声明，请联系管理员' }
  }
  if (/auth deny|authorize|permission|denied/i.test(errMsg)) {
    return { ok: false, reason: 'denied', message: '需要位置权限才能选择地点，你可以在设置中重新开启' }
  }
  return { ok: false, reason: 'unavailable', message: '暂时无法选择地点，请稍后重试' }
}

/** 只有用户主动点击按钮后才调用此方法；页面加载阶段禁止调用。 */
export function chooseFootprintLocation(): Promise<FootprintLocationResult | FootprintLocationError> {
  return new Promise((resolve) => {
    uni.chooseLocation({
      success: (result) => {
        const place = normaliseFootprintPlace(result)
        resolve(place
          ? { ok: true, place }
          : { ok: false, reason: 'unavailable', message: '没有取得有效地点，请重新选择' })
      },
      fail: (error) => resolve(describeFootprintLocationFailure(error)),
    })
  })
}

/** 权限拒绝后由用户主动点“打开设置”，不会在再次进入页面时自动触发。 */
export function openFootprintLocationSetting(): Promise<boolean> {
  return new Promise((resolve) => {
    uni.openSetting({ success: (result) => resolve(Boolean(result.authSetting['scope.userLocation'])), fail: () => resolve(false) })
  })
}
