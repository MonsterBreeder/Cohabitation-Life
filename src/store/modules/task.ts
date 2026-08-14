import { defineStore } from 'pinia'
import type { CurrentTasks } from '../../types/task'
import store from '..'

// U1 占位：仅定义 state 形状与 getters 的入口。
// U3 会用真实云端数据、in-flight 保护、操作凭证和重试逻辑重写整个 store。
// 这里的空壳只为了让引用 task store 的地方能 typecheck 通过。

interface TaskStoreState {
  /** 当前家庭未终止事项的分组：priority + 三个类型分组。 */
  current: CurrentTasks | undefined
  /** 是否已加载过；首页刷新时不闪烁。 */
  hasLoaded: boolean
}

/** 首页事项状态，采用参考项目一致的对象式 Pinia 写法。U3 重写。 */
export const useTaskStore = defineStore('task', {
  state: (): TaskStoreState => ({
    current: undefined,
    hasLoaded: false,
  }),
  getters: {
    /** 当前是否有未终止事项。 */
    hasOpenTasks: (state) => Boolean(state.current && (state.current.priority.length > 0
      || state.current.groups.low_stock.length > 0
      || state.current.groups.to_handle.length > 0
      || state.current.groups.expiring.length > 0)),
    /** 优先处理分组。 */
    priorityTasks: (state) => state.current?.priority ?? [],
    /** 快没了分组。 */
    lowStockTasks: (state) => state.current?.groups.low_stock ?? [],
    /** 待处理分组。 */
    waitingTasks: (state) => state.current?.groups.to_handle ?? [],
    /** 快到期分组。 */
    expiringTasks: (state) => state.current?.groups.expiring ?? [],
  },
  actions: {
    /** U1 占位：清空当前家庭的事项引用。U3 会重写。 */
    resetForHouseholdChange(): void {
      this.current = undefined
      this.hasLoaded = false
    },
  },
})

/** 在组件 setup 之外使用事项状态。 */
export function useTaskStoreWithOut() {
  return useTaskStore(store)
}
