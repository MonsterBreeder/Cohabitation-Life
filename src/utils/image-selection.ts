export const MAX_AVATAR_BYTES = 5 * 1024 * 1024
export const AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export interface LocalImageCandidate { path: string; size: number; mimeType?: string; name?: string }

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
