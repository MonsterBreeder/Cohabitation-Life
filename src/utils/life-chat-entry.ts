// 文件用途：统一四种聊天入口；同一构建明确启用后才显示新入口。
// #ifdef H5
import { shallowRef } from 'vue'
// #endif

export type LifeChatScope = 'all' | 'ledger' | 'task' | 'footprint'

export const lifeChatEnabled = import.meta.env.VITE_MULU_LIFE_CHAT === '1'

/** 扫码包使用独立服务，普通构建仍连接原聊天服务。 */
export const lifeChatPreview = import.meta.env.VITE_MULU_LIFE_CHAT_PREVIEW === '1'

// #ifdef H5
// 网页旧页的全局浮层仍然可见，进入聊天时主动收起。微信的旧页由原生导航隐藏。
export const lifeChatPresented = shallowRef(false)
// #endif

/** 只有固定的栏目会被带到聊天页，原表单的数据不会进入路由。 */
export function lifeChatUrl(scope: LifeChatScope, example?: 'ledger-create'): string {
  return `/subpackages/ledger/life-chat/index?scope=${scope}${example ? `&example=${example}` : ''}`
}
