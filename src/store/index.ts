import { createPinia } from 'pinia'

// 全站只创建一个 Pinia 实例，页面内外都使用同一个状态容器。
const store = createPinia()

export { store }

export default store
