// 文件用途：在实际微信模拟器操作聊天页面，云端只使用该次内存替身。
/* global getApp, getCurrentPages, wx */
const suite = process.env.MULU_LIFE_CHAT_E2E === '1' ? describe : describe.skip

suite('睦录统一聊天', () => {
  let program
  let installed = false

  // 先关闭所有默认云动作，以虚构账目检查页面依次提交哪些操作。
  beforeAll(async () => {
    const automator = require(process.env.MINIPROGRAM_AUTOMATOR_PATH || 'miniprogram-automator')
    program = await automator.connect({ wsEndpoint: process.env.MULU_LIFE_CHAT_WS || 'ws://127.0.0.1:9429' })
    const deadline = Date.now() + 12_000
    let appReady = false
    while (Date.now() < deadline && !appReady) {
      appReady = await program.evaluate(() => typeof getApp === 'function' && Boolean(getApp()?.$vm?.$pinia))
      if (!appReady) await new Promise((resolve) => setTimeout(resolve, 200))
    }
    expect(appReady).toBe(true)
    installed = await program.evaluate(function install() {
      const app = getApp()
      const pinia = app.$vm.$pinia
      const store = pinia._s.get('household')
      const previous = store ? { ...store.$state } : pinia.state.value.household
      const auth = pinia._s.get('auth')
      const priorAuth = auth && { ...auth.$state }
      const authStorage = ['auth.login.completed', 'auth.invite.pending'].map((key) => [
        key,
        wx.getStorageSync(key),
      ])
      const originalCloud = wx.cloud
      const cloud = originalCloud || {}
      if (!originalCloud) wx.cloud = cloud
      if (wx.cloud !== cloud) return false
      const oldCall = cloud.callFunction
      const oldInit = cloud.init
      const id = 'life-chat-e2e-home'
      const profile = { nickname: '虚构用户', avatar: { kind: 'builtin', id: 'person-neutral' } }
      const household = {
        id,
        name: '虚构家庭',
        avatar: { kind: 'builtin', id: 'household-01' },
        memberCount: 1,
        currentMemberRole: 'owner',
        members: [{ ...profile, isSelf: true }],
        invitationEnabled: true,
      }
      const fixture = {
        actions: [],
        calls: [],
        writes: 0,
        restore() {
          cloud.callFunction = oldCall
          cloud.init = oldInit
          if (!originalCloud) delete wx.cloud
          const current = pinia._s.get('household')
          if (current && previous) current.$patch(previous)
          else if (current) current.$reset()
          else if (previous) pinia.state.value.household = previous
          else delete pinia.state.value.household
          if (priorAuth) auth.$patch(priorAuth)
          for (const [key, value] of authStorage) {
            if (value) wx.setStorageSync(key, value)
            else wx.removeStorageSync(key)
          }
          delete app.__lifeChatFixture
        },
      }
      const respond = (result) => ({ result })
      const call = async ({ name, data }) => {
        fixture.calls.push(`${name}:${data.action || ''}`)
        if (name === 'resolve-login') return respond({ status: 'HOME', retryable: false })
        if (name === 'household' && data.action === 'get')
          return respond({ status: 'HOME', retryable: false, created: false, profile, household })
        if (name === 'task' && data.action === 'listCurrent')
          return respond({
            status: 'LISTED',
            retryable: false,
            current: { priority: [], groups: { low_stock: [], to_handle: [], expiring: [] } },
          })
        if (name === 'ledger' && data.action === 'initCategories')
          return respond({ status: 'INITED', categories: [] })
        if (name === 'ledger' && data.action === 'listEntries')
          return respond({ status: 'LISTED', entries: [], deletedEntries: [], hasMore: false })
        if (name === 'ledger' && data.action === 'getStats')
          return respond({
            status: 'LOADED',
            stats: {
              month: data.month || '',
              monthExpenseCents: 0,
              monthIncomeCents: 0,
              netCents: 0,
              byCategory: [],
              byPayer: [],
            },
          })
        if (name === 'footprint' && ['getOverview', 'getSummary'].includes(data.action))
          return respond({
            status: 'LOADED',
            summary: { placeCount: 0, latestEntry: null },
            places: [],
            entries: [],
            entriesCursor: null,
            placesCursor: null,
            showPreJoinHistoryNotice: false,
          })
        if (name !== 'life-chat' || data.householdId !== id)
          return respond({ status: 'TEMPORARY_FAILURE', retryable: false })
        fixture.actions.push(data.action)
        if (data.action === 'status') return respond({ kind: 'ready', version: 1 })
        if (data.action === 'open' && data.consent === 1)
          return respond({ kind: 'opened', sessionId: 'fixture-life-chat' })
        if (data.action === 'ask' && data.text.includes('32'))
          return respond({
            kind: 'confirm',
            action: 'update',
            title: '修改账目',
            label: '昨天打车',
            fields: [{ label: '金额', before: '¥28.00', after: '¥32.00' }],
            operationId: '30cb8afb-3acd-4528-bc90-93e724c23832',
            credential: 'fixture-card',
          })
        if (data.action === 'ask' && data.text.includes('可以'))
          return respond({ kind: 'clarify', question: '请在卡片上点击确认。' })
        if (data.action === 'ask')
          return respond({
            kind: 'answer',
            message: '找到 1 笔账目。',
            candidates: [
              {
                ref: 'R1',
                amountCents: 2800,
                categoryName: '交通',
                note: '打车',
                occurredAt: '2026-11-15T06:00:00Z',
                payerName: '我',
              },
            ],
            referenceVersion: 1,
          })
        if (data.action === 'confirm' && data.credential === 'fixture-card') {
          fixture.writes++
          return respond({ kind: 'unknown' })
        }
        if (data.action === 'recover' && fixture.writes === 1)
          return respond({ kind: 'saved', domain: 'ledger', action: 'update', id: 'fictional-ledger-entry' })
        return respond({ kind: 'closed' })
      }
      cloud.callFunction = call
      cloud.init = () => {}
      if (cloud.callFunction !== call) return false
      const state = { household, profile, phase: 'loaded', authoritativeRevision: 0, draft: {} }
      if (store) store.$patch(state)
      else pinia.state.value.household = state
      auth?.$patch({ hasCompletedLogin: true, pendingInviteToken: undefined, navigationIntent: undefined })
      app.__lifeChatFixture = fixture
      return true
    })
    expect(installed).toBe(true)
  }, 20_000)

  // 恢复当前模拟器的方法与内存状态，退出聊天会撤回页面状态。
  afterAll(async () => {
    if (!program) return
    try {
      if (installed) {
        if ((await program.currentPage())?.path.includes('life-chat')) await program.navigateBack()
        await program.evaluate(() => getApp().__lifeChatFixture?.restore())
      }
    } finally {
      program.disconnect()
    }
  }, 20_000)

  // 从真实组件找到原生按钮，避免仅检查存在于模板中的节点。
  async function find(scope, selector, depth = 0) {
    const direct = await scope.$(selector)
    if (direct || depth >= 6) return direct
    for (const child of await scope.$$('component')) {
      const found = await find(child, selector, depth + 1)
      if (found) return found
    }
    return null
  }
  async function wait(page, selector) {
    const deadline = Date.now() + 9_000
    while (Date.now() < deadline) {
      const element = await find(page, selector)
      if (element) return element
      await page.waitFor(100)
    }
    const snapshot = await program.evaluate(() => {
      const page = getCurrentPages().slice(-1)[0]
      const app = getApp()
      const tasks = app.$vm.$pinia._s.get('task')
      return { route: page?.route, taskPhase: tasks?.phase, calls: app.__lifeChatFixture?.calls }
    })
    if (process.env.MULU_LIFE_CHAT_FAILURE_SCREENSHOT)
      await program.screenshot({ path: process.env.MULU_LIFE_CHAT_FAILURE_SCREENSHOT })
    throw new Error(`真实页面未显示 ${selector}（${JSON.stringify(snapshot)}）`)
  }
  async function tap(page, id) {
    const node = await wait(page, `[data-testid="${id}"]`)
    await ((await node.$('button')) || node).tap()
  }
  // 点按钮先触发导航，再等待微信切换到新页面。
  async function waitForPath(path) {
    const deadline = Date.now() + 8_000
    let page = await program.currentPage()
    while (page?.path !== path && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 150))
      page = await program.currentPage()
    }
    expect(page?.path).toBe(path)
    return page
  }
  async function ask(page, text) {
    await (await wait(page, 'textarea')).input(text)
    await tap(page, 'smart-draft-send')
  }
  function state() {
    return program.evaluate(() => ({
      actions: getApp().__lifeChatFixture.actions,
      writes: getApp().__lifeChatFixture.writes,
    }))
  }

  test('从真实聊天输入，打开同意卡，查账修改并查回原保存结果', async () => {
    const page = await program.navigateTo('/subpackages/ledger/life-chat/index?scope=all')
    await ask(page, '查一下昨天的打车账')
    expect((await state()).actions).toEqual(['status'])
    await tap(page, 'life-chat-consent')
    await wait(page, '[data-testid="life-chat-answer"]')
    await ask(page, '把它改成32元')
    const card = await wait(page, '[data-testid="life-chat-confirm-card"]')
    expect(await card.text()).toContain('32.00')
    await ask(page, '可以')
    expect((await state()).writes).toBe(0)
    await tap(page, 'life-chat-confirm')
    await tap(page, 'life-chat-recover')
    await wait(page, '[data-testid="life-chat-saved"]')
    expect(await state()).toEqual({
      actions: ['status', 'open', 'ask', 'ask', 'ask', 'confirm', 'recover'],
      writes: 1,
    })
    if (process.env.MULU_LIFE_CHAT_SCREENSHOT)
      await program.screenshot({ path: process.env.MULU_LIFE_CHAT_SCREENSHOT })
    await program.navigateBack()
  }, 45_000)

  test('逐一点击三个栏目入口，打开对应聊天并返回原页', async () => {
    await program.navigateTo('/pages/index/index')
    const entries = [
      ['/pages/index/index', 'task-life-chat', 'task', '把想记的事告诉我。'],
      ['/pages/ledger/index', 'ledger-home-ai-entry', 'ledger', '可以查账、记账'],
      ['/pages/footprint/index', 'footprint-life-chat', 'footprint', '最近去了哪里？'],
    ]
    for (const [path, button, scope, introduction] of entries) {
      const original =
        path === '/pages/index/index' ? await program.currentPage() : await program.navigateTo(path)
      await tap(original, button)
      const chat = await waitForPath('subpackages/ledger/life-chat/index')
      expect(chat.query.scope).toBe(scope)
      expect(await (await wait(chat, '.life-chat__bubble')).text()).toContain(introduction)
      await program.navigateBack()
      await waitForPath(original.path)
      if (path !== '/pages/index/index') await program.navigateBack()
    }
  }, 60_000)
})
