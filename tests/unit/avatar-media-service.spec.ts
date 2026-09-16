import { describeAvatarCloudError, uploadAvatar, getAvatarTemporaryUrl, releaseAvatarSlots } from '../../src/services/avatar-media'

// 保护头像云函数错误状态码被翻译成具体中文文案，避免再退回到统一的
// "暂时无法准备头像上传"——上次的盲盒文案让用户和开发者都看不到真实原因（RATE_LIMITED
// / RESOURCE_LIMIT / TEMPORARY_FAILURE 等），无法判断是清理残留、限流还是网络问题。
describe('avatar cloud error 描述', () => {
  it.each([
    ['RATE_LIMITED', '最近尝试次数过多'],
    ['RESOURCE_LIMIT', '头像上传占位已满'],
    ['INVALID_REQUEST', '头像参数不正确'],
    ['INVALID_MEDIA', '这张图片无法识别'],
    ['MEDIA_NOT_FOUND', '头像已被清理'],
    ['MEDIA_FORBIDDEN', '当前头像无法访问'],
    ['NO_HOME', '请先加入一个家庭'],
    ['REJECTED', '这张图片未通过安全检查'],
    ['TEMPORARY_FAILURE', '云端暂时无法处理'],
  ])('%s 翻译成具体提示而非通用文案', (status, expectedFragment) => {
    expect(describeAvatarCloudError(status)).toContain(expectedFragment)
  })

  it('未知状态落到兜底文案而不是抛错', () => {
    expect(describeAvatarCloudError('SOMETHING_NEW')).toBe('头像服务暂时不可用，请稍后再试')
    expect(describeAvatarCloudError(undefined)).toBe('头像服务暂时不可用，请稍后再试')
  })
})

// 验证 uploadAvatar 在 prepareAvatar / checkAvatar 返回非期望状态时把真实 status
// 通过 Error.message 透传出去，不再吞成 "暂时无法准备头像上传"。
describe('uploadAvatar 透传云函数 status', () => {
  function installCloudMock(overrides: { prepare?: unknown; uploadFile?: unknown; check?: unknown }): void {
    const preparedHandler = jest.fn(async (options: { data: Record<string, unknown> }) => {
      const action = options.data && options.data.action
      if (action === 'prepareAvatar') return { result: overrides.prepare ?? { status: 'UPLOAD_READY', resourceId: 'avatar_' + 'a'.repeat(32), cloudPath: 'staging/x.png' } }
      if (action === 'checkAvatar') return { result: overrides.check ?? { status: 'APPROVED', digest: 'd'.repeat(64) } }
      return { result: { status: 'URL_READY', url: 'https://t/x' } }
    })
    const uploadFile = jest.fn(async () => overrides.uploadFile ?? { fileID: 'cloud://bucket/staging/x.png' })
    const runtime = globalThis as typeof globalThis & { wx?: { cloud: unknown } }
    const original = runtime.wx
    runtime.wx = { cloud: { init: jest.fn(), callFunction: preparedHandler, uploadFile } }
    return () => { runtime.wx = original }
  }

  beforeEach(() => {
    // 让 hasCloudEnvironment 返回 true
    jest.resetModules()
  })

  it('prepareAvatar 返回 RATE_LIMITED 时抛带具体原因的错误', async () => {
    const restore = installCloudMock({ prepare: { status: 'RATE_LIMITED', retryable: true } })
    await expect(uploadAvatar('local://a.png', 'profile')).rejects.toThrow('最近尝试次数过多')
    restore()
  })

  it('prepareAvatar 首次返回 RESOURCE_LIMIT 时自动释放占位并完成上传', async () => {
    const runtime = globalThis as typeof globalThis & { wx?: { cloud: unknown } }
    const original = runtime.wx
    const actions: string[] = []
    let prepareCount = 0
    runtime.wx = {
      cloud: {
        init: jest.fn(),
        callFunction: jest.fn(async (options: { data: Record<string, unknown> }) => {
          const action = String(options.data.action)
          actions.push(action)
          if (action === 'prepareAvatar') {
            prepareCount += 1
            if (prepareCount === 1) return { result: { status: 'RESOURCE_LIMIT', retryable: true } }
            return { result: { status: 'UPLOAD_READY', resourceId: 'avatar_' + 'a'.repeat(32), cloudPath: 'staging/x.png' } }
          }
          if (action === 'releaseAvatarSlots') return { result: { status: 'RELEASED', releasedSlots: 3, releasedPending: 2 } }
          if (action === 'checkAvatar') return { result: { status: 'APPROVED', digest: 'd'.repeat(64) } }
          return { result: { status: 'INVALID_REQUEST' } }
        }),
        uploadFile: jest.fn(async () => ({ fileID: 'cloud://bucket/staging/x.png' })),
      },
    }

    await expect(uploadAvatar('local://a.png', 'profile')).resolves.toEqual({
      kind: 'custom',
      resourceId: 'avatar_' + 'a'.repeat(32),
      digest: 'd'.repeat(64),
    })
    expect(actions).toEqual(['prepareAvatar', 'releaseAvatarSlots', 'prepareAvatar', 'checkAvatar'])
    runtime.wx = original
  })

  it('checkAvatar 返回 REJECTED 时抛带具体原因的错误', async () => {
    const restore = installCloudMock({ check: { status: 'REJECTED', retryable: false } })
    await expect(uploadAvatar('local://a.png', 'profile')).rejects.toThrow('这张图片未通过安全检查')
    restore()
  })

  it('checkAvatar 返回 TEMPORARY_FAILURE 时抛带具体原因的错误', async () => {
    const restore = installCloudMock({ check: { status: 'TEMPORARY_FAILURE', retryable: true } })
    await expect(uploadAvatar('local://a.png', 'profile')).rejects.toThrow('云端暂时无法处理')
    restore()
  })

  it('getAvatarTemporaryUrl 返回 MEDIA_NOT_FOUND 时抛带具体原因的错误', async () => {
    const restore = installCloudMock()
    // 覆盖 prepareAvatar 之外的调用：直接调 getAvatarTemporaryUrl 走 getAvatarUrl action
    const runtime = globalThis as typeof globalThis & { wx?: { cloud: { callFunction: jest.Mock } } }
    const original = runtime.wx
    runtime.wx = {
      cloud: {
        init: jest.fn(),
        callFunction: jest.fn(async () => ({ result: { status: 'MEDIA_NOT_FOUND', retryable: false } })),
        uploadFile: jest.fn(),
      },
    }
    await expect(getAvatarTemporaryUrl('avatar_' + 'a'.repeat(32))).rejects.toThrow('头像已被清理')
    runtime.wx = original
    restore()
  })

  it('uploadAvatar 抛出的 Error 附带 status 字段（不靠解析中文文案）', async () => {
    const restore = installCloudMock({ prepare: { status: 'RATE_LIMITED', retryable: true } })
    try {
      await uploadAvatar('local://a.png', 'profile')
      throw new Error('should not reach')
    } catch (error) {
      expect((error as Error & { status?: string }).status).toBe('RATE_LIMITED')
    }
    restore()
  })
})

describe('releaseAvatarSlots', () => {
  function installReleaseMock(result: unknown): () => void {
    const runtime = globalThis as typeof globalThis & { wx?: { cloud: unknown } }
    const original = runtime.wx
    runtime.wx = {
      cloud: {
        init: jest.fn(),
        callFunction: jest.fn(async () => ({ result })),
        uploadFile: jest.fn(),
      },
    }
    return () => { runtime.wx = original }
  }

  it('RELEASED 时返回释放数量', async () => {
    const restore = installReleaseMock({ status: 'RELEASED', retryable: false, releasedSlots: 3, releasedPending: 2 })
    await expect(releaseAvatarSlots()).resolves.toEqual({ releasedSlots: 3, releasedPending: 2 })
    restore()
  })

  it('返回非 RELEASED 时抛带 status 的错误', async () => {
    const restore = installReleaseMock({ status: 'TEMPORARY_FAILURE', retryable: true })
    try {
      await releaseAvatarSlots()
      throw new Error('should not reach')
    } catch (error) {
      expect((error as Error).message).toContain('云端暂时无法处理')
      expect((error as Error & { status?: string }).status).toBe('TEMPORARY_FAILURE')
    }
    restore()
  })
})

// cloudEnvironmentId 是 module-level 常量；要在 hasCloudEnvironment() 返回 true 的
// 前提下测 mock 行为，需要测试 setup 通过 module.resetModules 重新求值 src/config/cloud。
// 但 cloudEnvironmentId 来自 cloud.ts，常量字符串 'cloud1-d6gzpujfy221ba36d' 已经在
// 仓库里 hard-coded，因此 hasCloudEnvironment() 自然返回 true；不需要 mock 这一层。
// 上述测试只要 mock globalThis.wx.cloud 即可覆盖完整路径。
