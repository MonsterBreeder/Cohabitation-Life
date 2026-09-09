<template>
  <!-- 公共入口需要覆盖地图和固定底栏，因此由 Wot UI 根节点承载统一提升层级。 -->
  <wd-root-portal v-if="canRender">
    <view class="global-quick-add">
      <wd-overlay
        :show="active"
        :duration="200"
        :z-index="1000"
        lock-scroll
        custom-class="global-quick-add__overlay"
        custom-style="background: rgba(41, 68, 58, 0.36);"
        data-testid="global-quick-add-overlay"
        @click="closeMenu"
      />

      <wd-fab
        v-model:active="active"
        type="primary"
        position="right-bottom"
        direction="top"
        :disabled="navigating"
        :gap="fabGap"
        :z-index="1001"
        :aria-label="active ? '关闭快速新增' : '打开快速新增'"
        :aria-busy="navigating"
        custom-class="global-quick-add__fab"
        data-testid="global-quick-add"
      >
        <!-- Wot UI 开放的触发器插槽用于承载品牌按钮，避免根节点样式隔离把主题绿还原成默认蓝。 -->
        <template #trigger="{ disabled }">
          <view
            class="global-quick-add__trigger"
            :class="{ 'global-quick-add__trigger--disabled': disabled }"
            role="button"
            :aria-label="active ? '关闭快速新增' : '打开快速新增'"
            @click.stop="toggleMenu"
          >
            <wd-icon :name="active ? 'close' : 'plus'" size="40rpx" color="#ffffff" />
          </view>
        </template>

        <!-- 数组第一项会被 Wot UI 放在最靠近加号的位置，顺序不能在页面内重排。 -->
        <wd-button
          v-for="action in QUICK_ADD_ACTIONS"
          :key="action.key"
          round
          type="primary"
          size="small"
          :icon="action.icon"
          :disabled="navigating"
          :aria-label="action.label"
          :custom-class="`global-quick-add__action global-quick-add__action--${action.key}`"
          :custom-style="ACTION_THEME_STYLES[action.key]"
          :data-testid="`global-quick-add-${action.key}`"
          @click.stop="handleAction(action)"
        >
          {{ action.label }}
        </wd-button>
      </wd-fab>
    </view>
  </wd-root-portal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import {
  QUICK_ADD_ACTIONS,
  navigateToQuickAdd,
  type QuickAddAction,
  type QuickAddKey,
} from '../utils/quick-add'

interface Props {
  visible: boolean
  blocked?: boolean
  withTabBar?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  blocked: false,
  withTabBar: false,
})

// 展开与跳转锁只属于当前页面实例，不进入全局状态，返回页面后可继续正常使用。
const active = shallowRef(false)
const navigating = shallowRef(false)
const canRender = computed(() => props.visible && !props.blocked)
const fabGap = computed(() => ({ right: 32, bottom: props.withTabBar ? 104 : 24 }))

// 尺寸、间距和主题色直接交给 Wot UI 按钮根元素，避免微信样式隔离导致按钮再次相贴或变回默认色。
const ACTION_BASE_STYLE = 'box-sizing: border-box; width: 156rpx; height: 60rpx; min-width: 156rpx; margin: 7rpx 0; padding: 0 16rpx; border-radius: 999rpx; background: #fff9f2; color: #267a5a; font-size: 23rpx; box-shadow: 0 6rpx 16rpx rgba(41, 68, 58, 0.12);'
const ACTION_THEME_STYLES: Readonly<Record<QuickAddKey, string>> = {
  ledger: `${ACTION_BASE_STYLE} --wot-button-primary-bg: #fff9f2; --wot-button-primary-bg-active: #effbf5; --wot-button-main-color: #267a5a; border: 2rpx solid #267a5a; font-weight: 600;`,
  task: `${ACTION_BASE_STYLE} --wot-button-primary-bg: #fff9f2; --wot-button-primary-bg-active: #effbf5; --wot-button-main-color: #267a5a; border: 2rpx solid #e4ece7;`,
  footprint: `${ACTION_BASE_STYLE} --wot-button-primary-bg: #fff9f2; --wot-button-primary-bg-active: #effbf5; --wot-button-main-color: #267a5a; border: 2rpx solid #e4ece7;`,
}

/** 页面进入加载、失败或其他弹层时，菜单和遮罩必须同时消失。 */
watch(canRender, (value) => {
  if (!value) closeMenu()
})

function closeMenu(): void {
  active.value = false
}

/** 自定义品牌触发器只负责切换菜单，跳转期间保持锁定，防止连续点击。 */
function toggleMenu(): void {
  if (navigating.value) return
  active.value = !active.value
}

/** 第一次点击结束前锁住其他动作，避免同时打开多个填写页。 */
async function handleAction(action: QuickAddAction): Promise<void> {
  if (navigating.value) return
  navigating.value = true
  closeMenu()
  const result = await navigateToQuickAdd(action)
  navigating.value = false
  if (!result.ok && result.message) {
    uni.showToast({ title: result.message, icon: 'none' })
  }
}

onBeforeUnmount(() => {
  closeMenu()
  navigating.value = false
})
</script>

<style lang="scss" scoped>
.global-quick-add {
  // 自定义触发器仍由 Wot UI 悬浮容器定位，只负责稳定呈现项目的行动绿。
  &__trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 88rpx;
    height: 88rpx;
    border-radius: 50%;
    background: $brand-color-action;
    box-shadow: 0 8rpx 20rpx rgba($brand-color-action, 0.2);
    transition: transform 160ms ease, opacity 160ms ease;

    &:active {
      transform: scale(0.96);
    }

    &--disabled {
      opacity: 0.56;
    }
  }

  // 动作使用胶囊按钮同时呈现图标和文字，窄屏下仍保留清晰触区和按压反馈。
  :deep(.global-quick-add__action) {
    width: 156rpx !important;
    min-width: 156rpx !important;
    height: 60rpx !important;
    margin: 7rpx 0;
    padding: 0 16rpx !important;
    border-radius: 999rpx !important;
    box-shadow: 0 6rpx 16rpx rgba($brand-color-text, 0.12);
    font-size: 23rpx !important;
    white-space: nowrap;
    transition: transform 160ms ease, box-shadow 160ms ease;

    &:active {
      transform: scale(0.97);
      box-shadow: 0 4rpx 12rpx rgba($brand-color-text, 0.1);
    }
  }

}
</style>
