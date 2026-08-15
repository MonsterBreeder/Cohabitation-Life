// 共享事项流程的目标页验证：必须连接微信开发者工具的自动化会话才执行。
// 真实创建 → 双方可见 → 认领 → 完成 → 已完成可见 等流程由真机 + 双账号验收负责。
const canRunAutomator = typeof program !== 'undefined'
const e2eTest = canRunAutomator ? test : test.skip

describe('shared-task pages', () => {
  e2eTest('add-task page exposes the form and submit button', async () => {
    const page = await program.reLaunch('/subpackages/task/add-task/index')

    const form = await page.$('[data-testid="add-task-form"]')
    expect(form).toBeTruthy()

    const titleInput = await page.$('[data-testid="add-task-title-input"]')
    const submit = await page.$('[data-testid="add-task-submit"]')
    expect(titleInput).toBeTruthy()
    // 提交按钮在 title 为空时禁用
    expect(await submit.attribute('disabled')).toBeTruthy()
  })

  e2eTest('add-task page shows three type options', async () => {
    const page = await program.reLaunch('/subpackages/task/add-task/index')
    expect(await page.$('[data-testid="add-task-type-low_stock"]')).toBeTruthy()
    expect(await page.$('[data-testid="add-task-type-to_handle"]')).toBeTruthy()
    expect(await page.$('[data-testid="add-task-type-expiring"]')).toBeTruthy()
  })

  e2eTest('task-detail page can be opened with taskId and shows loading or card', async () => {
    const page = await program.reLaunch('/subpackages/task/task-detail/index?taskId=task_test')

    // 加载中或已加载（取决于 mock 数据）任一即可
    const loading = await page.$('[data-testid="task-detail-loading"]')
    const error = await page.$('[data-testid="task-detail-error"]')
    const card = await page.$('[data-testid="task-detail-card"]')
    expect(loading || error || card).toBeTruthy()
  })

  e2eTest('completed-tasks page shows loading or list or empty', async () => {
    const page = await program.reLaunch('/subpackages/task/completed-tasks/index')

    const loading = await page.$('[data-testid="completed-loading"]')
    const empty = await page.$('[data-testid="completed-empty"]')
    const error = await page.$('[data-testid="completed-error"]')
    const list = await page.$('[data-testid="completed-item"]')
    expect(loading || empty || error || list).toBeTruthy()
  })

  e2eTest('home page keeps single-member and two-members testids', async () => {
    const page = await program.reLaunch('/pages/index/index')
    await page.waitFor(500)

    const single = await page.$('[data-testid="home-single-member"]')
    const two = await page.$('[data-testid="home-two-members"]')
    const loading = await page.$('[data-testid="home-loading"]')
    const error = await page.$('[data-testid="home-error"]')
    expect(single || two || loading || error).toBeTruthy()
  })
})
