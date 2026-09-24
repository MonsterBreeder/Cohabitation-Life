<template>
  <wd-tabbar
    :model-value="active"
    fixed
    placeholder
    safe-area-inset-bottom
    shape="round"
    active-color="#267a5a"
    inactive-color="#74847d"
    @change="handleChange"
  >
    <wd-tabbar-item
      v-for="item in TAB_ITEMS"
      :key="item.name"
      :name="item.name"
      :title="item.title"
      :icon="item.icon"
    />
  </wd-tabbar>
</template>

<script setup lang="ts">
import { TAB_ITEMS, tabDestination, type TabName } from './app-tabbar'

interface Props {
  active: TabName
}
const props = defineProps<Props>()

/** 底部入口只负责主页面切换，编辑和成员操作仍进入家庭分包页面。 */
function handleChange(event: { value: TabName }): void {
  const url = tabDestination(props.active, event.value)
  if (!url) return
  uni.reLaunch({ url })
}
</script>

<style lang="scss" scoped>
.app-tabbar {
  /* 底部导航使用圆角悬浮样式，与卡片和暖色背景保持同一视觉语言。
   颜色 / 圆角等由 Wot UI 的 wd-tabbar / wd-tabbar-item 自身控制，这里不放具体数值。 */
  /* 占位规则：保证 Vue 编译器输出 AppTabBar.wxss（不能完全空否则 Wot UI 内部 require 会找不到文件） */
  &__placeholder {
    display: none;
  }
}
</style>
