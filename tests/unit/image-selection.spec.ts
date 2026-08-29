import { describeImageSelectionFailure, MAX_AVATAR_BYTES, validateLocalAvatar } from '../../src/utils/image-selection'
describe('avatar image selection', () => {
  it('accepts common image types within 5 MB', () => expect(validateLocalAvatar({ path: 'a.JPG', size: MAX_AVATAR_BYTES })).toEqual({ ok: true, mimeType: 'image/jpeg' }))
  it('rejects oversized, empty and disguised files', () => {
    expect(validateLocalAvatar({ path: 'a.png', size: MAX_AVATAR_BYTES + 1 })).toMatchObject({ ok: false })
    expect(validateLocalAvatar({ path: 'a.png', size: 0 })).toMatchObject({ ok: false })
    expect(validateLocalAvatar({ path: 'a.exe', size: 2 })).toMatchObject({ ok: false })
  })

  // 保护凭证和头像两个入口：用户取消保持安静，微信隐私配置缺失时必须给出可理解的中文反馈。
  it('describes media selection failures without treating cancellation as an error', () => {
    expect(describeImageSelectionFailure({ errMsg: 'chooseMedia:fail cancel' })).toBeNull()
    expect(describeImageSelectionFailure({ errMsg: 'chooseMedia:fail api scope is not declared in the privacy agreement' }))
      .toBe('图片功能尚未完成隐私声明，请联系管理员')
    expect(describeImageSelectionFailure(new Error('camera unavailable')))
      .toBe('打开相册或相机失败：camera unavailable')
  })
})
