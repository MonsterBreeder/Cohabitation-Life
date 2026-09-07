/** 家庭足迹的共享类型。页面只接收展示所需字段，不接触云端内部成员编号。 */
export interface FootprintPlace {
  name: string
  address: string
  latitude: number
  longitude: number
}

export interface FootprintPhoto {
  resourceId: string
  digest: string
  url?: string
}

export interface FootprintCreatorDisplay {
  nickname: string
  avatar: { kind: 'builtin'; id: string } | { kind: 'custom'; resourceId: string; digest: string }
  isSelf: boolean
  hasLeft?: boolean
}

export interface FootprintEntrySummary {
  id: string
  placeKey: string
  place: FootprintPlace
  visitedAt: string
  memory: string
  coverPhoto: FootprintPhoto | null
  createdAt: string
  updatedAt: string
  editVersion: number
}

export interface FootprintEntryDetail extends FootprintEntrySummary {
  photos: FootprintPhoto[]
  creator: FootprintCreatorDisplay
  samePlaceCount: number
}

export interface FootprintPlaceSummary {
  placeKey: string
  place: FootprintPlace
  visitCount: number
  latestEntry: FootprintEntrySummary
}

export interface FootprintHomeSummary {
  placeCount: number
  latestEntry: FootprintEntrySummary | null
}

export interface FootprintOverview {
  summary: FootprintHomeSummary
  places: FootprintPlaceSummary[]
  entries: FootprintEntrySummary[]
  entriesCursor: string | null
  placesCursor: string | null
  showPreJoinHistoryNotice: boolean
}

export interface FootprintDraft {
  entryId?: string
  place: FootprintPlace | null
  visitedAt: string
  memory: string
  photos: FootprintPhoto[]
  editVersion?: number
}

export type FootprintFailureStatus =
  | 'NO_HOME'
  | 'FOOTPRINT_NOT_FOUND'
  | 'FOOTPRINT_CONFLICT'
  | 'FOOTPRINT_INVALID'
  | 'FOOTPRINT_FORBIDDEN'
  | 'FOOTPRINT_MEDIA_INVALID'
  | 'FOOTPRINT_MEDIA_REJECTED'
  | 'FOOTPRINT_CONTENT_REJECTED'
  | 'FOOTPRINT_RATE_LIMITED'
  | 'TEMPORARY_FAILURE'

export interface FootprintFailure {
  status: FootprintFailureStatus
  retryable: boolean
  errorMessage: string
}

export interface FootprintPhotoReservation {
  resourceId: string
  cloudPath: string
}

export interface FootprintPhotoUploadResult extends FootprintPhotoReservation {
  digest: string
}
