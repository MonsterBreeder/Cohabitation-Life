/**
 * 全局快速新增的动作定义与导航工具。
 * 动作顺序是产品规则的一部分：数组第一项会显示在离加号最近的位置。
 */
export type QuickAddKey = 'ledger' | 'task' | 'footprint'

export interface QuickAddAction {
  key: QuickAddKey
  label: string
  icon: string
  url: string
}

export interface QuickAddNavigationResult {
  ok: boolean
  message?: string
}

/** 记账是最高频动作，必须保持第一；Wot UI 向上展开时第一项离触发按钮最近。 */
export const QUICK_ADD_ACTIONS: readonly QuickAddAction[] = [
  {
    key: 'ledger',
    label: '记账',
    icon: 'book',
    url: '/subpackages/ledger/ledger-add/index',
  },
  {
    key: 'task',
    label: '记事项',
    icon: 'tags',
    url: '/subpackages/task/add-task/index',
  },
  {
    key: 'footprint',
    label: '记足迹',
    icon: 'location',
    url: '/subpackages/footprint/footprint-form/index',
  },
]

/**
 * 保留当前页面栈进入现有填写页；只有平台确认失败时才允许组件在原页提示重试。
 */
export function navigateToQuickAdd(action: QuickAddAction): Promise<QuickAddNavigationResult> {
  return new Promise((resolve) => {
    uni.navigateTo({
      url: action.url,
      success: () => resolve({ ok: true }),
      fail: () => resolve({ ok: false, message: `暂时无法打开${action.label}，请稍后重试` }),
    })
  })
}

/**
 * 新建成功后只返回一级，确保回到真正的发起页面。
 * 开发者工具直接把新增页当作启动页时没有上一页，改为进入业务首页。
 * 导航失败时数据已经保存，不能重试保存，只提示用户手动返回。
 */
export function returnAfterQuickCreate(
  successMessage: string,
  fallbackUrl?: string,
): Promise<QuickAddNavigationResult> {
  return new Promise((resolve) => {
    const onSuccess = (): void => {
      uni.showToast({ title: successMessage, icon: 'success' })
      resolve({ ok: true })
    }
    const onFailure = (): void => {
      const message = '内容已保存，请手动返回'
      uni.showToast({ title: message, icon: 'none' })
      resolve({ ok: false, message })
    }

    // 直接调试分包页时页面栈只有一层，调用 navigateBack 会让微信运行时读取空页面。
    if (fallbackUrl && getCurrentPages().length <= 1) {
      uni.reLaunch({ url: fallbackUrl, success: onSuccess, fail: onFailure })
      return
    }

    uni.navigateBack({
      delta: 1,
      success: onSuccess,
      fail: onFailure,
    })
  })
}
