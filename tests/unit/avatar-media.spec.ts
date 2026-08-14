declare function require(path: string): any
const { prepareAvatar, checkAvatar, validateAvatarReference, getAvatarUrl, MAX_BYTES } = require('../../cloudfunctions/household/avatar-media')

function fixtures() {
  const records = new Map<string, any>()
  const repository = {
    countRecent: jest.fn(async () => 0), countPending: jest.fn(async () => 0),
    create: jest.fn(async (r) => records.set(r._id, r)), get: jest.fn(async (id) => records.get(id)),
    update: jest.fn(async (id, data) => records.set(id, { ...records.get(id), ...data })),
    reserveSlot: jest.fn(async (ownerKey, purpose, createdAt, expiresAt) => {
      const resourceId = 'avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; records.set(resourceId, { _id: resourceId, ownerKey, purpose, state: 'prepared', createdAt, expiresAt, secret: 'secret' }); return { resourceId, secret: 'secret' }
    }),
    findHouseholdsByMemberKey: jest.fn(async () => [{ avatar: null, memberKeys: ['trusted'] }]), getUser: jest.fn(async () => null), isMemberProfileAvatar: jest.fn(async () => false),
  }
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('safe')])
  const storage = { download: jest.fn(async () => ({ fileContent: png })), upload: jest.fn(async () => ({})), remove: jest.fn(async () => ({})), tempUrl: jest.fn(async () => ({ fileList: [{ tempFileURL: 'https://temporary.test/a' }] })) }
  const deps = { identityKey: 'trusted', openId: 'openid', ownerHash: 'ownerhash', repository, storage, checkImage: jest.fn(async () => 'approved'), now: () => new Date(), since: () => new Date(0), expiry: () => new Date(Date.now() + 1000) }
  return { records, repository, storage, deps }
}

describe('secure avatar media', () => {
  it('binds purpose and owner then promotes approved bytes to a new digest path', async () => {
    const f = fixtures(); const ready = await prepareAvatar({ purpose: 'profile' }, f.deps); const approved = await checkAvatar({ resourceId: ready.resourceId }, f.deps)
    expect(f.records.get(ready.resourceId)).toMatchObject({ ownerKey: 'trusted', purpose: 'profile', state: 'approved', stagingPath: null })
    expect(approved.digest).toMatch(/^[a-f0-9]{64}$/); expect(f.storage.upload.mock.calls[0][0]).toContain(approved.digest.slice(0, 16)); expect(f.storage.remove).toHaveBeenCalled()
  })
  it('rejects unsafe, oversized and other-user media', async () => {
    const f = fixtures(); const ready = await prepareAvatar({ purpose: 'profile' }, f.deps); f.deps.checkImage.mockResolvedValueOnce('rejected')
    await expect(checkAvatar({ resourceId: ready.resourceId }, f.deps)).resolves.toMatchObject({ status: 'REJECTED' })
    f.records.get(ready.resourceId).ownerKey = 'other'; await expect(checkAvatar({ resourceId: ready.resourceId }, f.deps)).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' })
    f.records.get(ready.resourceId).ownerKey = 'trusted'; f.records.get(ready.resourceId).state = 'prepared'; f.storage.download.mockResolvedValueOnce({ fileContent: Buffer.alloc(MAX_BYTES + 1) })
    await expect(checkAvatar({ resourceId: ready.resourceId }, f.deps)).rejects.toMatchObject({ code: 'INVALID_MEDIA' })
  })
  it('validates approval, digest, owner and purpose before profile replacement', async () => {
    const f = fixtures(); f.records.set('avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', { _id: 'avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', ownerKey: 'trusted', purpose: 'profile', state: 'approved', digest: 'b'.repeat(64), formalPath: 'private/a' })
    const avatar = { kind: 'custom', resourceId: 'avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', digest: 'b'.repeat(64) }
    await expect(validateAvatarReference(avatar, 'profile', 'trusted', f.repository)).resolves.toEqual(avatar)
    await expect(validateAvatarReference(avatar, 'household', 'trusted', f.repository)).resolves.toBeNull()
    await expect(validateAvatarReference({ ...avatar, digest: 'c'.repeat(64) }, 'profile', 'trusted', f.repository)).resolves.toBeNull()
  })
  it('issues a temporary url only for a referenced member avatar', async () => {
    const f = fixtures(); const id = 'avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; f.records.set(id, { _id: id, state: 'approved', formalPath: 'private/a' })
    await expect(getAvatarUrl({ resourceId: id }, f.deps)).rejects.toMatchObject({ code: 'MEDIA_FORBIDDEN' })
    f.repository.getUser.mockResolvedValueOnce({ avatar: { resourceId: id } })
    await expect(getAvatarUrl({ resourceId: id }, f.deps)).resolves.toMatchObject({ status: 'URL_READY', url: 'https://temporary.test/a' })
  })
  it('enforces hourly and atomic upload slot limits', async () => {
    const f = fixtures(); f.repository.countRecent.mockResolvedValueOnce(12); await expect(prepareAvatar({ purpose: 'profile' }, f.deps)).rejects.toMatchObject({ code: 'RATE_LIMITED' })
    f.repository.reserveSlot.mockResolvedValueOnce(null); await expect(prepareAvatar({ purpose: 'profile' }, f.deps)).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' })
  })
})
export {}
