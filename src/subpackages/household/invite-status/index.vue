<template>
  <!-- 邀请终态页：未开始用户只给"结束邀请"；已开始且无家庭给"创建家庭"；已有家庭给"回到自己的家"。 -->
  <view class="invite-status">
    <view class="invite-status__dot" />
    <view class="invite-status__content">
      <image class="invite-status__logo" src="/static/brand/logo.png" mode="aspectFit" aria-label="睦录 Logo" />
      <view class="invite-status__card" data-testid="invite-status-card">
        <text class="invite-status__title" data-testid="invite-status-title">{{ view.title }}</text>
        <text class="invite-status__description" data-testid="invite-status-description">{{ view.description }}</text>
        <view class="invite-status__tip">
          <view class="invite-status__tip-mark">i</view>
          <text class="invite-status__tip-text">请联系对方重新发一份邀请。</text>
        </view>
      </view>
    </view>
    <view class="invite-status__action">
      <wd-button
        block
        round
        size="large"
        :loading="view.primaryLoading"
        :disabled="view.primaryDisabled"
        :data-testid="view.primaryAction ? `invite-status-${view.primaryAction}` : 'invite-status-busy'"
        custom-class="invite-status__primary"
        @click="handleAction"
      >{{ view.primaryLabel }}</wd-button>
    </view>
    <GlobalQuickAdd v-if="canShowQuickAdd" :visible="true" />
  </view>
</template>

<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import GlobalQuickAdd from '../../../components/GlobalQuickAdd.vue'
import { useAuthStore } from '../../../store/modules/auth'
import { useHouseholdStore } from '../../../store/modules/household'
import { useInvitationStore } from '../../../store/modules/invitation'
import { describeInviteStatusView, type InviteStatusAction } from './invite-status-view'

const auth = useAuthStore()
const householdStore = useHouseholdStore()
const invitationStore = useInvitationStore()
const { hasCompletedLogin, errorMessage, notice, isResolving } = storeToRefs(auth)
const { household, checking } = storeToRefs(householdStore)
const checkingHousehold = shallowRef(true)

const view = computed(() => describeInviteStatusView({
  notice: notice.value,
  hasStartedUse: hasCompletedLogin.value,
  hasHousehold: Boolean(household.value),
  isResolving: isResolving.value,
  errorMessage: errorMessage.value,
}))

/** 已有家庭用户才显示快速新增；按"避免误操作"原则不再展示在邀请异常页。 */
const canShowQuickAdd = computed(() => hasCompletedLogin.value && Boolean(household.value) && !checkingHousehold.value)

/** 未登录用户不额外请求；已登录时只确认是否仍有家庭，不改变邀请错误内容。 */
async function loadHousehold(): Promise<void> {
  checkingHousehold.value = true
  try {
    if (!hasCompletedLogin.value) return
    await householdStore.loadCurrent({ preserveExisting: true })
  } finally {
    checkingHousehold.value = false
  }
}

onShow(() => { void loadHousehold() })

/** 终态页主按钮：按 action 决定路由或本地清理。 */
function handleAction(): void {
  const action = view.value.primaryAction
  if (action === 'back-home') {
    uni.reLaunch({ url: '/pages/index/index' })
    return
  }
  if (action === 'create-home') {
    uni.reLaunch({ url: '/subpackages/household/create-home/index' })
    return
  }
  if (action === 'end-invite-and-welcome') {
    auth.clearInviteToken()
    invitationStore.clearPreview()
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  // null action：按钮处于禁用状态，这里不会触发
}
</script>

<style lang="scss" scoped>
.invite-status {
  /* 邀请异常页：单卡片 + 主按钮；保留品牌装饰和提示信息。 */
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 64rpx 48rpx 96rpx;
  box-sizing: border-box;
  background: $brand-color-background;

  &__content {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 620rpx;
  }
  &__logo {
    display: block;
    width: 132rpx;
    height: 132rpx;
    margin: 0 auto 40rpx;
  }
  &__card {
    padding: 48rpx 40rpx;
    border: 2rpx solid $brand-color-border;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
  }
  &__title {
    display: block;
    color: $brand-color-text;
    font-size: 36rpx;
    font-weight: 700;
    line-height: 1.4;
  }
  &__description {
    display: block;
    margin-top: 20rpx;
    color: $brand-color-text-secondary;
    font-size: 28rpx;
    line-height: 1.7;
  }
  &__tip {
    display: flex;
    align-items: flex-start;
    margin-top: 32rpx;
    padding-top: 28rpx;
    border-top: 2rpx solid $brand-color-border;
  }
  &__tip-mark {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 32rpx;
    height: 32rpx;
    margin: 4rpx 14rpx 0 0;
    border-radius: 50%;
    background: $brand-color-accent;
    color: #ffffff;
    font-size: 21rpx;
    font-weight: 700;
    line-height: 1;
  }
  &__tip-text {
    color: $brand-color-text;
    font-size: 25rpx;
    line-height: 1.65;
  }
  &__dot {
    position: absolute;
    top: 96rpx;
    right: -44rpx;
    width: 172rpx;
    height: 172rpx;
    border-radius: 50%;
    background: rgba($brand-color-primary, .13);
  }
  &__action {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 620rpx;
    margin-top: 32rpx;
  }
  :deep(.invite-status__primary) {
    height: 96rpx;
    background: $brand-color-action;
    color: #ffffff;
    font-size: 30rpx;
    font-weight: 700;
  }
  :deep(.invite-status__primary.is-disabled) {
    background: rgba($brand-color-action, .48);
    color: rgba(255, 255, 255, .9);
  }
}
</style>
