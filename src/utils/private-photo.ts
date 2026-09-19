/** 共同生活照片必须重新编码，不能在失败时退回上传可能携带定位信息的原图。 */
export const PRIVATE_PHOTO_MAX_COUNT = 3
export const PRIVATE_PHOTO_MAX_BYTES = 3 * 1024 * 1024
export const PRIVATE_PHOTO_LONG_EDGE = 1600
export const PRIVATE_PHOTO_QUALITY = 0.82

export function calculatePrivateImageSize(
  width: number,
  height: number,
): { width: number; height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const scale = Math.min(1, PRIVATE_PHOTO_LONG_EDGE / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function validatePrivatePhotoCount(currentCount: number, selectedCount: number): boolean {
  return (
    Number.isInteger(currentCount) &&
    Number.isInteger(selectedCount) &&
    currentCount >= 0 &&
    selectedCount > 0 &&
    currentCount + selectedCount <= PRIVATE_PHOTO_MAX_COUNT
  )
}

interface ImageInfo {
  width: number
  height: number
  path: string
}

function getImageInfo(src: string): Promise<ImageInfo> {
  return new Promise((resolve, reject) => {
    uni.getImageInfo({ src, success: (result) => resolve(result), fail: reject })
  })
}

/**
 * 使用微信 2D 画布重新绘制为 JPEG，移除 GPS、设备型号和拍摄时间等原文件信息。
 * 当前基础库不支持安全重编码时直接失败，绝不回退上传原文件。
 */
export async function reencodePrivatePhoto(sourcePath: string, canvas: any): Promise<string> {
  const wxApi = (globalThis as typeof globalThis & { wx?: any }).wx
  if (!sourcePath || !canvas?.createImage || !wxApi?.canvasToTempFilePath || !wxApi?.getFileSystemManager) {
    throw new Error('当前微信版本暂不支持安全处理照片，请升级微信后重试')
  }
  const info = await getImageInfo(sourcePath)
  const target = calculatePrivateImageSize(info.width, info.height)
  if (!target) throw new Error('无法读取这张照片')
  // 使用真实 Canvas 节点；OffscreenCanvas 没有官方保证的导出能力。
  canvas.width = target.width
  canvas.height = target.height
  const context = canvas.getContext('2d')
  const image = canvas.createImage()
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('照片读取超时，请重新选择')), 15_000)
    image.onload = () => {
      clearTimeout(timer)
      resolve()
    }
    image.onerror = () => {
      clearTimeout(timer)
      reject(new Error('无法处理这张照片'))
    }
    image.src = info.path || sourcePath
  })
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, target.width, target.height)
  context.drawImage(image, 0, 0, target.width, target.height)
  const outputPath = await new Promise<string>((resolve, reject) => {
    wxApi.canvasToTempFilePath({
      canvas,
      fileType: 'jpg',
      quality: PRIVATE_PHOTO_QUALITY,
      destWidth: target.width,
      destHeight: target.height,
      success: (result: { tempFilePath: string }) => resolve(result.tempFilePath),
      fail: () => reject(new Error('照片处理失败，请重新选择')),
    })
  })
  const stat = await new Promise<{ size: number }>((resolve, reject) => {
    wxApi.getFileSystemManager().getFileInfo({ filePath: outputPath, success: resolve, fail: reject })
  })
  if (!Number.isFinite(stat.size) || stat.size <= 0 || stat.size > PRIVATE_PHOTO_MAX_BYTES) {
    wxApi.getFileSystemManager().unlink({ filePath: outputPath, fail: () => undefined })
    throw new Error('处理后的照片仍然过大，请换一张照片')
  }
  return outputPath
}
