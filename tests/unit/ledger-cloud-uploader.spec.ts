import { generateReceiptTempId, uploadReceipt } from '../../src/components/ledger/ledger-cloud-uploader'

describe('uploadReceipt', () => {
  it('rejects when wx.cloud is unavailable', async () => {
    // 移除可能存在的 global wx
    const originalWx = (globalThis as any).wx
    delete (globalThis as any).wx
    try {
      await expect(uploadReceipt({ householdId: 'home_xxxxxxxx', entryTempId: 'temp_xxx', localPath: '/tmp/x.jpg' })).rejects.toMatchObject({ code: 'NO_CLOUD' })
    } finally {
      ;(globalThis as any).wx = originalWx
    }
  })

  it('rejects when params incomplete', async () => {
    await expect(uploadReceipt({ householdId: '', entryTempId: 'temp_xxx', localPath: '' })).rejects.toMatchObject({ code: 'INVALID_PATH' })
  })

  it('uploads via wx.cloud.uploadFile when available', async () => {
    const mockWx = {
      cloud: {
        uploadFile: jest.fn((opts: any) => {
          setTimeout(() => opts.success && opts.success({ fileID: 'cloud://test/fileID_xxx' }), 0)
          return undefined
        }),
      },
    }
    ;(globalThis as any).wx = mockWx
    const result = await uploadReceipt({ householdId: 'home_xxxxxxxx', entryTempId: 'temp_xxx', localPath: '/tmp/x.jpg' })
    expect(result.fileID).toBe('cloud://test/fileID_xxx')
    expect(mockWx.cloud.uploadFile).toHaveBeenCalled()
  })
})

describe('generateReceiptTempId', () => {
  it('returns string starting with temp_', () => {
    const id = generateReceiptTempId()
    expect(id).toMatch(/^temp_/)
    expect(id.length).toBeGreaterThan(10)
  })
})
