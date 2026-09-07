import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { openFootprintNavigation } from '../../src/utils/footprint-navigation'

const destination = { name: '广州塔', address: '海珠区阅江西路', latitude: 23.1064, longitude: 113.3246 }

describe('足迹地点导航', () => {
  const openLocation = jest.fn()

  beforeEach(() => {
    openLocation.mockReset()
    ;(globalThis as typeof globalThis & { uni: { openLocation: typeof openLocation } }).uni = { openLocation }
  })

  it('把用户所见地点完整交给微信地图，不产生其他操作', async () => {
    openLocation.mockImplementation((options) => options.success())

    await expect(openFootprintNavigation(destination)).resolves.toEqual({ ok: true })
    expect(openLocation).toHaveBeenCalledTimes(1)
    expect(openLocation.mock.calls[0][0]).toMatchObject({ ...destination, scale: 16 })
  })

  it('拒绝无效坐标，避免导航到错误的默认地点', async () => {
    await expect(openFootprintNavigation({ ...destination, latitude: 91 })).resolves.toEqual({
      ok: false,
      message: '这个地点的信息不完整，请重新选择地点',
    })
    expect(openLocation).not.toHaveBeenCalled()
  })

  it('用户取消时安静返回，平台故障时提供可重试提示', async () => {
    openLocation.mockImplementationOnce((options) => options.fail({ errMsg: 'openLocation:fail cancel' }))
    await expect(openFootprintNavigation(destination)).resolves.toEqual({ ok: false, message: null })

    openLocation.mockImplementationOnce((options) => options.fail({ errMsg: 'openLocation:fail system error' }))
    await expect(openFootprintNavigation(destination)).resolves.toEqual({
      ok: false,
      message: '暂时无法打开导航，请稍后重试；也可以在手机微信中尝试',
    })
  })

  it('足迹页和详情页都接入导航按钮，首页入口支持先选目的地', () => {
    const overview = readFileSync(resolve(__dirname, '../../src/pages/footprint/index.vue'), 'utf8')
    const detail = readFileSync(resolve(__dirname, '../../src/subpackages/footprint/footprint-detail/index.vue'), 'utf8')

    // 保护三条用户路径：未保存目的地、地图选中地点、已保存足迹详情。
    expect(overview).toContain('<FootprintNavigationButton />')
    expect(overview).toContain('<FootprintNavigationButton :place="selectedPlace.place" />')
    expect(detail).toContain('<FootprintNavigationButton :place="detail.place" />')
  })

  it('选择目的地被拒绝后提供位置设置入口', () => {
    const component = readFileSync(resolve(__dirname, '../../src/components/FootprintNavigationButton.vue'), 'utf8')

    expect(component).toContain('v-if="permissionDenied"')
    expect(component).toContain('打开位置设置')
    expect(component).toContain('await openFootprintLocationSetting()')
  })
})
