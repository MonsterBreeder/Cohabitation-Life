// 保护手机端路线文件下载：请求通道不可用时仍能读取已获授权的文件，失败后可重试且不遗留路线副本。
import {
  getHikingRouteInCloud,
  resetHikingCloudForTesting,
  setHikingCloudEnvironmentForTesting,
  setHikingCloudRuntimeForTesting,
} from '../../src/services/hiking-cloud'
import type { HikingRoute } from '../../src/types/hiking'

const route: HikingRoute = {
  version: 1,
  source: 'kml',
  segments: [
    {
      altitudeMode: 'untrusted',
      points: [
        { latitude: 23, longitude: 113 },
        { latitude: 23.01, longitude: 113.01 },
      ],
    },
    {
      altitudeMode: 'untrusted',
      points: [
        { latitude: 23.02, longitude: 113.02 },
        { latitude: 23.03, longitude: 113.03 },
      ],
    },
  ],
}
const filePath = '/tmp/hiking-route.json'
const url = 'https://route.example.test/private.json?sign=test'
const request = jest.fn()
const downloadFile = jest.fn()
const readFile = jest.fn()
const unlink = jest.fn()
const callFunction = jest.fn()
const originalUni = globalThis.uni

beforeEach(() => {
  jest.clearAllMocks()
  // 模拟手机只允许文件下载通道；旧实现会返回用户看到的笼统错误。
  request.mockRejectedValue({ errMsg: 'request:fail url not in domain list' })
  downloadFile.mockImplementation(({ success }) => success({ statusCode: 200, tempFilePath: filePath }))
  readFile.mockImplementation(({ success }) => success({ data: JSON.stringify(route) }))
  unlink.mockImplementation(({ complete }) => complete())
  callFunction.mockResolvedValue({ result: { status: 'LOADED', url } })
  globalThis.uni = { request, downloadFile } as unknown as typeof uni
  setHikingCloudEnvironmentForTesting('test-env')
  const manager = { readFile, unlink, writeFile: jest.fn() }
  setHikingCloudRuntimeForTesting({
    env: { USER_DATA_PATH: '/tmp' },
    getFileSystemManager: () => manager,
    cloud: { init: jest.fn(), uploadFile: jest.fn(), callFunction },
  })
})

afterEach(() => {
  globalThis.uni = originalUni
  resetHikingCloudForTesting()
})

describe('已保存徒步路线下载', () => {
  it('通过文件下载读取路线，并保留未记录路段之间的断开', async () => {
    await expect(getHikingRouteInCloud('footroute_test')).resolves.toEqual(route)
    expect(request).not.toHaveBeenCalled()
    expect(downloadFile).toHaveBeenCalledWith(expect.objectContaining({ url, timeout: 12_000 }))
    expect(readFile).toHaveBeenCalledWith(expect.objectContaining({ filePath, encoding: 'utf8' }))
    expect(unlink).toHaveBeenCalledWith(expect.objectContaining({ filePath }))
  })

  it.each(['not-json', '{}', JSON.stringify({ ...route, segments: [] })])(
    '拒绝损坏内容并清理临时文件：%s',
    async (data) => {
      readFile.mockImplementation(({ success }) => success({ data }))
      await expect(getHikingRouteInCloud('footroute_test')).rejects.toThrow('路线暂时无法读取，请重试')
      expect(unlink).toHaveBeenCalledWith(expect.objectContaining({ filePath }))
    },
  )

  it('下载返回失败状态时不把错误页当作路线，仍清理下载文件', async () => {
    downloadFile.mockImplementation(({ success }) => success({ statusCode: 403, tempFilePath: filePath }))
    await expect(getHikingRouteInCloud('footroute_test')).rejects.toThrow('路线暂时无法读取，请重试')
    expect(readFile).not.toHaveBeenCalled()
    expect(unlink).toHaveBeenCalledWith(expect.objectContaining({ filePath }))
  })

  it('文件读取失败后仍清理临时文件', async () => {
    readFile.mockImplementation(({ fail }) => fail({ errMsg: 'readFile:fail' }))
    await expect(getHikingRouteInCloud('footroute_test')).rejects.toThrow('路线文件暂时无法读取，请重试')
    expect(unlink).toHaveBeenCalledWith(expect.objectContaining({ filePath }))
  })

  it.each([
    ['downloadFile:fail timeout', '路线下载超时，请重试'],
    ['downloadFile:fail network error', '路线下载失败，请检查网络后重试'],
    [`downloadFile:fail url not in domain list ${url}`, '路线下载地址未获微信允许，请联系维护者'],
  ])('下载失败提供可读提示且不暴露私有地址：%s', async (errMsg, message) => {
    downloadFile.mockImplementation(({ fail }) => fail({ errMsg }))
    await expect(getHikingRouteInCloud('footroute_test')).rejects.toThrow(message)
    expect(readFile).not.toHaveBeenCalled()
    expect(unlink).not.toHaveBeenCalled()
  })

  it('重试时重新获取授权地址，不复用失败或过期的地址', async () => {
    downloadFile.mockImplementationOnce(({ fail }) => fail({ errMsg: 'downloadFile:fail timeout' }))
    await expect(getHikingRouteInCloud('footroute_test')).rejects.toThrow('超时')
    const renewedUrl = 'https://route.example.test/private.json?sign=renewed'
    callFunction.mockResolvedValueOnce({ result: { status: 'LOADED', url: renewedUrl } })
    await expect(getHikingRouteInCloud('footroute_test')).resolves.toEqual(route)
    expect(callFunction).toHaveBeenCalledTimes(2)
    expect(downloadFile).toHaveBeenLastCalledWith(expect.objectContaining({ url: renewedUrl }))
  })

  it('云端拒绝访问时不发起文件下载', async () => {
    const failure = { status: 'NO_HOME', retryable: false, errorMessage: '请先加入家庭' }
    callFunction.mockResolvedValueOnce({ result: failure })
    await expect(getHikingRouteInCloud('footroute_test')).rejects.toEqual(failure)
    expect(downloadFile).not.toHaveBeenCalled()
  })

  it('取得路线地址前的微信异常能定位到访问步骤，不再被笼统提示掩盖', async () => {
    callFunction.mockRejectedValueOnce({ errCode: -501000, errMsg: `cloud.callFunction:fail ${url}` })
    await expect(getHikingRouteInCloud('footroute_test')).rejects.toThrow(
      '路线访问失败，请重试（检查编号 A-501000）',
    )
    expect(downloadFile).not.toHaveBeenCalled()
  })

  it('下载接口同步抛出的普通对象也保留安全检查编号', async () => {
    downloadFile.mockImplementationOnce(() => {
      throw { errCode: -1, errMsg: url }
    })
    await expect(getHikingRouteInCloud('footroute_test')).rejects.toThrow(
      '路线下载失败，请重试（检查编号 D-1）',
    )
  })

  it('不把异常中的地址或任意文本当作检查编号展示', async () => {
    callFunction.mockRejectedValueOnce({ code: url, errMsg: url })
    await expect(getHikingRouteInCloud('footroute_test')).rejects.toThrow(
      '路线访问失败，请重试（检查编号 A）',
    )
  })

  it('微信仅在异常原文给出错误码时，也只提取数字而不展示私有地址', async () => {
    callFunction.mockRejectedValueOnce({ errMsg: `cloud.callFunction:fail Error: errCode: -504002 ${url}` })
    await expect(getHikingRouteInCloud('footroute_test')).rejects.toThrow(
      '路线访问失败，请重试（检查编号 A-504002）',
    )
  })
})
