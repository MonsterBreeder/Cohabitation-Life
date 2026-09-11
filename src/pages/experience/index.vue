<template>
  <!-- 体验页：一页三段 + 吸顶提示 + 底部配套操作；所有数据来自本地 experience-view。 -->
  <view class="experience-page">
    <view class="experience-page__notice" data-testid="experience-notice">
      <text class="experience-page__notice-label">功能体验 · 示例数据不会保存</text>
    </view>

    <scroll-view class="experience-page__scroll" scroll-y>
      <view class="experience-page__section">
        <text class="experience-page__eyebrow">① 共同事项</text>
        <text class="experience-page__hint">试着认领或恢复示例，不会写入任何家庭。</text>
        <ExperienceTaskCard
          v-for="task in state.tasks"
          :key="task.id"
          :task="task"
          @toggle="handleTaskToggle"
        />
      </view>

      <view class="experience-page__section">
        <text class="experience-page__eyebrow">② 家庭账本</text>
        <text class="experience-page__hint">复用正式账本的金额规则；统计只在本页有效。</text>
        <ExperienceLedgerCard
          :categories="state.categories"
          :stats="state.stats"
          :disabled="false"
          :error-message="ledgerError"
          @submit="handleLedgerSubmit"
        />
      </view>

      <view class="experience-page__section">
        <text class="experience-page__eyebrow">③ 共同足迹</text>
        <text class="experience-page__hint">点击展开查看示例细节；所有内容均为本地占位。</text>
        <ExperienceFootprintCard
          v-for="footprint in state.footprints"
          :key="footprint.id"
          :footprint="footprint"
          @toggle="handleFootprintToggle"
        />
      </view>

      <view class="experience-page__footer" data-testid="experience-footer">
        <wd-button
          block
          round
          size="large"
          data-testid="experience-reset"
          custom-class="experience-page__reset"
          @click="handleReset"
        >恢复示例</wd-button>
        <view class="experience-page__actions">
          <wd-button
            block
            round
            variant="plain"
            data-testid="experience-back-welcome"
            custom-class="experience-page__secondary"
            @click="handleBackWelcome"
          >返回欢迎页</wd-button>
          <wd-button
            block
            round
            data-testid="experience-go-welcome"
            custom-class="experience-page__primary"
            @click="handleGoStart"
          >{{ startButtonLabel }}</wd-button>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ExperienceTaskCard from './components/ExperienceTaskCard.vue'
import ExperienceLedgerCard from './components/ExperienceLedgerCard.vue'
import ExperienceFootprintCard from './components/ExperienceFootprintCard.vue'
import {
  createExperienceState,
  resetExperienceState,
  submitExperienceEntry,
  toggleFootprint,
  toggleTaskClaim,
  type ExperienceState,
} from './experience-view'
import type { ExperienceEntryType } from '../../types/experience'

const state = shallowRef<ExperienceState>(createExperienceState())
const ledgerError = ref('')

// 底部按钮文案：协议确认在欢迎页，体验页只负责返回。
const startButtonLabel = computed(() => '开始使用')

/** 顶部吸顶：使用普通 view + sticky 样式即可，避免依赖额外组件。 */
function handleTaskToggle(taskId: string): void {
  state.value = toggleTaskClaim(state.value, taskId)
}

function handleFootprintToggle(footprintId: string): void {
  state.value = toggleFootprint(state.value, footprintId)
}

function handleLedgerSubmit(input: { type: ExperienceEntryType; amountText: string; categoryId: string }): void {
  const result = submitExperienceEntry(state.value, input)
  if (result.ok) {
    state.value = result.state
    ledgerError.value = ''
    return
  }
  ledgerError.value = result.error
}

/** 恢复示例：清空流水、收回所有事项、收起足迹。 */
function handleReset(): void {
  state.value = resetExperienceState()
  ledgerError.value = ''
}

/** 离开 / 进入页面时按规则重置体验状态：reLaunch 后 onShow 会重新触发，确保新会话从初始示例开始。 */
onShow(() => { state.value = createExperienceState() })

function handleBackWelcome(): void {
  // 邀请仍由 auth store 暂存，欢迎页会读 pendingInviteToken 决定视图
  uni.reLaunch({ url: '/pages/login/index' })
}

function handleGoStart(): void {
  // 协议确认已统一在欢迎页，体验页只负责回到欢迎页让用户完成确认与提交。
  uni.reLaunch({ url: '/pages/login/index' })
}
</script>

<style lang="scss" scoped>
.experience-page {
  /* 体验页：吸顶提示 + 可滚动主体 + 底部固定操作。 */
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: $brand-color-background;

  &__notice {
    position: sticky;
    top: 0;
    z-index: 10;
    padding: 14rpx 32rpx;
    background: rgba($brand-color-primary, .12);
  }
  &__notice-label {
    color: $brand-color-action;
    font-size: 24rpx;
    font-weight: 700;
  }
  &__scroll {
    flex: 1;
    padding: 24rpx 32rpx 96rpx;
    box-sizing: border-box;
  }
  &__section {
    margin-top: 16rpx;
  }
  &__eyebrow {
    display: block;
    margin-bottom: 8rpx;
    color: $brand-color-primary;
    font-size: 24rpx;
    font-weight: 700;
    letter-spacing: 3rpx;
  }
  &__hint {
    display: block;
    margin-bottom: 16rpx;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
    line-height: 1.6;
  }
  &__footer {
    margin-top: 32rpx;
  }
  &__actions {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    margin-top: 16rpx;
  }
  :deep(.experience-page__reset) {
    height: 80rpx;
    background: $brand-color-action;
    color: #ffffff;
    font-size: 28rpx;
    font-weight: 700;
  }
  :deep(.experience-page__secondary) {
    height: 80rpx;
    border-color: $brand-color-primary;
    color: $brand-color-action;
    background: $brand-color-surface;
    font-size: 28rpx;
  }
  :deep(.experience-page__primary) {
    height: 96rpx;
    background: $brand-color-action;
    color: #ffffff;
    font-size: 30rpx;
    font-weight: 700;
  }
}
</style>
