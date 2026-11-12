// 文件用途：在真实微信开发者工具中操作聊天记账，所有模型和账本响应来自本次内存替身。
/* global getApp, wx */
/** 只在明确指定独立开发者工具时执行。 */
const suite = process.env.LEDGER_BOOKKEEPING_E2E === '1' ? describe : describe.skip

/** 真实页面的自动操作与受控云响应各自独立。 */
function registerPageChecks() {
  let program
  let installed = false

  /** 测试替身拦截当前模拟器中的云动作，未列出的动作不转发。 */
  async function connect() {
    const automator = require(process.env.MINIPROGRAM_AUTOMATOR_PATH || 'miniprogram-automator')
    program = await automator.connect({
      wsEndpoint: process.env.LEDGER_BOOKKEEPING_WS || 'ws://127.0.0.1:9421',
    })
    installed = await program.evaluate(function installFixture() {
      const app = getApp()
      const pinia = app.$vm.$pinia
      const homeStore = pinia._s.get('household')
      const oldHome = homeStore ? { ...homeStore.$state } : pinia.state.value.household
      const existingCloud = wx.cloud
      const cloud = existingCloud || {}
      if (!existingCloud) wx.cloud = cloud
      if (wx.cloud !== cloud) return false
      const original = cloud.callFunction
      const init = cloud.init
      const id = 'chat-check-home'
      const profile = { nickname: '测试用户', avatar: { kind: 'builtin', id: 'person-neutral' } }
      const home = {
        id, name: '虚构测试家庭', memberCount: 1, currentMemberRole: 'owner',
        avatar: { kind: 'builtin', id: 'household-01' },
        members: [{ ...profile, isSelf: true }],
      }
      const fixture = {
        enabled: false,
        requests: [],
        writes: 0,
        draftId: '',
        revision: 0,
        attempt: 0,
        statuses: ['unexecuted', 'unexecuted'],
      }
      const batchId = 'chat-check-batch-001'
      const itemIds = ['chat-lunch', 'chat-taxi']
      const date = '2026-11-09'
      const expiresAt = Date.now() + 900000
      const batches = () => ({
        status: 'BATCH_RESULT',
        batchId,
        version: 1,
        attemptRevision: fixture.attempt,
        expiresAt,
        items: itemIds.map((itemId, index) => ({
          itemId,
          status: fixture.statuses[index],
          entryId: fixture.statuses[index] === 'success' ? 'fictional-entry-' + index : null,
          code: null,
        })),
      })
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const controlled = async ({ name, data }) => {
        // 新建账目页会重新读取家庭和数据库开关，测试中使用受控结果。
        if (name === 'household' && data.action === 'get') {
          return { result: { status: 'HOME', retryable: false, created: false, profile,
            household: { ...home, invitationEnabled: fixture.enabled } } }
        }
        if (name === 'ledger' && data.action === 'initCategories')
          return { result: { status: 'INITED', categories: [] } }
        if (name !== 'ledgerBookkeeping') throw new Error('检查禁止真实云动作')
        const action = data.action
        fixture.requests.push(action)
        if (action === 'getDraftAvailability') {
          await pause(1700)
          return { result: { status: 'DRAFT_AVAILABILITY', available: true, retryable: false } }
        }
        if (action === 'listBatches') {
          return { result: { status: 'BATCH_LIST', batches: fixture.writes ? [batches()] : [] } }
        }
        if (action === 'understandDraft') {
          if (data.consent !== true || data.householdId !== id) throw new Error('虚构请求范围不符')
          if (!data.sealed) {
            fixture.draftId = data.draftId
            fixture.revision = 0
          }
          fixture.revision++
          const first = fixture.revision === 1
          const corrected = data.text.includes('32')
          await pause(1300)
          return {
            result: {
              status: first ? 'DRAFT_CLARIFY' : 'DRAFT_READY',
              sealed: 'fictional-draft-' + fixture.revision,
              question: first ? '这两笔是谁付的？' : '',
              categories: [
                { key: 'c1', name: '餐饮', dining: true },
                { key: 'c2', name: '交通' },
              ],
              members: [{ key: 'm1', name: '测试用户', self: true }],
              draft: {
                id: fixture.draftId,
                revision: fixture.revision,
                anchorDay: date,
                expiresAt,
                entries: [
                  {
                    id: itemIds[0],
                    type: 'expense',
                    amountCents: 5000,
                    date,
                    categoryKey: 'c1',
                    memberKey: first ? null : 'm1',
                    note: '',
                    mealPeriod: 'lunch',
                  },
                  {
                    id: itemIds[1],
                    type: 'expense',
                    amountCents: corrected ? 3200 : 2800,
                    date,
                    categoryKey: 'c2',
                    memberKey: first ? null : 'm1',
                    note: '',
                    mealPeriod: null,
                  },
                ],
              },
            },
          }
        }
        if (action === 'cancelDraft') return { result: { status: 'DRAFT_CANCELLED' } }
        if (action === 'prepareBatch') return { result: batches() }
        if (action === 'saveBatch') {
          await pause(950)
          fixture.attempt++
          if (fixture.attempt === 1) {
            fixture.writes++
            fixture.statuses = ['success', 'unknown']
          } else if (fixture.attempt === 2) {
            fixture.writes++
            fixture.statuses = ['success', 'success']
          }
          return { result: batches() }
        }
        if (action === 'queryBatch') {
          await pause(700)
          if (fixture.statuses[1] === 'unknown') fixture.statuses[1] = 'unexecuted'
          return { result: batches() }
        }
        throw new Error('检查收到未登记动作')
      }
      cloud.callFunction = controlled
      cloud.init = () => {}
      if (cloud.callFunction !== controlled) {
        cloud.init = init
        return false
      }
      if (homeStore) homeStore.household = home
      else
        pinia.state.value.household = {
          household: home,
          profile: undefined,
          phase: 'loaded',
          authoritativeRevision: 0,
          draft: {},
        }
      app.__bookkeepingChatFixture = {
        fixture,
        restore() {
          cloud.callFunction = original
          cloud.init = init
          if (!existingCloud) delete wx.cloud
          const current = pinia._s.get('household')
          if (current) {
            if (oldHome) current.$patch(oldHome)
            else current.$reset()
          }
          else if (oldHome) pinia.state.value.household = oldHome
          else delete pinia.state.value.household
          delete app.__bookkeepingChatFixture
        },
      }
      return true
    })
    expect(installed).toBe(true)
  }

  /** 收尾恢复原微信方法和家庭内存，不关闭用户窗口。 */
  async function disconnect() {
    if (!program) return
    try {
      if (installed) {
        const current = await program.currentPage()
        if (current?.path.includes('ledger-smart-add')) await program.navigateBack()
        if ((await program.currentPage())?.path.includes('ledger-add')) await program.navigateBack()
        await program.evaluate(function restoreFixture() {
          getApp().__bookkeepingChatFixture?.restore()
        })
      }
    } finally {
      program.disconnect()
    }
  }

  /** 小程序选择器不会自动穿过自定义组件。 */
  async function find(scope, selector, depth = 0) {
    const direct = await scope.$(selector)
    if (direct || depth >= 7) return direct
    for (const child of await scope.$$('component')) {
      const result = await find(child, selector, depth + 1)
      if (result) return result
    }
    return null
  }

  /** 等待实际渲染，过期时标明具体缺少的控件。 */
  async function waitFor(page, selector) {
    const deadline = Date.now() + 8500
    while (Date.now() < deadline) {
      const element = await find(page, selector)
      if (element) return element
      await page.waitFor(100)
    }
    throw new Error('实际页面未显示 ' + selector)
  }

  /** 取出按正式页面动作发送的次数和虚构写入数。 */
  function report() {
    return program.evaluate(function readFixture() {
      return getApp().__bookkeepingChatFixture.fixture
    })
  }

  async function screenshot(name) {
    if (process.env.LEDGER_BOOKKEEPING_SCREENSHOTS) {
      const path = require('node:path')
      await program.screenshot({ path: path.join(process.env.LEDGER_BOOKKEEPING_SCREENSHOTS, name + '.png') })
    }
  }

  async function typeAndSend(page, text) {
    const input = await waitFor(page, 'textarea')
    await input.input(text)
    await tapButton(await waitFor(page, '[data-testid="smart-draft-send"]'))
  }

  /** 组件外层承载定位标记，真正响应触摸的是内部原生按钮。 */
  async function tapButton(element) {
    const button = await element.$('button')
    await (button || element).tap()
  }

  /** 关闭时仍能进入手动表单，从旧地址也不会初始化一句话记账。 */
  async function verifyClosedEntry() {
    const manual = await program.navigateTo('/subpackages/ledger/ledger-add/index')
    await waitFor(manual, '[data-testid="ledger-add-form"]')
    expect(await find(manual, '[data-testid="ledger-add-smart"]')).toBeNull()
    const smart = await program.navigateTo('/subpackages/ledger/ledger-smart-add/index')
    const message = await waitFor(smart, '.ledger-smart-add__initial')
    expect(await message.text()).toContain('一句话记账暂未开放')
    expect((await report()).requests).toEqual([])
    await program.navigateBack()
    await program.navigateBack()
  }

  /** 从手动入口打开，补问、纠正并用实际按钮查回与补存。 */
  async function verifyConversation() {
    await program.evaluate(() => { getApp().__bookkeepingChatFixture.fixture.enabled = true })
    const manual = await program.navigateTo('/subpackages/ledger/ledger-add/index')
    expect(manual.path).toContain('ledger-add')
    await screenshot('00-manual')
    const entrance = await waitFor(manual, '[data-testid="ledger-add-smart"]')
    // Wot UI 把点击事件绑定在单元格内部，触发后等待微信完成页面跳转。
    const cell = await entrance.$('.wd-cell')
    await (cell || entrance).tap()
    let page = await program.currentPage()
    const deadline = Date.now() + 5000
    while (!page.path.includes('ledger-smart-add') && Date.now() < deadline) {
      await manual.waitFor(100)
      page = await program.currentPage()
    }
    expect(page.path).toContain('ledger-smart-add')
    await waitFor(page, '[data-testid="smart-draft-initial"]')
    await screenshot('01-initial')
    await waitFor(page, 'textarea')
    await typeAndSend(page, '昨天午饭 50 元，打车 28 元')
    expect((await report()).requests).not.toContain('understandDraft')
    await tapButton(await waitFor(page, '[data-testid="smart-draft-consent-accept"]'))
    await waitFor(page, '[data-testid="smart-draft-progress"]')
    await screenshot('02-understanding')
    await page.waitFor(1500)
    expect(await (await page.$('.ledger-smart-add')).text()).toContain('这两笔是谁付的？')
    await typeAndSend(page, '都是我付的')
    await waitFor(page, '[data-testid="smart-draft-confirm"]')
    await typeAndSend(page, '打车改成 32')
    await waitFor(page, '[data-testid="smart-draft-progress"]')
    expect(await find(page, '[data-testid="smart-draft-confirm"]')).toBeNull()
    const confirm = await waitFor(page, '[data-testid="smart-draft-confirm"]')
    const activeRows = await page.$$('.ledger-smart-add__message')
    expect(activeRows.length).toBeGreaterThan(5)
    expect((await report()).writes).toBe(0)
    await screenshot('03-correction')
    await tapButton(confirm)
    await waitFor(page, '[data-testid="smart-batch-query"]')
    await screenshot('04-pending')
    await tapButton(await waitFor(page, '[data-testid="smart-batch-query"]'))
    await tapButton(await waitFor(page, '[data-testid="smart-batch-retry"]'))
    await page.waitFor(1400)
    expect((await report()).writes).toBe(2)
    expect((await report()).statuses).toEqual(['success', 'success'])
    await screenshot('05-saved')
    await typeAndSend(page, '另记一笔')
    await page.waitFor(1500)
    expect((await report()).requests.filter((action) => action === 'understandDraft')).toHaveLength(4)
    const back = await program.navigateBack()
    expect(back.path).toContain('ledger-add')
  }

  beforeAll(connect, 25000)
  afterAll(disconnect, 25000)
  test('关闭开关后保留手动表单，并拦住旧的一句话记账地址', verifyClosedEntry, 30000)
  test('实际记账入口可在聊天中补问、纠正、保存及核对', verifyConversation, 65000)
}

suite('睦录聊天记账实际页面', registerPageChecks)
