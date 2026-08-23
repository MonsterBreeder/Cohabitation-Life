// 凭证图云存储上传工具（PRD 008）。
// 模式：客户端预压缩 → 调 wx.cloud.uploadFile → 返回 fileID。
// 仅在 ledger-add 页用：先在本地选择 → 压缩 → 上传 → 拿 fileID → 提交账目时附在 receiptMediaId。

interface UploadResult {
  fileID: string
  /** 上传耗时（毫秒） */
  durationMs: number
}

interface UploadError extends Error {
  code: 'NO_CLOUD' | 'COMPRESS_FAILED' | 'UPLOAD_FAILED' | 'INVALID_PATH'
}

/** 压缩参数。1080p 长边 + 80% 质量。 */
const COMPRESS_TARGET_LONG_EDGE = 1080
const COMPRESS_QUALITY = 80

/** 上传凭证图。本地路径 → fileID。 */
export function uploadReceipt(input: { householdId: string; entryTempId: string; localPath: string }): Promise<UploadResult> {
  if (!input || !input.localPath || !input.householdId || !input.entryTempId) {
    const err: UploadError = new Error('上传参数不完整') as UploadError
    err.code = 'INVALID_PATH'
    return Promise.reject(err)
  }
  const wxApi = (globalThis as any).wx
  if (!wxApi || !wxApi.cloud || typeof wxApi.cloud.uploadFile !== 'function') {
    const err: UploadError = new Error('当前环境暂不支持云存储') as UploadError
    err.code = 'NO_CLOUD'
    return Promise.reject(err)
  }
  return new Promise<UploadResult>((resolve, reject) => {
    const started = Date.now()
    // 客户端预压缩（如有 uni.compressImage）
    const tryCompress = (path: string): Promise<string> => {
      return new Promise<string>((resolveCompress) => {
        if (typeof uni !== 'undefined' && typeof (uni as any).compressImage === 'function') {
          ;(uni as any).compressImage({
            src: path,
            quality: COMPRESS_QUALITY,
            compressedWidth: COMPRESS_TARGET_LONG_EDGE,
            compressedHeight: COMPRESS_TARGET_LONG_EDGE,
            success: (res: any) => resolveCompress((res && res.tempFilePath) || path),
            fail: () => resolveCompress(path), // 压缩失败就传原图
          })
        } else {
          resolveCompress(path)
        }
      })
    }
    tryCompress(input.localPath)
      .then((finalPath) => {
        const cloudPath = `receipts/${input.householdId}/${input.entryTempId}.jpg`
        wxApi.cloud.uploadFile({
          cloudPath,
          filePath: finalPath,
          success: (res: any) => {
            if (!res || !res.fileID) {
              const err: UploadError = new Error('上传失败：未返回 fileID') as UploadError
              err.code = 'UPLOAD_FAILED'
              reject(err)
              return
            }
            resolve({ fileID: res.fileID, durationMs: Date.now() - started })
          },
          fail: (err: any) => {
            const wrapped: UploadError = new Error((err && err.errMsg) || '上传失败') as UploadError
            wrapped.code = 'UPLOAD_FAILED'
            reject(wrapped)
          },
        })
      })
      .catch(() => {
        const err: UploadError = new Error('压缩失败') as UploadError
        err.code = 'COMPRESS_FAILED'
        reject(err)
      })
  })
}

/** 删除云存储文件。失败不影响业务流（账目删除是单独的 cron 流程）。 */
export function deleteReceiptFile(fileID: string): Promise<void> {
  const wxApi = (globalThis as any).wx
  if (!wxApi || !wxApi.cloud || typeof wxApi.cloud.deleteFile !== 'function') {
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    wxApi.cloud.deleteFile({
      fileList: [fileID],
      success: () => resolve(),
      fail: () => resolve(), // best-effort
    })
  })
}

/** 生成上传用的临时 entryId（save 之前的占位 id）。 */
export function generateReceiptTempId(): string {
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
