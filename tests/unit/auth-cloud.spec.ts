import {
  AuthCloudError,
  initializeAuthCloud,
  resetAuthCloudForTesting,
  resolveLoginInCloud,
  setAuthCloudEnvironmentForTesting,
  setAuthCloudRuntimeForTesting,
  setAuthCloudTimeoutForTesting,
} from '../../src/services/auth-cloud'

// 保护微信云端封装在配置缺失、异常和超时时回到可重试状态。
describe('auth cloud service', () => {
  const init = jest.fn()
  const callFunction = jest.fn()

  beforeEach(() => {
    resetAuthCloudForTesting()
    init.mockReset()
    callFunction.mockReset()
  })

  afterEach(() => {
    resetAuthCloudForTesting()
  })

  function useCloud(result: unknown = { status: 'HOME', retryable: false }): void {
    setAuthCloudEnvironmentForTesting('test-env')
    setAuthCloudRuntimeForTesting({
      cloud: {
        init,
        callFunction: callFunction.mockResolvedValue({ result }),
      },
    })
  }

  it('reports a missing cloud environment', () => {
    setAuthCloudEnvironmentForTesting('')
    expect(() => initializeAuthCloud()).toThrow(new AuthCloudError('CONFIGURATION', '尚未配置微信云开发测试环境'))
  })

  it('reports an unsupported platform', () => {
    setAuthCloudEnvironmentForTesting('test-env')

    expect(() => initializeAuthCloud()).toThrow(new AuthCloudError('PLATFORM_UNSUPPORTED', '当前环境暂不支持微信云开发'))
  })

  it('rejects an invalid cloud result', async () => {
    useCloud({ status: 'UNKNOWN', retryable: false })

    await expect(resolveLoginInCloud({ intent: 'login' })).rejects.toMatchObject({ code: 'TEMPORARY_FAILURE' })
  })

  it('converts cloud call errors into a temporary failure', async () => {
    useCloud()
    callFunction.mockRejectedValueOnce({ errMsg: 'cloud.callFunction:fail env check invalid' })

    await expect(resolveLoginInCloud({ intent: 'login' })).rejects.toMatchObject({
      code: 'TEMPORARY_FAILURE',
      message: '云端调用失败：cloud.callFunction:fail env check invalid',
    })
  })

  it('converts a timed out cloud call into a temporary failure', async () => {
    useCloud()
    callFunction.mockImplementationOnce(() => new Promise(() => undefined))
    setAuthCloudTimeoutForTesting(1)

    await expect(resolveLoginInCloud({ intent: 'login' })).rejects.toMatchObject({ code: 'TEMPORARY_FAILURE' })
  })

  it('initializes the configured cloud environment once', async () => {
    useCloud()

    await resolveLoginInCloud({ intent: 'login' })
    await resolveLoginInCloud({ intent: 'resume' })

    expect(init).toHaveBeenCalledTimes(1)
    expect(init).toHaveBeenCalledWith({ env: 'test-env' })
  })
})
