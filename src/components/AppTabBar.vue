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
    <!-- 账本 tab：用 emoji 📒 直接渲染（不依赖 Wot UI 的 iconfont 字体） -->
    <wd-tabbar-item name="ledger" title="账本">
      <template #icon>
        <text class="app-tabbar__emoji" :class="active === 'ledger' ? 'is-active' : 'is-inactive'">📒</text>
      </template>
    </wd-tabbar-item>
    <wd-tabbar-item name="mine" title="我的" icon="user" />
  </wd-tabbar>
</template>

<script setup lang="ts">
type TabName = 'home' | 'ledger' | 'mine'

interface Props { active: TabName }
const props = defineProps<Props>()

/** 三个主入口 tab 路径表。ledger 主入口在主包 /pages/ledger/，其他 ledger 子页面在 subpackages/ledger/。 */
const TAB_PATHS: Record<TabName, string> = {
  home: '/pages/index/index',
  ledger: '/pages/ledger/index',
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
/* 底部导航使用圆角悬浮样式，与卡片和暖色背景保持同一视觉语言。 */
/* emoji 图标：跟着 active 状态切色（绿色激活 / 灰色未激活），与 Wot UI 的 wd-icon 行为一致。 */
.app-tabbar__emoji {
  display: inline-block;
  font-size: 40rpx;
  line-height: 1;
}
.app-tabbar__emoji.is-active { color: #267a5a; }
.app-tabbar__emoji.is-inactive { color: #74847d; }
</style>
