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
    <wd-tabbar-item name="home" title="首页" icon="home" />
    <!-- 账本 tab：用 Wot UI 的 'book' 图标（线稿风，与 home / mine 风格一致） -->
    <wd-tabbar-item name="ledger" title="账本" icon="book" />
    <!-- 足迹使用已确认有字形的 location 线稿图标，保持四个入口风格一致。 -->
    <wd-tabbar-item name="footprint" title="足迹" icon="location" />
    <!-- 生活承载固定的共同生活应用，apps 图标与现有线稿风格一致。 -->
    <wd-tabbar-item name="life" title="生活" icon="apps" />
    <wd-tabbar-item name="mine" title="我的" icon="user" />
  </wd-tabbar>
</template>

<script setup lang="ts">
type TabName = 'home' | 'ledger' | 'footprint' | 'life' | 'mine'

interface Props {
  active: TabName
}
const props = defineProps<Props>()

/** 五个主入口路径表；完整业务编辑页继续放入对应分包。 */
const TAB_PATHS: Record<TabName, string> = {
  home: '/pages/index/index',
  ledger: '/pages/ledger/index',
  footprint: '/pages/footprint/index',
  life: '/pages/life/index',
  mine: '/pages/profile/index',
}

/** 底部入口只负责主页面切换，编辑和成员操作仍进入家庭分包页面。 */
function handleChange(event: { value: TabName }): void {
  if (event.value === props.active) return
  const url = TAB_PATHS[event.value]
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
