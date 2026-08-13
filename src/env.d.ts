/// <reference types="vite/client" />

// 本文件加载 Vite 提供的全局类型声明，不包含业务状态。

declare module '*.vue' {
  import { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>
  export default component
}
