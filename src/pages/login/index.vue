<template>
  <!-- 首次用户看到登录操作，已有登录记录的用户只看到安全恢复状态。 -->
  <view class="login-page">
    <!-- Wot UI 的提示挂载点只服务当前登录页面。 -->
    <wd-toast />
    <view class="login-page__ornament login-page__ornament--top" />
    <view class="login-page__ornament login-page__ornament--bottom" />

    <view v-if="isCheckingSession" class="login-page__recovery" data-testid="login-recovery-loading">
      <LoginBrandHero compact />
      <wd-loading color="#267A5A" size="40rpx" />
      <text class="login-page__recovery-label">正在确认登录状态</text>
    </view>

    <view v-else class="login-page__content">
      <LoginBrandHero />

      <view v-if="isRecoveryFailure" class="login-page__recovery-error" data-testid="login-recovery-error">
        <text class="login-page__error-title">登录状态暂时无法确认</text>
        <text class="login-page__error-copy">{{ errorMessage }}</text>
        <wd-button
          block
          round
          variant="plain"
          :loading="isResolving"
          :disabled="isResolving"
          custom-class="login-page__retry"
          @click="retryRecovery"
        >重新确认</wd-button>
      </view>

      <view v-else class="login-page__actions">
        <AgreementCheckbox :checked="agreed" :disabled="isResolving" @change="handleAgreementChange" />
        <text v-if="agreementRequired" class="login-page__validation" data-testid="agreement-required">请先阅读并同意用户协议和隐私政策</text>
        <wd-button
          block
          round
          size="large"
          data-testid="login-submit"
          :loading="isResolving"
          :disabled="isResolving"
          custom-class="login-page__submit"
          @click="handleLogin"
        >
          {{ isResolving ? '正在登录…' : '微信快捷登录' }}
        </wd-button>
        <text v-if="errorMessage" class="login-page__request-error" data-testid="login-request-error">{{ errorMessage }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { onShow } from '@dcloudio/uni-app'
import { useToast } from '@wot-ui/ui'
// 登录页专用展示组件与页面就近存放，避免误当成全局公共组件。
import AgreementCheckbox from './components/AgreementCheckbox.vue'
import LoginBrandHero from './components/LoginBrandHero.vue'
import { useAuthStore } from '../../store/modules/auth'

const authStore = useAuthStore()
const toast = useToast()
// 页面拆出的响应式状态必须使用 storeToRefs，避免丢失 Pinia 响应。
const { errorMessage, hasCompletedLogin, isResolving, navigationIntent } = storeToRefs(authStore)
// 页面本地状态不放入 Pinia，因为只在当前登录页有效。
const agreed = shallowRef(false)
const agreementRequired = shallowRef(false)
const isCheckingSession = shallowRef(hasCompletedLogin.value)
const isRecoveryFailure = computed(() => hasCompletedLogin.value && Boolean(errorMessage.value))

/** 消费 Pinia 给出的单次页面去向。 */
function navigateIfReady(): void {
  const route = authStore.consumeNavigationIntent()
  if (route && route.url !== '/pages/login/index') {
    uni.reLaunch({ url: route.url })
  }
}

/** 同步协议勾选并清除旧的校验提示。 */
function handleAgreementChange(checked: boolean): void {
  agreed.value = checked
  if (checked) agreementRequired.value = false
}

/** 发起主动登录并在成功后执行统一分流。 */
async function resolveLogin(): Promise<void> {
  await authStore.login()
  navigateIfReady()
}

/** 登录按钮入口：未勾选时只提示，不访问云端。 */
function handleLogin(): void {
  if (isResolving.value) return

  if (!agreed.value) {
    agreementRequired.value = true
    toast.warning('请先阅读并同意用户协议和隐私政策')
    return
  }

  void resolveLogin()
}

/** 页面显示时恢复已有会话，新用户直接展示登录表单。 */
async function restoreOnShow(): Promise<void> {
  if (!hasCompletedLogin.value) {
    isCheckingSession.value = false
    navigateIfReady()
    return
  }

  isCheckingSession.value = true
  await authStore.restore()
  isCheckingSession.value = false
  navigateIfReady()
}

/** 恢复失败后重新执行上一次查询。 */
async function retryRecovery(): Promise<void> {
  isCheckingSession.value = true
  await authStore.retry()
  isCheckingSession.value = false
  navigateIfReady()
}

onShow(() => {
  void restoreOnShow()
})

watch(navigationIntent, navigateIfReady)
</script>

<style lang="scss" scoped>
.login-page {
  /* 页面背景与上下装饰。 */
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
  /* 协议、主按钮与错误提示。 */
  &__actions {
    margin-top: 76rpx;
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
  &__validation {
    display: block;
    margin-top: 14rpx;
    color: #ba564b;
    font-size: 24rpx;
    line-height: 1.5;
  }
  &__request-error {
    display: block;
    margin-top: 22rpx;
    color: #ba564b;
    font-size: 25rpx;
    line-height: 1.6;
    text-align: center;
  }
  /* 已登录用户恢复状态与失败重试卡片。 */
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
    margin-top: 72rpx;
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

  :deep(.login-page__submit) {
    width: 100%;
    height: 96rpx;
    margin-top: 28rpx;
    background: $brand-color-action;
    color: #fff;
    font-size: 30rpx;
    font-weight: 700;
  }

  :deep(.login-page__submit.is-disabled) {
    background: rgba($brand-color-action, .48);
    color: rgba(255, 255, 255, .9);
  }

  :deep(.login-page__retry) {
    height: 80rpx;
    margin-top: 28rpx;
    border-color: $brand-color-primary;
    background: $brand-color-surface;
    color: $brand-color-action;
    font-size: 28rpx;
  }

  :deep(.login-page__retry.is-disabled) {
    opacity: .6;
  }

  @media (max-width: 640px) {
    padding-right: 40rpx;
    padding-left: 40rpx;
  }
}
</style>
