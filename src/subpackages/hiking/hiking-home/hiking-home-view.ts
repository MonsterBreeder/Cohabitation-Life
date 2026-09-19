import type { HikingEntrySummary, HikingTrackerState } from '../../../types/hiking'

/** 徒步列表缺失资料统一显示“暂无数据”，不以 0 或今天代替。 */
export function hikingDateText(entry: HikingEntrySummary): string {
  return entry.hikedAt || '暂无数据'
}
export function hikingPlaceText(entry: HikingEntrySummary): string {
  return entry.place?.name || '暂无数据'
}
export function hikingDistanceText(entry: HikingEntrySummary): string {
  return entry.metrics.distanceMeters == null
    ? '暂无数据'
    : `${(entry.metrics.distanceMeters / 1000).toFixed(1)} km`
}

/** 首页区分进行中草稿与已结束待保存草稿，避免把整理保存误写成继续定位。 */
export function hikingRecordingEntryText(state: HikingTrackerState | null): {
  kicker: string
  title: string
  note: string
  icon: string
} {
  if (state?.status === 'ended') {
    return {
      kicker: '有一条路线等待保存',
      title: '继续整理并保存',
      note: '记录已经结束，可以补充照片和感受',
      icon: 'edit',
    }
  }
  if (state) {
    return {
      kicker: '本机有未完成记录',
      title: '继续现场记录',
      note: '从上次中断处新开一段继续记录',
      icon: 'play-circle',
    }
  }
  return {
    kicker: '准备出发',
    title: '开始现场记录',
    note: '记录路线、距离和有效时长',
    icon: 'location',
  }
}
