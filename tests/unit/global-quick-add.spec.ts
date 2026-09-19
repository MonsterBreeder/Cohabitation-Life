import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QUICK_ADD_ACTIONS, navigateToQuickAdd, returnAfterQuickCreate } from '../../src/utils/quick-add'

describe('全局快速新增', () => {
  const navigateTo = jest.fn()
  const navigateBack = jest.fn()
  const reLaunch = jest.fn()
  const showToast = jest.fn()

  beforeEach(() => {
    navigateTo.mockReset()
    navigateBack.mockReset()
    reLaunch.mockReset()
    showToast.mockReset()
    ;(globalThis as typeof globalThis & { getCurrentPages: () => unknown[] }).getCurrentPages = () => [{}, {}]
    ;(
      globalThis as typeof globalThis & {
        uni: {
          navigateTo: typeof navigateTo
          navigateBack: typeof navigateBack
          reLaunch: typeof reLaunch
          showToast: typeof showToast
        }
      }
    ).uni = { navigateTo, navigateBack, reLaunch, showToast }
  })

  it('按使用频率固定展示记账、记事项、记足迹，并复用现有填写页', () => {
    expect(QUICK_ADD_ACTIONS).toEqual([
      expect.objectContaining({
        key: 'ledger',
        label: '记账',
        icon: 'book',
        url: '/subpackages/ledger/ledger-add/index',
      }),
      expect.objectContaining({
        key: 'task',
        label: '记事项',
        icon: 'tags',
        url: '/subpackages/task/add-task/index',
      }),
      expect.objectContaining({
        key: 'footprint',
        label: '记足迹',
        icon: 'location',
        url: '/subpackages/footprint/footprint-form/index',
      }),
    ])
  })

  it('只在平台确认进入成功后报告成功，进入失败时允许用户重试', async () => {
    navigateTo.mockImplementationOnce((options) => options.success())
    await expect(navigateToQuickAdd(QUICK_ADD_ACTIONS[0])).resolves.toEqual({ ok: true })

    navigateTo.mockImplementationOnce((options) => options.fail())
    await expect(navigateToQuickAdd(QUICK_ADD_ACTIONS[1])).resolves.toEqual({
      ok: false,
      message: '暂时无法打开记事项，请稍后重试',
    })
  })

  it('保存后先返回原页面，再显示对应成功提示', async () => {
    navigateBack.mockImplementationOnce((options) => options.success())

    await expect(returnAfterQuickCreate('已记账')).resolves.toEqual({ ok: true })
    expect(showToast).toHaveBeenCalledWith({ title: '已记账', icon: 'success' })
  })

  it('返回失败时不伪装成功，也不再次写入数据', async () => {
    navigateBack.mockImplementationOnce((options) => options.fail())

    await expect(returnAfterQuickCreate('足迹已保存')).resolves.toEqual({
      ok: false,
      message: '内容已保存，请手动返回',
    })
    expect(showToast).toHaveBeenCalledWith({ title: '内容已保存，请手动返回', icon: 'none' })
  })

  // 开发者工具可以直接把新增页当作启动页；此时没有上一页，不能继续调用返回。
  it('直接打开新增页时，保存成功后进入指定兜底页', async () => {
    ;(globalThis as typeof globalThis & { getCurrentPages: () => unknown[] }).getCurrentPages = () => [{}]
    reLaunch.mockImplementationOnce((options) => options.success())

    await expect(returnAfterQuickCreate('已记账', '/pages/ledger/index')).resolves.toEqual({ ok: true })
    expect(navigateBack).not.toHaveBeenCalled()
    expect(reLaunch).toHaveBeenCalledWith(expect.objectContaining({ url: '/pages/ledger/index' }))
    expect(showToast).toHaveBeenCalledWith({ title: '已记账', icon: 'success' })
  })

  it('公共组件使用 Wot UI 悬浮按钮、遮罩与根节点承载，并包含防连点状态', () => {
    const component = readFileSync(resolve(__dirname, '../../src/components/GlobalQuickAdd.vue'), 'utf8')

    expect(component).toContain('<wd-root-portal')
    expect(component).toContain('<wd-overlay')
    expect(component).toContain('<wd-fab')
    expect(component).toContain('navigating')
    expect(component).toContain('打开快速新增')
    expect(component).toContain('关闭快速新增')
    // 保护视觉层级：三个按钮统一奶油白，最高频记账仅用深绿边框加强优先级。
    expect(component).toContain('global-quick-add__action--${action.key}')
    expect(component).toContain('ledger: `${ACTION_BASE_STYLE}')
    expect(component).toContain('task: `${ACTION_BASE_STYLE}')
    expect(component).toContain('footprint: `${ACTION_BASE_STYLE}')
    expect(component).toContain('global-quick-add__trigger')
    // 保护用户确认的紧凑尺寸和真实按钮间距，避免再次退回大按钮或按钮相贴。
    expect(component).toContain('width: 88rpx')
    expect(component).toContain('width: 156rpx')
    expect(component).toContain('height: 60rpx')
    expect(component).toContain('margin: 7rpx 0')
    expect(component).toContain('#267a5a')
    expect(component).toContain('#fff9f2')
    expect(component).toContain('#ffffff')
    expect(component).toContain('--wot-button-primary-bg')
    expect(component).toContain('background: rgba(41, 68, 58, 0.36)')
  })

  it('只在需求确认的十一个查看页面接入，不进入填写和管理页面', () => {
    const allowedPages = [
      'src/pages/index/index.vue',
      'src/pages/ledger/index.vue',
      'src/pages/footprint/index.vue',
      'src/pages/profile/index.vue',
      'src/subpackages/task/task-detail/index.vue',
      'src/subpackages/task/completed-tasks/index.vue',
      'src/subpackages/ledger/ledger-detail/index.vue',
      'src/subpackages/ledger/ledger-stats/index.vue',
      'src/subpackages/ledger/ledger-ai/index.vue',
      'src/subpackages/footprint/footprint-detail/index.vue',
      'src/subpackages/household/invite-status/index.vue',
    ]
    const excludedPages = [
      'src/pages/login/index.vue',
      'src/subpackages/task/add-task/index.vue',
      'src/subpackages/ledger/ledger-add/index.vue',
      'src/subpackages/footprint/footprint-form/index.vue',
      'src/subpackages/household/member-management/index.vue',
      'src/subpackages/ledger/ledger-category-manager/index.vue',
    ]

    for (const page of allowedPages) {
      expect(readFileSync(resolve(__dirname, `../../${page}`), 'utf8')).toContain('<GlobalQuickAdd')
    }
    for (const page of excludedPages) {
      expect(readFileSync(resolve(__dirname, `../../${page}`), 'utf8')).not.toContain('<GlobalQuickAdd')
    }
  })

  it('三个新建页返回发起页，编辑分支仍保持原有返回方式', () => {
    const task = readFileSync(resolve(__dirname, '../../src/subpackages/task/add-task/index.vue'), 'utf8')
    const ledger = readFileSync(
      resolve(__dirname, '../../src/subpackages/ledger/ledger-add/index.vue'),
      'utf8',
    )
    const footprint = readFileSync(
      resolve(__dirname, '../../src/subpackages/footprint/footprint-form/index.vue'),
      'utf8',
    )

    expect(task).toContain("await returnAfterQuickCreate('事项已添加')")
    expect(task).toContain("mode.value === 'edit'")
    expect(ledger).toContain("await returnAfterQuickCreate('已记账', '/pages/ledger/index')")
    expect(ledger).toContain('if (isEditMode.value && editingEntryId.value)')
    expect(footprint).toContain("await returnAfterQuickCreate('足迹已保存')")
    expect(footprint).toContain("toast.success('足迹已更新')")
  })
})
