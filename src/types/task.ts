// 首页原型使用的最小事项结构，真实云端模型留给事项模块定义。
export type TaskType = 'low_stock' | 'to_handle' | 'expiring'

export interface Task { id: string; title: string; type: TaskType; dueLabel: string; statusLabel: string; isToday?: boolean }
