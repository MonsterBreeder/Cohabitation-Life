// 使用已登录的微信测试账号验证双入口；不会代替用户同意协议，也不写入真实足迹。
// 显式启用后才连接开发者工具，未启用的跳过结果不能算页面验收通过。
const enabled = process.env.FOOTPRINT_E2E === '1'
const suite = enabled ? describe : describe.skip
suite('我们的足迹：微信预览入口', () => {
  let program
  function bounded(promise, label) {
    let timer
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}超时，请确认预览已编译且完成登录`)), 10000) })]).finally(() => clearTimeout(timer))
  }
  beforeAll(async () => {
    const automator = require(process.env.MINIPROGRAM_AUTOMATOR_PATH || 'miniprogram-automator')
    program = await bounded(automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' }), '连接开发者工具')
  })
  afterAll(() => { if (program) program.disconnect() })
  test('首页卡片进入足迹后能看到地图、列表和四个底部入口', async () => {
    const home = await bounded(program.reLaunch('/pages/index/index'), '打开首页')
    await bounded(home.waitFor('.home-footprint-card'), '读取首页足迹卡片')
    const card = await bounded(home.$('.home-footprint-card'), '查找足迹卡片')
    await bounded(card.tap(), '点击足迹卡片')
    const footprints = await bounded(program.currentPage(), '读取足迹页')
    expect(footprints.path).toBe('pages/footprint/index')
    const segmented = await bounded(footprints.$('wd-segmented'), '读取地图列表切换')
    expect(segmented).toBeTruthy()
    const modes = await bounded(segmented.$$('.wd-segmented__item'), '读取切换选项')
    expect(modes).toHaveLength(2)
    await bounded(modes[1].tap(), '切换到列表')
    const bar = await bounded(footprints.$('app-tab-bar'), '读取底部入口')
    expect(bar).toBeTruthy()
    expect(await bounded(bar.$$('wd-tabbar-item'), '核对四个入口')).toHaveLength(4)
  })
})
