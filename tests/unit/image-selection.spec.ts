import { MAX_AVATAR_BYTES, validateLocalAvatar } from '../../src/utils/image-selection'
describe('avatar image selection', () => {
  it('accepts common image types within 5 MB', () => expect(validateLocalAvatar({ path: 'a.JPG', size: MAX_AVATAR_BYTES })).toEqual({ ok: true, mimeType: 'image/jpeg' }))
  it('rejects oversized, empty and disguised files', () => {
    expect(validateLocalAvatar({ path: 'a.png', size: MAX_AVATAR_BYTES + 1 })).toMatchObject({ ok: false })
    expect(validateLocalAvatar({ path: 'a.png', size: 0 })).toMatchObject({ ok: false })
    expect(validateLocalAvatar({ path: 'a.exe', size: 2 })).toMatchObject({ ok: false })
  })
})
