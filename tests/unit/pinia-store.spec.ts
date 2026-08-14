import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../../src/store/modules/auth'
import { useTaskStore } from '../../src/store/modules/task'

// 保护两个状态文件都由 Pinia 创建，并完整暴露自身响应式状态。
describe('Pinia stores', () => {
  beforeEach(() => {
    // 每个测试使用独立 Pinia，避免状态在用例之间互相影响。
    setActivePinia(createPinia())
  })

  it('registers the task store and exposes its U3 full state', () => {
    const store = useTaskStore()

    expect(store.$id).toBe('task')
    // U3 state shape: current / detail / completedItems / pending / phase / errorMessage / authoritativeRevision
    expect(store.$state).toHaveProperty('current')
    expect(store.$state).toHaveProperty('phase')
    expect(store.$state).toHaveProperty('authoritativeRevision')
    expect(store.completedItems).toEqual([])
  })

  it('registers the auth store and exposes every reactive state field', () => {
    const store = useAuthStore()

    expect(store.$id).toBe('auth')
    expect(Object.keys(store.$state).sort()).toEqual([
      'errorMessage',
      'hasCompletedLogin',
      'isResolving',
      'lastIntent',
      'navigationIntent',
      'notice',
      'pendingInviteToken',
    ])
  })
})
