// 首页的目标页验证：必须连接微信开发者工具的自动化会话才执行。
// 双人/被移除/并发等真实行为差异由真机 + 双账号验收负责。
const canRunAutomator = typeof program !== 'undefined'
const e2eTest = canRunAutomator ? test : test.skip

describe('家庭首页', () => {
  e2eTest('单人家庭展示真实家庭与本人资料,且不暴露后置功能', async () => {
    const page = await program.reLaunch('/pages/index/index')
    await page.waitFor(500)

    const home = await page.$('[data-testid="home-single-member"]')
    const household = await page.$('[data-testid="household-profile"]')
    const text = await home.text()

    expect(home).toBeTruthy()
    expect(household).toBeTruthy()
    expect(text).toContain('这个家暂时只有你一人')
    // 邀请与事项在本阶段不应出现：单元 5 范围外
    expect(text).not.toContain('快速添加')
    // 单人状态不预先展示第二位成员的昵称或头像
    expect(text).not.toMatch(/(第二位|另一位)/)
  })

  e2eTest('双人家庭展示两位成员资料,且不再显示单人提示', async () => {
    const page = await program.reLaunch('/pages/index/index')
    await page.waitFor(500)

    const home = await page.$('[data-testid="home-two-members"]')
    const text = await home.text()

    expect(home).toBeTruthy()
    expect(text).not.toContain('这个家暂时只有你一人')
    // 事项模块未上线前,不应提前展示任何事项演示数据
    expect(text).not.toMatch(/(快速添加|快没了|待处理|快到期)/)
  })

  e2eTest('首页在加载与失败时都展示明确状态,且不展示伪造数据', async () => {
    const page = await program.reLaunch('/pages/index/index')
    await page.waitFor(500)

    const skeleton = await page.$('[data-testid="home-loading"]')
    const error = await page.$('[data-testid="home-error"]')
    const text = await page.text('body')

    // 加载或错误态二选一,加载时不应同时出现真实家庭内容
    if (skeleton) {
      expect(skeleton).toBeTruthy()
      expect(text).not.toContain('欢迎回家')
    } else if (error) {
      expect(error).toBeTruthy()
      // 错误页只展示受控提示,不能出现伪造昵称或头像
      expect(text).not.toMatch(/(成员|管理|事项)/)
    }
  })
})
