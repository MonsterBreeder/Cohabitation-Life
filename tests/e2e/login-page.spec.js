// 只有连接微信开发者工具自动化会话时才运行真实页面操作。
const canRunAutomator = typeof program !== 'undefined'
const e2eTest = canRunAutomator ? test : test.skip

describe('登录页', () => {
  // 保护未同意协议时不离开登录页。
  e2eTest('未勾选协议时留在登录页且显示提示', async () => {
    const page = await program.reLaunch('/pages/login/index')
    const title = await page.$('[data-testid="login-title"]')
    const submit = await page.$('[data-testid="login-submit"]')

    expect(await title.text()).toBe('两个人的小事，一起记得')
    await submit.tap()

    const validation = await page.$('[data-testid="agreement-required"]')
    expect(await validation.text()).toBe('请先阅读并同意用户协议和隐私政策')
    expect(page.path).toBe('pages/login/index')
  })
})
