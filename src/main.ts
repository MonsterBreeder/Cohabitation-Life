import { createSSRApp } from 'vue'
import App from './App.vue'
import store from './store'

// 应用入口负责创建 Vue 实例并安装全局状态容器。
/**
 * 创建 uni-app 应用，并在任何页面使用状态前完成 Pinia 注册。
 * 同时返回 pinia 实例，保证微信小程序运行时能够正确接管状态容器。
 */
export function createApp() {
  const app = createSSRApp(App)

  app.use(store)

  return {
    app,
  }
}
