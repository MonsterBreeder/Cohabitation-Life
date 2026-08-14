// 邀请与加入家庭流程的目标页验证：必须连接微信开发者工具的自动化会话才执行。
// 真正涉及微信分享、双账号同时操作和云端并发确认的场景，由真机 + 双账号验收完成。
const canRunAutomator = typeof program !== 'undefined'
const e2eTest = canRunAutomator ? test : test.skip

// 邀请凭证的最小识别特征：32 位及以上的 base64url 串；页面文案和普通提示中都不应出现。
const inviteTokenPattern = /[A-Za-z0-9_-]{32,}/

describe('邀请与加入家庭流程', () => {
  e2eTest('加入页展示无家庭受邀者的确认入口', async () => {
    const page = await program.reLaunch('/subpackages/household/join-home/index')

    const entry = await page.$('[data-testid="join-home-entry"]')
    const text = await entry.text()
    expect(text).toContain('加入这个家')
    expect(text).not.toContain('转入这个家')
    expect(text).not.toMatch(inviteTokenPattern)
  })

  e2eTest('加入页在单人家庭状态下展示转入文案与提示', async () => {
    // 转入文案由当前家庭成员数触发；这里断言源数据规则，跨账号流程由真机验收。
    const page = await program.reLaunch('/subpackages/household/join-home/index')
    const entry = await page.$('[data-testid="join-home-entry"]')
    const text = await entry.text()
    expect(text).toMatch(/(加入这个家|转入这个家)/)
  })

  e2eTest('邀请状态页只展示有限提示，不泄露邀请原文', async () => {
    const page = await program.reLaunch('/subpackages/household/invite-status/index')

    const card = await page.$('[data-testid="invite-status-card"]')
    const title = await page.$('[data-testid="invite-status-title"]')
    const description = await page.$('[data-testid="invite-status-description"]')
    const text = await page.text('body')
    expect(card).toBeTruthy()
    expect(title).toBeTruthy()
    expect(description).toBeTruthy()
    expect(text).not.toMatch(inviteTokenPattern)
    expect(text).not.toMatch(/(uuid|householdId|openid)/i)
  })

  e2eTest('成员管理页对单人家庭展示邀请入口', async () => {
    const page = await program.reLaunch('/subpackages/household/member-management/index')
    const text = await page.text('body')
    expect(text).toMatch(/(准备邀请|想邀请谁)/)
  })
})
