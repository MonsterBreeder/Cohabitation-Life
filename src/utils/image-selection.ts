export const MAX_AVATAR_BYTES = 5 * 1024 * 1024
export const AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface LocalImageCandidate { path: string; size: number; mimeType?: string; name?: string }

/**
 * 把微信图片选择失败统一转成用户可理解的反馈。
 * 用户主动取消时返回 null；隐私声明缺失时不继续展示英文平台错误。
 */
export function describeImageSelectionFailure(error: unknown): string | null {
  const errMsg = (typeof error === 'object' && error !== null && 'errMsg' in error)
    ? String((error as { errMsg: unknown }).errMsg)
    : (error instanceof Error ? error.message : '')

  if (errMsg && /cancel/i.test(errMsg)) return null
  if (/api scope is not declared in the privacy agreement/i.test(errMsg)) {
    return '图片功能尚未完成隐私声明，请联系管理员'
  }

  const detail = errMsg.replace(/^choose(?:Media|Image):fail\s*/i, '').trim()
  return detail ? `打开相册或相机失败：${detail}` : '打开相册或相机失败，请稍后重试'
}

export function inferImageMimeType(candidate: Pick<LocalImageCandidate, 'mimeType' | 'name' | 'path'>): string | undefined {
  const declared = candidate.mimeType?.toLowerCase()
  if (declared && AVATAR_MIME_TYPES.has(declared)) return declared
  const value = (candidate.name || candidate.path).split('?')[0].toLowerCase()
  if (/\.jpe?g$/.test(value)) return 'image/jpeg'
  if (/\.png$/.test(value)) return 'image/png'
  if (/\.webp$/.test(value)) return 'image/webp'
  return undefined
}

export function validateLocalAvatar(candidate: LocalImageCandidate): { ok: true; mimeType: string } | { ok: false; message: string } {
  if (!Number.isFinite(candidate.size) || candidate.size <= 0) return { ok: false, message: '无法读取这张图片' }
  if (candidate.size > MAX_AVATAR_BYTES) return { ok: false, message: '请选择不超过 5 MB 的图片' }
  const mimeType = inferImageMimeType(candidate)
  if (!mimeType) return { ok: false, message: '请选择 JPG、PNG 或 WebP 图片' }
  return { ok: true, mimeType }
}
