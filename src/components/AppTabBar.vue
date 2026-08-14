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
    <wd-tabbar-item name="mine" title="我的" icon="user" />
  </wd-tabbar>
</template>

<script setup lang="ts">
type TabName = 'home' | 'mine'

interface Props { active: TabName }
const props = defineProps<Props>()

/** 底部入口只负责主页面切换，编辑和成员操作仍进入家庭分包页面。 */
function handleChange(event: { value: TabName }): void {
  if (event.value === props.active) return
  uni.reLaunch({ url: event.value === 'home' ? '/pages/index/index' : '/pages/profile/index' })
}
</script>

<style lang="scss" scoped>
/* 底部导航使用圆角悬浮样式，与卡片和暖色背景保持同一视觉语言。 */
</style>
