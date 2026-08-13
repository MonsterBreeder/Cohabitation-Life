import { defineStore } from 'pinia'
import type { Task } from '../../types/task'
import store from '..'

// 当前事项仅用于首页原型展示，后续事项模块会改为云端数据。
const initialTasks: Task[] = [
  { id: '1', title: '买洗衣液', type: 'low_stock', dueLabel: '今天', statusLabel: '待认领', isToday: true },
  { id: '2', title: '联系房东续租', type: 'to_handle', dueLabel: '8 月 18 日前', statusLabel: '待处理' },
  { id: '3', title: '更换净水器滤芯', type: 'expiring', dueLabel: '8 月 20 日到期', statusLabel: '待处理' },
]

/** 首页事项状态，采用参考项目一致的对象式 Pinia 写法。 */
export const useTaskStore = defineStore('task', {
  state: () => ({
    /** 是否已经加入家庭 */
    hasHome: false,
    /** 首页原型的原始事项列表 */
    tasks: initialTasks as Task[],
  }),
  getters: {
    /** 所有未完成事项 */
    pendingTasks: (state) => state.tasks.filter((task) => task.statusLabel !== '已完成'),
    /** 今天需要处理的事项 */
    todayTasks(): Task[] {
      return this.pendingTasks.filter((task) => task.isToday)
    },
    /** 库存不足事项 */
    lowStockTasks(): Task[] {
      return this.pendingTasks.filter((task) => task.type === 'low_stock')
    },
    /** 等待处理事项 */
    waitingTasks(): Task[] {
      return this.pendingTasks.filter((task) => task.type === 'to_handle')
    },
    /** 即将到期事项 */
    expiringTasks(): Task[] {
      return this.pendingTasks.filter((task) => task.type === 'expiring')
    },
  },
})

/** 在组件 setup 之外使用事项状态。 */
export function useTaskStoreWithOut() {
  return useTaskStore(store)
}
