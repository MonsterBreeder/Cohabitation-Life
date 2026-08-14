// 只有连接微信开发者工具自动化会话时才运行真实页面操作。
const canRunAutomator = typeof program !== 'undefined'
const e2eTest = canRunAutomator ? test : test.skip

describe('创建家庭页', () => {
  e2eTest('默认资料无需修改即可提交', async () => {
    const page = await program.reLaunch('/subpackages/household/create-home/index')
    const form = await page.$('[data-testid="create-home-form"]')
    const input = await page.$('[data-testid="household-name-input"]')
    const selectedAvatar = await page.$('[data-testid="household-avatar-household-01"]')
    const customAvatar = await page.$('[data-testid="household-avatar-custom"]')
    const submit = await page.$('[data-testid="create-home-submit"]')

    expect(await form.text()).toContain('给我们的家一个开始')
    expect(await input.attribute('value')).toBe('我们的小家')
    expect(await selectedAvatar.attribute('class')).toContain('avatar-picker__option--selected')
    expect(await customAvatar.text()).toContain('上传图片')
    expect(await submit.attribute('disabled')).toBeFalsy()
  })

  e2eTest('空名称会显示明确提示并禁止创建', async () => {
    const page = await program.reLaunch('/subpackages/household/create-home/index')
    const input = await page.$('[data-testid="household-name-input"]')
    await input.input('   ')

    const error = await page.$('[data-testid="household-name-error"]')
    const submit = await page.$('[data-testid="create-home-submit"]')
    expect(await error.text()).toBe('请输入家庭名称')
    expect(await submit.attribute('disabled')).toBeTruthy()
  })
})
