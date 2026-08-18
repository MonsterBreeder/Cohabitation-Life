<template>
  <view class="join-page">
    <view class="join-card" data-testid="join-home-entry">
      <text class="join-card__eyebrow">邀请确认</text>
      <text class="join-card__title">{{ title }}</text>
      <view v-if="preview" class="join-card__inviter">
        <text class="join-card__inviter-name">{{ preview.inviter.nickname }} 邀请你加入</text>
        <text class="join-card__inviter-status">待接收</text>
      </view>
      <text v-if="preview" class="join-card__description">{{ preview.household.name }} 正在等你一起使用。加入后会有 {{ preview.household.memberCount + 1 }} 位成员。</text>
      <text v-else class="join-card__description">正在加载加入家庭。</text>
      <view v-if="mode === 'transfer'" class="join-card__warning">
        <text class="join-card__warning-title">你的原家庭会被替换</text>
        <text class="join-card__warning-copy">你仍会保留自己的昵称和头像；目前没有共同事项需要迁移。</text>
      </view>
      <text v-if="errorMessage" class="join-card__error">{{ errorMessage }}</text>
      <wd-button block type="primary" :loading="isBusy" :disabled="!canSubmit" @click="submit">{{ mode === 'transfer' ? '确认转入' : '确认加入' }}</wd-button>
      <text class="join-card__hint">确认前不会改变你的家庭归属。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { computed } from 'vue'
import { useAuthStore } from '../../../store/modules/auth'
import { useHouseholdStore } from '../../../store/modules/household'
import { useInvitationStore } from '../../../store/modules/invitation'
import { joinTitle, resolveJoinMode } from './join-home-view'

const auth = useAuthStore()
const household = useHouseholdStore()
const invitation = useInvitationStore()
const mode = computed(() => resolveJoinMode(household.household?.memberCount))
const title = computed(() => joinTitle(mode.value))
const preview = computed(() => invitation.preview)
const errorMessage = computed(() => invitation.errorMessage)
const isBusy = computed(() => invitation.isBusy)
const canSubmit = computed(() => Boolean(auth.pendingInviteToken && preview.value))

/** 每次展示都先取真实家庭状态，再预览邀请；预览不改变任何成员关系。 */
async function load(): Promise<void> {
  if (!auth.pendingInviteToken) {
    invitation.errorMessage = '这份邀请已不在当前设备上，请让对方重新发送'
    return
  }
  await household.loadCurrent()
  const result = await invitation.previewInvite(auth.pendingInviteToken)
  if (result && result.status !== 'INVITE_PREVIEW') invitation.errorMessage = '这份邀请暂时不能使用，请让对方重新发送'
}

async function submit(): Promise<void> {
  const inviteToken = auth.pendingInviteToken
  if (!inviteToken || !preview.value) return
  if (mode.value === 'transfer') {
    const confirmation = await uni.showModal({ title: '确认转入', content: '转入后，你现在这个只有你一人的家庭会被替换。', confirmText: '继续' })
    if (!confirmation.confirm) return
  }
  const result = await invitation.join({ inviteToken, mode: mode.value })
  if (result?.status === 'HOME') {
    auth.clearInviteToken()
    uni.reLaunch({ url: '/pages/index/index' })
  }
  if (result?.status === 'TRANSFER_CONFIRM') invitation.errorMessage = '请确认转入后再继续'
  if (result && result.status !== 'HOME' && result.status !== 'TRANSFER_CONFIRM') invitation.errorMessage = '这份邀请已经不能使用，请让对方重新发送'
}

onShow(() => { void load() })
</script>

<style lang="scss" scoped>
/* 邀请确认聚焦单一步骤，转入时把会发生的变化清晰显示在确认按钮前。 */
.join-page { display: flex; min-height: 100vh; align-items: center; padding: 48rpx; box-sizing: border-box; background: $brand-color-background; }
.join-card { width: 100%; padding: 48rpx 40rpx; border: 2rpx solid $brand-color-border; border-radius: $brand-radius-card; background: $brand-color-surface; }
.join-card__eyebrow { display: block; color: $brand-color-primary; font-size: 24rpx; font-weight: 700; letter-spacing: 4rpx; }
.join-card__title { display: block; margin-top: 22rpx; color: $brand-color-text; font-size: 44rpx; font-weight: 700; }
.join-card__description { display: block; margin-top: 22rpx; color: $brand-color-text-secondary; font-size: 28rpx; line-height: 1.7; }
.join-card__inviter { display: flex; align-items: center; justify-content: space-between; margin-top: 26rpx; padding: 20rpx 22rpx; border-radius: 18rpx; background: #effbf5; }
.join-card__inviter-name { color: $brand-color-text; font-size: 27rpx; font-weight: 700; }
.join-card__inviter-status { padding: 6rpx 14rpx; border-radius: 999rpx; background: #d9f5e8; color: $brand-color-action; font-size: 21rpx; font-weight: 700; }
.join-card__warning { margin: 28rpx 0; padding: 24rpx; border-radius: 18rpx; background: #fff3e8; }
.join-card__warning-title { display: block; color: #a55d31; font-size: 27rpx; font-weight: 700; }
.join-card__warning-copy { display: block; margin-top: 10rpx; color: #8f6e58; font-size: 24rpx; line-height: 1.6; }
.join-card__error { display: block; margin: 22rpx 0; color: #c5684d; font-size: 25rpx; line-height: 1.6; }
.join-card__hint { display: block; margin-top: 22rpx; color: $brand-color-text-secondary; font-size: 23rpx; text-align: center; }
</style>
