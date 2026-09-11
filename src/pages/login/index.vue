<template>
  <!-- 启动页统一入口：恢复中 / 恢复失败 / 欢迎 / 邀请摘要 / 邀请终态。 -->
  <view class="welcome-page">
    <wd-toast />
    <view class="welcome-page__ornament welcome-page__ornament--top" />
    <view class="welcome-page__ornament welcome-page__ornament--bottom" />

    <!-- 已有标记的恢复状态：先显示小尺寸品牌区 + loading，不暴露登录按钮。 -->
    <view v-if="isRecovery" class="welcome-page__recovery" data-testid="login-recovery-loading">
      <LoginBrandHero compact />
      <wd-loading color="#267A5A" size="40rpx" />
      <text class="welcome-page__recovery-label">{{ view.loadingText || '正在确认登录状态' }}</text>
    </view>

    <!-- 已有标记的恢复失败：标题 + 错误 + 重试按钮。 -->
    <view v-else-if="isRecoveryFailed" class="welcome-page__recovery-error" data-testid="login-recovery-error">
      <text class="welcome-page__error-title">登录状态暂时无法确认</text>
      <text class="welcome-page__error-copy">{{ view.errorMessage }}</text>
      <wd-button
        block
        round
        variant="plain"
        :loading="authStore.isResolving"
        :disabled="authStore.isResolving"
        data-testid="login-recovery-retry"
        custom-class="welcome-page__retry"
        @click="handleRetry"
      >重新确认</wd-button>
    </view>

    <!-- 普通欢迎或邀请相关视图：品牌区 + 邀请摘要 + 协议 + 按钮组。 -->
    <view v-else class="welcome-page__content">
      <LoginBrandHero />
      <view v-if="view.mode === 'invite-summary'" class="welcome-page__invitation">
        <InvitationSummary :invitation="view.invitation" />
      </view>
      <view v-else-if="view.mode === 'invite-pending'" class="welcome-page__invite-pending">
        <wd-loading color="#267A5A" size="36rpx" />
        <text class="welcome-page__invite-pending-label">{{ view.loadingText }}</text>
      </view>
      <view v-else-if="view.mode === 'invite-terminal'" class="welcome-page__terminal" data-testid="login-invite-terminal">
        <text class="welcome-page__terminal-title">{{ view.terminalTitle }}</text>
        <text class="welcome-page__terminal-message">{{ view.terminalMessage }}</text>
      </view>
      <view v-else-if="view.mode === 'invite-failed'" class="welcome-page__invite-failed" data-testid="login-invite-failed">
        <text class="welcome-page__terminal-message">{{ view.errorMessage }}</text>
      </view>

      <!-- 协议勾选：仅 welcome / invite-summary 需要。父页面负责状态，点击事件向上传递。 -->
      <view v-if="view.showAgreement" class="welcome-page__agreement">
        <AgreementCheckbox :checked="agreed" :disabled="isStarting" @change="handleAgreementChange" @open-agreement="handleOpenAgreement" />
        <text class="welcome-page__hint" data-testid="login-agreement-hint">{{ view.agreementHint }}</text>
      </view>

      <view v-if="validationMessage" class="welcome-page__validation" data-testid="login-agreement-required">{{ validationMessage }}</view>

      <view class="welcome-page__actions">
        <WelcomeActions :primary="view.primary" :secondary="view.secondary" :primary-test-id="view.primaryTestId" @select="handleAction" />
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '../../store/modules/auth'
import { useInvitationStore } from '../../store/modules/invitation'
import LoginBrandHero from './components/LoginBrandHero.vue'
import InvitationSummary from './components/InvitationSummary.vue'
import AgreementCheckbox from './components/AgreementCheckbox.vue'
import WelcomeActions from './components/WelcomeActions.vue'
import { describeWelcomeView, type WelcomeAction, type WelcomeInvitationCard } from './welcome-view'
import type { EntryNotice } from '../../types/auth'

const authStore = useAuthStore()
const invitationStore = useInvitationStore()
const { hasCompletedLogin, isResolving, errorMessage, navigationIntent, pendingInviteToken, notice } = storeToRefs(authStore)
const { phase, preview, previewToken, errorMessage: inviteError, invitePreviewStatus } = storeToRefs(invitationStore)

/** 协议勾选本地状态：仅影响"开始使用"主按钮可用性。 */
const agreed = shallowRef(false)
/** 用户点过"开始使用"但未勾选时显示的受控提示。 */
const validationMessage = shallowRef('')
/** 处理中：云端开始使用调用进行中（用于禁用协议 + 防止重复点击）。 */
const isStarting = shallowRef(false)

/** 把 invitation store 的预览折叠成 welcome-view 期望的展示卡片；不持有任何凭证。 */
const invitationCard = computed<WelcomeInvitationCard | null>(() => {
  if (phase.value !== 'idle') return null
  if (!preview.value) return null
  return {
    inviterNickname: preview.value.inviter.nickname,
    inviterAvatar: preview.value.inviter.avatar,
    householdName: preview.value.household.name,
    memberCount: preview.value.household.memberCount,
  }
})

const isRecovery = computed(() => hasCompletedLogin.value && isResolving.value)
const isRecoveryFailed = computed(() => hasCompletedLogin.value && Boolean(errorMessage.value) && !isResolving.value)

/** 邀请状态对应的提示编号：与 entry-router 的 inviteNotices 对齐。 */
const inviteTerminalNotice = computed<EntryNotice | null>(() => {
  if (notice.value && ['invite_invalid', 'invite_expired', 'invite_used', 'home_full'].includes(notice.value)) {
    return notice.value
  }
  return null
})

const view = computed(() => describeWelcomeView({
  hasStartedUse: hasCompletedLogin.value,
  authResolving: isResolving.value,
  authErrorMessage: errorMessage.value,
  invitePhase: invitePreviewStatus.value,
  invitePreview: invitationCard.value,
  inviteErrorMessage: inviteError.value,
  inviteTerminalNotice: inviteTerminalNotice.value,
  agreementChecked: agreed.value,
}))

/**
 * 消费 Pinia 给出的单次页面去向，避免路由栈与启动页混杂。
 * 这是一个 watch 回调 + onShow 兜底：startUse 自己也会消费，但跨会话的残留 intent 仍需要清掉。
 */
function navigateIfReady(): void {
  const route = authStore.consumeNavigationIntent()
  if (route && route.url !== '/pages/login/index') {
    uni.reLaunch({ url: route.url })
  }
}

watch(navigationIntent, navigateIfReady)

/** 未开始用户 + 当前邀请未确认时触发一次预览；标记版本号避免迟到响应覆盖。 */
function maybePreviewInvite(): void {
  if (hasCompletedLogin.value) return
  if (!pendingInviteToken.value) return
  // 已有有效预览且 token 一致；不再重复请求
  if (preview.value && previewToken.value === pendingInviteToken.value && phase.value === 'idle') return
  if (phase.value === 'previewing') return
  void invitationStore.previewInvite(pendingInviteToken.value)
}

onShow(() => {
  // 已有标记先恢复；恢复期间不应触发邀请预览，避免在恢复中显示邀请摘要。
  if (hasCompletedLogin.value) {
    void authStore.restore()
    return
  }
  navigateIfReady()
  maybePreviewInvite()
})

function handleAgreementChange(checked: boolean): void {
  agreed.value = checked
  if (checked) validationMessage.value = ''
}

/** 打开协议正文：跳转到独立法律页面，返回时回到欢迎页。 */
function handleOpenAgreement(kind: 'agreement' | 'privacy'): void {
  uni.navigateTo({ url: `/pages/legal/index?kind=${kind}` })
}

/** 重试恢复：仅在已有标记时使用；邀请失败时由欢迎页 retry 走另一条路径。 */
function handleRetry(): void {
  if (!hasCompletedLogin.value) {
    if (pendingInviteToken.value) void invitationStore.previewInvite(pendingInviteToken.value)
    return
  }
  void authStore.retry()
}

/** 欢迎页按钮统一入口。 */
async function handleAction(action: Exclude<WelcomeAction, null>): Promise<void> {
  if (action === 'start-use') {
    // 防御性 busy 检查放最前：避免重复点击触发并发云端调用
    if (isStarting.value || isResolving.value) return
    // 协议未勾选时给出受控提示，不进入云端调用；此时 isStarting 仍为 false，无需清理
    if (!agreed.value) {
      validationMessage.value = '请先阅读并同意用户协议和隐私政策'
      return
    }
    // 进入真正的云端调用前再设 isStarting；配对 finally 保证状态机一致
    isStarting.value = true
    try {
      await authStore.startUse()
      const route = authStore.consumeNavigationIntent()
      if (route && route.url !== '/pages/login/index') {
        uni.reLaunch({ url: route.url })
      }
    } finally {
      isStarting.value = false
    }
    return
  }
  if (action === 'preview-experience') {
    uni.reLaunch({ url: '/pages/experience/index' })
    return
  }
  if (action === 'end-invite') {
    authStore.clearInviteToken()
    invitationStore.clearPreview()
    // 结束邀请后视图回到 welcome 模式，需要重新勾选协议；重置状态避免污染
    agreed.value = false
    return
  }
  if (action === 'retry') {
    // 限制：当前仅恢复会话或仅重试邀请预览，不同时处理。
    // 边角场景（已上线 + 有邀请 + 恢复失败）暂不支持；按 R27 优先级低于 R25。
    if (hasCompletedLogin.value) void authStore.retry()
    else if (pendingInviteToken.value) void invitationStore.previewInvite(pendingInviteToken.value)
  }
}
</script>

<style lang="scss" scoped>
.welcome-page {
  /* 页面背景与上下装饰；与原登录页一致。 */
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  padding: 64rpx 48rpx;
  box-sizing: border-box;
  background: $brand-color-background;

  &__content {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 620rpx;
    margin: 0 auto;
  }
  &__ornament {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
  }
  &__ornament--top {
    top: -106rpx;
    right: -82rpx;
    width: 246rpx;
    height: 246rpx;
    background: rgba($brand-color-primary, .14);
  }
  &__ornament--bottom {
    bottom: -74rpx;
    left: -58rpx;
    width: 168rpx;
    height: 168rpx;
    background: rgba($brand-color-accent, .13);
  }
  &__invitation {
    margin-top: 12rpx;
  }
  &__invite-pending {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-top: 28rpx;
  }
  &__invite-pending-label {
    margin-top: 12rpx;
    color: $brand-color-text-secondary;
    font-size: 26rpx;
  }
  &__invite-failed {
    margin-top: 24rpx;
  }
  &__terminal {
    margin-top: 24rpx;
    padding: 32rpx 28rpx;
    border: 2rpx solid $brand-color-border;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
    text-align: center;
  }
  &__terminal-title {
    display: block;
    color: $brand-color-text;
    font-size: 30rpx;
    font-weight: 700;
  }
  &__terminal-message {
    display: block;
    margin-top: 12rpx;
    color: $brand-color-text-secondary;
    font-size: 26rpx;
    line-height: 1.6;
  }
  &__agreement {
    margin-top: 36rpx;
  }
  &__hint {
    display: block;
    margin-top: 10rpx;
    color: $brand-color-text-secondary;
    font-size: 22rpx;
    line-height: 1.6;
  }
  &__validation {
    display: block;
    margin-top: 16rpx;
    color: #ba564b;
    font-size: 24rpx;
    line-height: 1.5;
  }
  &__actions {
    margin-top: 32rpx;
    /* 适配带 home indicator 的设备；键盘弹起时按钮仍可滚动到可视区 */
    padding-bottom: env(safe-area-inset-bottom);
  }
  &__recovery {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  &__recovery-label {
    margin-top: 28rpx;
    color: $brand-color-text-secondary;
    font-size: 28rpx;
  }
  &__recovery-error {
    position: relative;
    z-index: 1;
    margin: 0 auto;
    max-width: 620rpx;
    padding: 40rpx 32rpx;
    border: 2rpx solid $brand-color-border;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
    text-align: center;
  }
  &__error-title {
    display: block;
    color: $brand-color-text;
    font-size: 32rpx;
    font-weight: 700;
  }
  &__error-copy {
    display: block;
    margin-top: 16rpx;
    color: $brand-color-text-secondary;
    font-size: 26rpx;
    line-height: 1.65;
  }
  :deep(.welcome-page__retry) {
    height: 80rpx;
    margin-top: 28rpx;
    border-color: $brand-color-primary;
    background: $brand-color-surface;
    color: $brand-color-action;
    font-size: 28rpx;
  }

  @media (max-width: 640px) {
    padding-right: 40rpx;
    padding-left: 40rpx;
  }
}
</style>
