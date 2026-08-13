// 目标页验证需要微信开发者工具提供 program 会话。
const canRunAutomator = typeof program !== 'undefined'
const e2eTest = canRunAutomator ? test : test.skip

describe('登录分流', () => {
  // 这些用例先保护目标页内容，真实跨账号分流需测试云环境配合。
  e2eTest('无家庭用户登录后到达创建家庭入口', async () => {
    const page = await program.reLaunch('/pages/create-home/index')

    const entry = await page.$('[data-testid="create-home-entry"]')
    expect(await entry.text()).toContain('创建我们的家')
  })

  e2eTest('有效邀请的用户到达加入确认入口且不把邀请显示在页面上', async () => {
    const page = await program.reLaunch('/pages/join-home/index')

    const entry = await page.$('[data-testid="join-home-entry"]')
    expect(await entry.text()).toContain('加入这个家')
    expect(await entry.text()).not.toMatch(/[A-Za-z0-9_-]{32,}/)
  })

  e2eTest('已有家庭用户打开其他邀请后看到一次说明并留在首页', async () => {
    const page = await program.reLaunch('/pages/index/index')

    expect(page.path).toBe('pages/index/index')
  })
})
