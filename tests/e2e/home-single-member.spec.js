// 只有连接微信开发者工具自动化会话时才运行真实首页操作。
const canRunAutomator = typeof program !== 'undefined'
const e2eTest = canRunAutomator ? test : test.skip

describe('单人家庭首页', () => {
  e2eTest('展示真实家庭与本人资料且不出现后置功能', async () => {
    const page = await program.reLaunch('/pages/index/index')
    await page.waitFor(500)

    const home = await page.$('[data-testid="home-single-member"]')
    const household = await page.$('[data-testid="household-profile"]')
    const member = await page.$('[data-testid="member-profile"]')
    const text = await home.text()

    expect(household).toBeTruthy()
    expect(member).toBeTruthy()
    expect(text).toContain('这个家暂时只有你一人')
    expect(text).not.toContain('快速添加')
    expect(text).not.toContain('邀请')
  })
})
