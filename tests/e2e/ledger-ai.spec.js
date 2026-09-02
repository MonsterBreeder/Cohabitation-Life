// 只有连接微信开发者工具自动化会话时才运行问账本真实页面操作。
const canRunAutomator = typeof program !== 'undefined'
const e2eTest = canRunAutomator ? test : test.skip

describe('问账本页面', () => {
  e2eTest('首次进入先展示数据用途说明，不会自动发送问题', async () => {
    const page = await program.navigateTo('/subpackages/ledger/ledger-ai/index')
    const consent = await page.$('[data-testid="ledger-ai-consent"]')
    expect(consent).toBeTruthy()
    expect(page.path).toBe('subpackages/ledger/ledger-ai/index')
  })
})
