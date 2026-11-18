<!-- 文件用途：展示聊天开场与对应业务的例句，点选后只回填输入框。 -->
<template>
  <view class="life-chat-welcome" data-testid="life-chat-welcome">
    <view class="life-chat-welcome__intro">
      <view class="life-chat-welcome__greeting">
        <view class="life-chat-welcome__brand">
          <image class="life-chat-welcome__logo" src="/static/brand/logo.png" mode="aspectFit" />
          <text>睦录</text>
        </view>
        <text class="life-chat-welcome__title">{{ welcome.title }}</text>
        <text class="life-chat-welcome__copy">{{ welcome.copy }}</text>
      </view>
      <image class="life-chat-welcome__art" :src="welcome.art" mode="aspectFit" aria-hidden="true" />
    </view>

    <!-- 整行都是点按区，加号表示把例句加入输入框。 -->
    <view class="life-chat-welcome__hint">
      <text class="life-chat-welcome__hint-title">试着说一句</text>
      <text>点选填入输入框</text>
    </view>
    <view class="life-chat-welcome__examples">
      <wd-button
        v-for="example in welcome.examples"
        :key="example.text"
        block
        variant="text"
        custom-class="life-chat-welcome__example-button"
        :disabled="disabled"
        @click="emit('choose', example.text)"
      >
        <view class="life-chat-welcome__row">
          <view
            class="life-chat-welcome__icon"
            :class="`life-chat-welcome__icon--${example.tone}`"
            aria-hidden="true"
          >
            <wd-icon :name="example.icon" size="36rpx" />
          </view>
          <view class="life-chat-welcome__example">
            <text class="life-chat-welcome__example-title">{{ example.title }}</text>
            <text class="life-chat-welcome__example-text">{{ example.text }}</text>
          </view>
          <view class="life-chat-welcome__add" aria-hidden="true"><wd-icon name="plus" size="26rpx" /></view>
        </view>
      </wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { LifeChatScope } from '../../../../utils/life-chat-entry'

// 页面拥有输入和请求状态，开场只返回用户点选的例句。
const props = defineProps<{ scope: LifeChatScope; disabled: boolean }>()
const emit = defineEmits<{ choose: [text: string] }>()

// 通用入口和业务入口共用例句，文案和图标对应同一个动作。
const lookup = { title: '查账', text: '本月餐饮花了多少', icon: 'book', tone: 'mint' }
const bookkeeping = { title: '记账', text: '昨天我午饭花了 50 元', icon: 'book', tone: 'mint' }
const task = { title: '记事项', text: '记一下周五交电费', icon: 'edit', tone: 'sand' }
const footprint = { title: '记足迹', text: '记一下昨天去了西湖', icon: 'location', tone: 'peach' }

const welcomes = {
  all: {
    title: '想记点什么？',
    copy: '查查账、记件事，\n也能留下去过的地方。',
    art: '/static/warm-life/objects/home-cups.png',
    examples: [lookup, task, footprint],
  },
  ledger: {
    title: '聊聊家里的账',
    copy: '查收支、记一笔，\n也能修改自己记的账。',
    art: '/static/warm-life/scenes/empty-ledger.png',
    examples: [lookup, bookkeeping],
  },
  task: {
    title: '记下一件小事',
    copy: '可以新增事项，\n也能修改或删除已有事项。',
    art: '/static/warm-life/scenes/empty-tasks.png',
    examples: [task],
  },
  footprint: {
    title: '最近去了哪里？',
    copy: '记下去过的地方，\n也能修改或删除已有足迹。',
    art: '/static/warm-life/scenes/empty-footprint.png',
    examples: [footprint],
  },
}
const welcome = computed(() => welcomes[props.scope])
</script>

<style lang="scss" scoped>
.life-chat-welcome {
  margin-bottom: 32rpx;

  // 开场借用首页的手绘物件，旁边留出足够空间给标题和说明。
  &__intro {
    display: flex;
    align-items: center;
    gap: 16rpx;
    padding: 24rpx 10rpx 38rpx;
    animation: life-chat-welcome-enter 200ms ease-out both;
  }
  @keyframes life-chat-welcome-enter {
    from {
      opacity: 0;
      transform: translateY(6rpx);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  &__greeting {
    flex: 1;
    min-width: 0;
  }
  &__brand {
    display: flex;
    align-items: center;
    gap: 10rpx;
    color: $brand-color-action;
    font-weight: 600;
    font-size: 24rpx;
  }
  &__logo {
    width: 44rpx;
    height: 44rpx;
    flex: none;
  }
  &__title {
    display: block;
    margin-top: 12rpx;
    color: $brand-color-text;
    font-size: 46rpx;
    font-weight: 700;
    line-height: 1.28;
  }
  &__copy {
    display: block;
    margin-top: 12rpx;
    color: #536b60;
    font-size: 26rpx;
    line-height: 1.6;
    white-space: pre-line;
  }
  &__art {
    flex: none;
    width: 206rpx;
    height: 164rpx;
  }

  // 三种动作共用一张清单，按压反馈只落在当前例句。
  &__hint {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 16rpx;
    padding: 0 10rpx 14rpx;
    font-size: 23rpx;
    color: #536b60;
  }
  &__hint-title {
    color: $brand-color-text;
    font-size: 26rpx;
    font-weight: 600;
  }
  &__examples {
    padding: 4rpx 18rpx;
    border: 1rpx solid $brand-color-border;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
  }
  :deep(.life-chat-welcome__example-button) {
    height: auto;
    padding: 0;
    border-radius: 12rpx;
    background: transparent;
    line-height: 1.45;
    text-align: left;
    white-space: normal;
    &:focus-visible {
      outline: 2rpx solid $brand-color-action;
      outline-offset: -2rpx;
    }
  }
  :deep(.life-chat-welcome__example-button .wd-button__text) {
    width: 100%;
  }
  :deep(.life-chat-welcome__example-button + .life-chat-welcome__example-button) {
    border-top: 1rpx solid $brand-color-border;
  }
  :deep(.life-chat-welcome__example-button:not(.is-disabled):active),
  :deep(.life-chat-welcome__example-button.wd-button--active) {
    background: #f1f7f2;
  }
  &__row {
    display: flex;
    align-items: center;
    gap: 17rpx;
    padding: 18rpx 6rpx;
  }
  &__icon {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 68rpx;
    height: 68rpx;
    border-radius: 18rpx;
    color: $brand-color-action;
    &--mint {
      background: #e6f3ea;
    }
    &--sand {
      background: #f7efdc;
      color: #785721;
    }
    &--peach {
      background: #fbece5;
      color: #94543a;
    }
  }
  &__example {
    flex: 1;
    min-width: 0;
  }
  &__example-title {
    display: block;
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 600;
  }
  &__example-text {
    display: block;
    color: #536b60;
    font-size: 24rpx;
    margin-top: 4rpx;
    overflow-wrap: anywhere;
  }
  &__add {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 46rpx;
    height: 46rpx;
    color: $brand-color-action;
    border-radius: 50%;
    background: #edf5ee;
  }
  @media (prefers-reduced-motion: reduce) {
    &__intro {
      animation: none;
    }
  }
}
</style>
