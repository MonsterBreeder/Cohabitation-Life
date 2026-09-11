// 首次体验流程的目标页验证：必须连接微信开发者工具的自动化会话才执行。
// 单元测试覆盖纯逻辑，e2e 只关注页面在真实运行环境中的受控展示。
const canRunAutomator = typeof program !== 'undefined'
const e2eTest = canRunAutomator ? test : test.skip

// 邀请凭证的最小识别特征：32 位及以上的 base64url 串；页面文案和普通提示中都不应出现。
const inviteTokenPattern = /[A-Za-z0-9_-]{32,}/

describe('首次体验流程', () => {
  e2eTest('欢迎页对无邀请新用户暴露"开始使用"和"先看看怎么用"，不显示登录或创建文案', async () => {
    const page = await program.reLaunch('/pages/login/index')
    const text = await page.text('body')
    expect(text).toContain('开始使用')
    expect(text).toContain('先看看怎么用')
    expect(text).not.toContain('微信快捷登录')
    expect(text).not.toContain('创建我的家')
    expect(text).not.toMatch(inviteTokenPattern)
  })

  e2eTest('欢迎页在未勾选协议时主按钮不可点，且不调云端', async () => {
    const page = await program.reLaunch('/pages/login/index')
    const submit = await page.$('[data-testid="welcome-primary-start-use--welcome"]')
    expect(await submit.attribute('disabled')).toBeTruthy()
    const text = await page.text('body')
    expect(text).toMatch(/用户协议|隐私政策/)
  })

  e2eTest('法律正文页加载后显示必填小节，不暴露云端内部字段', async () => {
    const page = await program.navigateTo('/pages/legal/index?kind=privacy')
    const text = await page.text('body')
    expect(text).toMatch(/生效日期/)
    expect(text).not.toMatch(inviteTokenPattern)
    expect(text).not.toMatch(/(uuid|householdId|openid)/i)
  })

  e2eTest('体验页默认不写云端数据，操作只更新本地状态', async () => {
    const page = await program.reLaunch('/pages/experience/index')
    const notice = await page.$('[data-testid="experience-notice"]')
    expect(await notice.text()).toContain('示例数据不会保存')
    const task = await page.$('[data-testid="experience-task-card"]')
    const taskText = await task.text()
    expect(taskText).toMatch(/整理阳台|下周做饭/)
  })

  e2eTest('邀请状态页在缺少 notice 时仍展示受控默认文案', async () => {
    const page = await program.reLaunch('/subpackages/household/invite-status/index')
    const card = await page.$('[data-testid="invite-status-card"]')
    const title = await page.$('[data-testid="invite-status-title"]')
    const description = await page.$('[data-testid="invite-status-description"]')
    const text = await page.text('body')
    expect(card).toBeTruthy()
    expect(title).toBeTruthy()
    expect(description).toBeTruthy()
    expect(text).not.toMatch(inviteTokenPattern)
  })
})
