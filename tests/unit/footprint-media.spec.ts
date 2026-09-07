const { detectJpeg, isPrivateJpeg, preparePhoto, reviewPhoto, MAX_BYTES } = require('../../cloudfunctions/footprint/footprint-media')

// 8×8 白色 JPEG，测试真实段结构，而不是只有文件头的伪照片。
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAf/AABEIAAgACAMBEQACEQEDEQH/xAGiAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgsQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+gEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoLEQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AP7+KAP/2Q==', 'base64')

function fixture() {
  let record: any
  const storage = { resolveFileID: async (path: string) => `cloud://test/${path}`, download: jest.fn(async () => ({ fileContent: jpeg })), upload: jest.fn(async (path: string) => ({ fileID: `cloud://test/${path}` })), remove: jest.fn() }
  const repository = {
    findHouseholdByMember: async () => ({ _id: 'home_a' }),
    reserveMedia: async (value: any) => { record = value },
    getMedia: async () => record,
    claimMediaReview: async () => {
      if (record.state === 'approved') return { ...record }
      record.state = 'reviewing'; record.reviewLease = 'lease'; return { ...record }
    },
    finishMediaReview: async (_id: string, lease: string, data: any) => {
      if (record.state !== 'reviewing' || record.reviewLease !== lease) throw new Error('租约已结束')
      Object.assign(record, data)
    },
  }
  const dependencies = { repository, storage, identityKey: 'user_a', ownerHash: 'owner', now: () => new Date('2026-09-03T00:00:00Z'), expiry: () => new Date('2026-09-03T02:00:00Z'), checkImage: jest.fn(async () => true), openId: 'openid' }
  return { dependencies, storage, record: () => record }
}

describe('footprint media validation', () => {
  it('accepts a complete JPEG signature', () => {
    expect(detectJpeg(Buffer.from([0xff, 0xd8, 0x00, 0xff, 0xd9]))).toBe(true)
  })

  it('rejects non-JPEG and truncated content', () => {
    expect(detectJpeg(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false)
    expect(detectJpeg(Buffer.from([0xff, 0xd8]))).toBe(false)
  })

  it('keeps the cloud limit at three megabytes', () => {
    expect(MAX_BYTES).toBe(3 * 1024 * 1024)
  })

  it('rejects EXIF metadata even when the JPEG signature is valid', () => {
    expect(isPrivateJpeg(jpeg)).toBe(true)
    const withExif = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([0xff, 0xe1, 0, 8]), Buffer.from('Exif\0\0'), jpeg.subarray(2)])
    expect(isPrivateJpeg(withExif)).toBe(false)
  })

  it('tracks both file IDs before upload and reuses approved review results', async () => {
    const f = fixture()
    const ready = await preparePhoto({}, f.dependencies)
    expect(f.record().stagingFileID).toContain(ready.cloudPath)
    expect(f.record().formalFileID).toContain('footprint-private/')
    const input = { resourceId: ready.resourceId, fileID: f.record().stagingFileID }
    const first = await reviewPhoto(input, f.dependencies)
    const repeated = await reviewPhoto(input, f.dependencies)
    expect(repeated).toEqual(first)
    expect(f.storage.upload).toHaveBeenCalledTimes(1)
    expect(f.storage.remove).not.toHaveBeenCalled()
  })

  it('leaves rejected photos unavailable rather than returning them to prepared state', async () => {
    const f = fixture()
    f.dependencies.checkImage.mockResolvedValue(false)
    const ready = await preparePhoto({}, f.dependencies)
    await expect(reviewPhoto({ resourceId: ready.resourceId, fileID: f.record().stagingFileID }, f.dependencies)).rejects.toMatchObject({ code: 'FOOTPRINT_MEDIA_REJECTED' })
    expect(f.record().state).toBe('rejected')
    expect(f.storage.upload).not.toHaveBeenCalled()
  })
})
