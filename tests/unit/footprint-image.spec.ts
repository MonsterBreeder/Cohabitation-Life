import {
  calculatePrivateImageSize,
  PRIVATE_PHOTO_LONG_EDGE,
  validatePrivatePhotoCount,
  reencodePrivatePhoto,
} from '../../src/utils/private-photo'

describe('footprint image helpers', () => {
  it('keeps small photos at their original dimensions', () => {
    expect(calculatePrivateImageSize(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('scales landscape and portrait photos to the configured long edge', () => {
    expect(calculatePrivateImageSize(4000, 2000)).toEqual({ width: PRIVATE_PHOTO_LONG_EDGE, height: 800 })
    expect(calculatePrivateImageSize(1000, 3000)).toEqual({ width: 533, height: PRIVATE_PHOTO_LONG_EDGE })
  })

  it('rejects invalid dimensions', () => {
    expect(calculatePrivateImageSize(0, 100)).toBeNull()
    expect(calculatePrivateImageSize(Number.NaN, 100)).toBeNull()
  })

  it('enforces the three-photo limit', () => {
    expect(validatePrivatePhotoCount(0, 3)).toBe(true)
    expect(validatePrivatePhotoCount(2, 2)).toBe(false)
    expect(validatePrivatePhotoCount(3, 1)).toBe(false)
  })

  // 验证实际重绘/导出调用链，确保不再调用离屏画布不存在的 toDataURL。
  it('redraws on a real canvas and exports a bounded JPEG temp file', async () => {
    const scope = globalThis as any
    const previousUni = scope.uni
    const previousWx = scope.wx
    const context = { fillStyle: '', fillRect: jest.fn(), drawImage: jest.fn() }
    const canvas: any = {
      getContext: () => context,
      createImage: () => {
        const image: any = {}
        Object.defineProperty(image, 'src', { set: () => queueMicrotask(() => image.onload()) })
        return image
      },
    }
    const exportImage = jest.fn((options: any) => options.success({ tempFilePath: 'wxfile://processed.jpg' }))
    scope.uni = {
      getImageInfo: ({ success }: any) =>
        success({ width: 4000, height: 2000, path: 'wxfile://original.jpg' }),
    }
    scope.wx = {
      canvasToTempFilePath: exportImage,
      getFileSystemManager: () => ({ getFileInfo: ({ success }: any) => success({ size: 1000 }) }),
    }
    try {
      expect(await reencodePrivatePhoto('wxfile://original.jpg', canvas)).toBe('wxfile://processed.jpg')
      expect(canvas.width).toBe(1600)
      expect(canvas.height).toBe(800)
      expect(context.drawImage).toHaveBeenCalledTimes(1)
      expect(exportImage).toHaveBeenCalledWith(
        expect.objectContaining({ fileType: 'jpg', quality: 0.82, canvas }),
      )
    } finally {
      scope.uni = previousUni
      scope.wx = previousWx
    }
  })
})
