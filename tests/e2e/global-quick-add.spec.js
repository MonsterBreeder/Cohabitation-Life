// 真实层级和点击只能在微信开发者工具预览中确认；显式开启后连接自动化端口。
const enabled = process.env.GLOBAL_QUICK_ADD_E2E === '1'
const suite = enabled ? describe : describe.skip

suite('全局快速新增入口', () => {
  let program

  function bounded(promise, label) {
    let timer
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}超时，请确认预览已编译并完成登录`)), 10000) }),
    ]).finally(() => clearTimeout(timer))
  }

  beforeAll(async () => {
    const automator = require(process.env.MINIPROGRAM_AUTOMATOR_PATH || 'miniprogram-automator')
    program = await bounded(automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' }), '连接开发者工具')
    // 开发者工具刚开启自动化端口时，页面元数据会稍晚到达；等待就绪后再切页。
    await new Promise((resolve) => setTimeout(resolve, 2000))
  })

  afterAll(() => { if (program) program.disconnect() })

  test.each([
    ['/pages/index/index', '首页'],
    ['/pages/ledger/index', '账本'],
    ['/pages/footprint/index', '足迹'],
    ['/pages/profile/index', '我的'],
  ])('%s 页面可展开三个固定顺序的动作并用遮罩关闭', async (path) => {
    const page = await bounded(program.reLaunch(path), `打开${path}`)
    await bounded(page.waitFor(1000), '等待家庭资料')
    const fab = await bounded(page.$('[data-testid="global-quick-add"]'), '查找快速新增入口')
    expect(fab).toBeTruthy()

    // 触发器使用品牌主题视图，不能依赖 Wot UI 默认按钮的内部结构。
    const trigger = await bounded(fab.$('.global-quick-add__trigger'), '查找加号')
    await bounded(trigger.tap(), '展开快速新增')
    await bounded(page.waitFor(350), '等待展开动画')

    const ledger = await bounded(page.$('[data-testid="global-quick-add-ledger"]'), '查找记账入口')
    const task = await bounded(page.$('[data-testid="global-quick-add-task"]'), '查找记事项入口')
    const footprint = await bounded(page.$('[data-testid="global-quick-add-footprint"]'), '查找记足迹入口')
    const overlay = await bounded(page.$('[data-testid="global-quick-add-overlay"]'), '查找遮罩')
    expect(await ledger.text()).toContain('记账')
    expect(await task.text()).toContain('记事项')
    expect(await footprint.text()).toContain('记足迹')
    expect(overlay).toBeTruthy()

    await bounded(overlay.tap(), '点击遮罩关闭')
  })
})
