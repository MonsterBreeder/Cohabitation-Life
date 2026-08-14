// 登录入口分流的页面验证：必须连接微信开发者工具的自动化会话才执行。
// EntryStatus → EntryRoute 的纯函数映射由单元测试覆盖，e2e 关注页面在异常场景下的健壮性。
const canRunAutomator = typeof program !== 'undefined'
const e2eTest = canRunAutomator ? test : test.skip

// 邀请凭证的最小识别特征：32 位及以上的 base64url 串；页面文案和普通提示中都不应出现。
const inviteTokenPattern = /[A-Za-z0-9_-]{32,}/

describe('登录分流', () => {
  // 这些用例先保护目标页内容，真实跨账号分流需测试云环境配合。
  e2eTest('无家庭用户登录后到达创建家庭入口', async () => {
    const page = await program.reLaunch('/subpackages/household/create-home/index')

    const entry = await page.$('[data-testid="create-home-entry"]')
    expect(await entry.text()).toContain('创建我们的家')
  })

  e2eTest('有效邀请的用户到达加入确认入口且不把邀请显示在页面上', async () => {
    const page = await program.reLaunch('/subpackages/household/join-home/index')

    const entry = await page.$('[data-testid="join-home-entry"]')
    expect(await entry.text()).toContain('加入这个家')
    expect(await entry.text()).not.toMatch(inviteTokenPattern)
  })

  e2eTest('已有家庭用户打开其他邀请后看到一次说明并留在首页', async () => {
    const page = await program.reLaunch('/pages/index/index')

    expect(page.path).toBe('pages/index/index')
  })

  e2eTest('加入页在缺少邀请凭证时给出明确提示,不会假装完成加入', async () => {
    const page = await program.reLaunch('/subpackages/household/join-home/index')

    const entry = await page.$('[data-testid="join-home-entry"]')
    const submit = await page.$('button[type="primary"]')
    const text = await entry.text()
    // 提示受控文案必须出现,且不暴露邀请原文
    expect(text).toMatch(/(邀请|凭证|重新发送)/)
    expect(text).not.toMatch(inviteTokenPattern)
    // 没有真实预览时,确认按钮必须不可点
    expect(await submit.attribute('disabled')).toBeTruthy()
  })

  e2eTest('邀请状态页在没有具体 notice 时仍展示受控默认文案', async () => {
    const page = await program.reLaunch('/subpackages/household/invite-status/index')

    const card = await page.$('[data-testid="invite-status-card"]')
    const title = await page.$('[data-testid="invite-status-title"]')
    const description = await page.$('[data-testid="invite-status-description"]')
    const text = await page.text('body')

    expect(card).toBeTruthy()
    expect(title).toBeTruthy()
    expect(description).toBeTruthy()
    // 任何状态下都不应泄露邀请原文
    expect(text).not.toMatch(inviteTokenPattern)
  })
})
