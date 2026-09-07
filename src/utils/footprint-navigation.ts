import type { FootprintPlace } from '../types/footprint'
import { normaliseFootprintPlace } from './footprint-location'

export type FootprintNavigationResult = { ok: true } | { ok: false; message: string | null }

/** 只打开用户指定的地点；成功仅表示地图调用完成，不能据此保存足迹或判断到达。 */
export async function openFootprintNavigation(value: FootprintPlace): Promise<FootprintNavigationResult> {
  // 不把缺失坐标转换为零点，避免旧数据异常时导航到错误目的地。
  const place = value && typeof value.latitude === 'number' && typeof value.longitude === 'number'
    ? normaliseFootprintPlace(value) : null
  if (!place) return { ok: false, message: '这个地点的信息不完整，请重新选择地点' }
  try {
    return await new Promise<FootprintNavigationResult>((resolve, reject) => {
      uni.openLocation({
        ...place,
        scale: 16,
        success: () => resolve({ ok: true }),
        fail: reject,
      })
    })
  } catch (error) {
    const message = typeof error === 'object' && error !== null && 'errMsg' in error ? String(error.errMsg) : ''
    // 退出地图属于正常操作；其他故障保留原页面供用户再次点击，不自动重试。
    return { ok: false, message: /cancel/i.test(message) ? null : '暂时无法打开导航，请稍后重试；也可以在手机微信中尝试' }
  }
}
