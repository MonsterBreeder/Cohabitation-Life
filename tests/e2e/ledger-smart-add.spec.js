// 文件用途：显式连接真实微信工具检查初次显示与用途说明；不发送模型或保存账目。
/** 普通测试不擅自连接工具，跳过不算实际页面通过。 */
const enabled = process.env.LEDGER_BOOKKEEPING_E2E === '1'
/** 只有明确选择后才运行这一组实际页面检查。 */
const suite = enabled ? describe : describe.skip

/** 建立真实连接，并跨过小程序组件边界查找控件。 */
function registerPageChecks() {
  /** 当前模拟器连接，结束后不关闭用户的工具窗口。 */
  let program
  /** 本次打开的真实页面，结束时离开以清空临时状态。 */
  let page

  /** 按明确地址连接工具，不改动产品依赖或微信身份。 */
  async function connect() {
    /** 环境指定的工具依赖，默认使用本机已有安装。 */
    const automator = require(process.env.MINIPROGRAM_AUTOMATOR_PATH || 'miniprogram-automator')
    program = await automator.connect({
      wsEndpoint: process.env.LEDGER_BOOKKEEPING_WS || 'ws://127.0.0.1:9421',
    })
  }

  /** 释放检查连接，不关闭窗口或删除账目。 */
  async function disconnect() {
    if (!program) return
    try {
      if (page) await program.navigateBack()
    } finally {
      program.disconnect()
    }
  }

  /** 查找实际控件，选择器不会自动穿过自定义组件。 */
  async function find(
    /** 当前页面或组件，只查其真实作用域。 */
    scope,
    /** 已在实际页面核对的固定选择器。 */
    selector,
    /** 有限组件深度，防止异常结构无界递归。 */
    depth = 0,
  ) {
    /** 当前作用域直接存在的节点。 */
    const direct = await scope.$(selector)
    if (direct) return direct
    if (depth >= 7) return null
    /** 当前层实际的小程序组件。 */
    const children = await scope.$$('component')
    /** 当前进入的独立子组件。 */
    for (const child of children) {
      /** 子组件命中的节点，未找到则继续下一项。 */
      const result = await find(child, selector, depth + 1)
      if (result) return result
    }
    return null
  }

  /** 实际显示用途说明和输入，未主动操作时没有确认清单。 */
  async function verifyInitialPage() {
    page = await program.navigateTo('/subpackages/ledger/ledger-smart-add/index')
    await page.waitFor('.ledger-smart-add')
    await page.waitFor(350)
    /** 当前业务根节点，其文字来自实际渲染。 */
    const root = await page.$('.ledger-smart-add')
    expect(await root.text()).toContain('同意用于本次整理')
    expect(await find(page, 'textarea')).toBeTruthy()
    expect(await find(page, '[data-testid="smart-draft-send"]')).toBeTruthy()
    expect(await find(page, '[data-testid="smart-draft-confirm"]')).toBeNull()
  }

  beforeAll(connect, 20000)
  afterAll(disconnect, 20000)
  test('首次进入显示输入和用途说明，不自动生成或保存', verifyInitialPage, 30000)
}

suite('一句话记账实际页面', registerPageChecks)
