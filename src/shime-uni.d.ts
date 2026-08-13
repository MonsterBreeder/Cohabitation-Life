export {}

// 本文件为 uni-app 页面和应用生命周期补充 Vue 类型声明。

declare module "vue" {
  type Hooks = App.AppInstance & Page.PageInstance;
  interface ComponentCustomOptions extends Hooks {}
}
