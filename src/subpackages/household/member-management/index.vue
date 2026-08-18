<template>
  <view class="management-page">
    <view class="management-card">
      <text class="management-card__eyebrow">家庭成员</text>
      <text class="management-card__title">{{ household?.name || '我的家庭' }}</text>
      <text class="management-card__description">{{ household?.memberCount === 1 ? '现在只有你一人，可以邀请另一位成员。' : '你们正在共同使用这个家。' }}</text>

      <view v-if="canInviteHousehold" class="management-card__actions">
        <view class="invitee-field">
          <text class="invitee-field__label">想邀请谁</text>
          <view class="invitee-field__input-wrap">
            <input class="invitee-field__input" :value="inviteeName" :maxlength="80" placeholder="例如：小美" @input="syncInviteeName(($event as any).detail.value)" />
            <text v-if="inviteeName" class="invitee-field__clear" @click="clearInviteeName">×</text>
          </view>
          <text v-if="inviteeNameError" class="invitee-field__error">{{ inviteeNameError }}</text>
        </view>

        <view v-if="pendingInvite">
          <button class="share-button" open-type="share">{{ shareButtonText }}</button>
          <view class="invite-status">
            <wd-icon name="time" size="32rpx" color="#267a5a" />
            <view class="invite-status__content">
              <text class="invite-status__title">{{ pendingInvite.sharedAt ? `已邀请：${displayInviteeName}` : `准备邀请：${displayInviteeName}` }}</text>
              <text class="invite-status__copy">{{ pendingInvite.sharedAt ? '待接收。对方接受后，这里会显示为两位成员。' : '点击上方按钮后，会直接打开微信发送面板。' }}</text>
            </view>
          </view>
        </view>
        <view v-else-if="panelState === 'preparing'" class="invite-status">
          <wd-icon name="loading" size="32rpx" color="#267a5a" />
          <view class="invite-status__content">
            <text class="invite-status__title">正在准备邀请详情</text>
            <text class="invite-status__copy">通常只需几秒，超过 12 秒会自动停止并允许重新尝试。</text>
          </view>
        </view>
        <view v-else-if="panelState === 'failed'" class="invite-status invite-status--failed">
          <wd-icon name="warning" size="32rpx" color="#c5684d" />
          <view class="invite-status__content">
            <text class="invite-status__title">邀请暂时没有准备好</text>
            <text class="invite-status__copy">{{ errorMessage || '请检查网络后重试。' }}</text>
            <wd-button size="small" type="primary" custom-class="retry-button" @click="prepareInvite">重新尝试</wd-button>
          </view>
        </view>
        <view v-else class="invite-status">
          <view class="invite-status__content">
            <text class="invite-status__title">填写称呼后手动准备邀请</text>
            <text class="invite-status__copy">准备完成后，会出现可以直接发送给对方的按钮。</text>
            <wd-button block type="primary" custom-class="prepare-button" @click="prepareInvite">准备邀请</wd-button>
          </view>
        </view>
        <text class="management-card__hint">邀请在一天内有效。</text>
      </view>

      <view v-else-if="canRemoveHousehold" class="management-card__actions">
        <wd-button block type="primary" custom-class="remove-button" :loading="isBusy" @click="confirmRemove">移除另一位成员</wd-button>
        <text class="management-card__hint">对方会回到创建家庭的状态，并保留自己的昵称和头像。</text>
      </view>
      <text v-else class="management-card__hint">当前没有可进行的成员操作。</text>
      <text v-if="errorMessage" class="management-card__error">{{ errorMessage }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShareAppMessage, onShow } from '@dcloudio/uni-app'
import { computed, shallowRef } from 'vue'
import { useHouseholdStore } from '../../../store/modules/household'
import { useInvitationStore } from '../../../store/modules/invitation'
import { canInvite, canRemoveOtherMember, invitationNameFromInput, invitationNameValidation, invitationPanelState } from './member-management-view'

const householdStore = useHouseholdStore()
const invitation = useInvitationStore()
const household = computed(() => householdStore.household)
const canInviteHousehold = computed(() => canInvite(household.value))
const canRemoveHousehold = computed(() => canRemoveOtherMember(household.value))
const isBusy = computed(() => invitation.isBusy)
const pendingInvite = computed(() => invitation.pending)
const errorMessage = computed(() => invitation.errorMessage)
const panelState = computed(() => invitationPanelState(Boolean(pendingInvite.value), isBusy.value, Boolean(errorMessage.value)))
const inviteeName = shallowRef('')
const inviteeNameError = computed(() => {
  const validation = invitationNameValidation(inviteeName.value)
  return inviteeName.value ? (validation.valid ? '' : '请输入不超过 12 个字的昵称') : ''
})
const displayInviteeName = computed(() => {
  const validation = invitationNameValidation(inviteeName.value)
  return validation.valid ? validation.value : '对方'
})
const shareButtonText = computed(() => `邀请 ${displayInviteeName.value}`)

function syncInviteeName(value: unknown): void {
  inviteeName.value = invitationNameFromInput(value)
  invitation.clearResult()
  const validation = invitationNameValidation(inviteeName.value)
  if (validation.valid && pendingInvite.value) invitation.renamePending(validation.value)
}

function clearInviteeName(): void {
  inviteeName.value = ''
  invitation.clearResult()
}

async function prepareInvite(): Promise<void> {
  if (isBusy.value || pendingInvite.value) return
  const validation = invitationNameValidation(inviteeName.value)
  if (!validation.valid) {
    invitation.errorMessage = inviteeName.value ? '请输入不超过 12 个字的称呼' : '请先填写想邀请的人'
    return
  }
  const name = validation.value
  const result = await invitation.create(name)
  if (result?.status === 'INVITE_READY') invitation.renamePending(name)
  if (result?.status === 'CONTENT_REJECTED') invitation.errorMessage = '暂时无法准备邀请，请稍后重试'
  else if (result?.status !== 'INVITE_READY') invitation.errorMessage = '暂时无法准备邀请，请稍后重试'
}

async function confirmRemove(): Promise<void> {
  const first = await uni.showModal({ title: '移除成员', content: '对方将不再属于这个家，但会保留自己的昵称和头像。', confirmText: '继续' })
  if (!first.confirm) return
  const second = await uni.showModal({ title: '再次确认', content: '确定要移除另一位成员吗？', confirmText: '确定移除', confirmColor: '#d66b55' })
  if (!second.confirm) return
  const result = await invitation.removeOther()
  if (result?.status !== 'HOME') invitation.errorMessage = '暂时无法移除成员，请稍后重试'
}

/** 页面只负责恢复家庭资料；邀请由用户明确点击后准备，避免页面进入阶段被自动请求卡住。 */
async function load(): Promise<void> {
  if (!household.value) await householdStore.loadCurrent()
  if (pendingInvite.value?.inviteeName && pendingInvite.value.inviteeName !== '家人') inviteeName.value = pendingInvite.value.inviteeName
}

onShow(() => { void load() })

onShareAppMessage(() => {
  const inviteToken = pendingInvite.value?.inviteToken
  return {
    // 邀请对象昵称只在创建者本机展示，分享给对方的内容不携带该本地称呼。
    title: '邀请你一起使用这个家',
    path: inviteToken ? `/pages/login/index?inviteToken=${inviteToken}` : '/pages/login/index',
    success: () => invitation.markShared(),
  }
})
</script>

<style lang="scss" scoped>
/* 成员操作集中在一张卡片中：单人可邀请，双人仅保留移除确认。 */
.management-page { min-height: 100vh; padding: 48rpx 32rpx; box-sizing: border-box; background: $brand-color-background; }
.management-card { padding: 42rpx 36rpx; border: 2rpx solid $brand-color-border; border-radius: $brand-radius-card; background: $brand-color-surface; }
.management-card__eyebrow { display: block; color: $brand-color-primary; font-size: 23rpx; font-weight: 700; letter-spacing: 4rpx; }
.management-card__title { display: block; margin-top: 16rpx; color: $brand-color-text; font-size: 42rpx; font-weight: 700; }
.management-card__description { display: block; margin-top: 16rpx; color: $brand-color-text-secondary; font-size: 27rpx; line-height: 1.65; }
.management-card__actions { margin-top: 42rpx; }
.invitee-field { display: flex; flex-direction: column; gap: 16rpx; }
.invitee-field__label { color: $brand-color-text; font-size: 26rpx; font-weight: 700; }
.invitee-field__input-wrap { display: flex; align-items: center; height: 88rpx; padding: 0 24rpx; border: 2rpx solid $brand-color-border; border-radius: 18rpx; background: #fff; }
.invitee-field__input { flex: 1; min-width: 0; color: $brand-color-text; font-size: 28rpx; }
.invitee-field__clear { padding: 10rpx; color: #667085; font-size: 42rpx; line-height: 1; }
.invitee-field__error { color: #c5684d; font-size: 22rpx; }
.share-button { width: 100%; margin-top: 22rpx; border: 0; border-radius: 999rpx; background: $brand-color-action; color: #fff; font-size: 28rpx; font-weight: 700; line-height: 92rpx; }
.share-button::after { border: 0; }
.remove-button { background: #d66b55; }
.invite-status { display: flex; align-items: flex-start; margin-top: 26rpx; padding: 22rpx; border-radius: 18rpx; background: #effbf5; }
.invite-status--failed { background: #fff3ee; }
.invite-status__content { display: flex; flex: 1; flex-direction: column; margin-left: 14rpx; }
.invite-status__title { color: $brand-color-text; font-size: 25rpx; font-weight: 700; }
.invite-status__copy { margin-top: 7rpx; color: $brand-color-text-secondary; font-size: 22rpx; line-height: 1.5; }
.retry-button { margin-top: 18rpx; }
.prepare-button { margin-top: 20rpx; }
.management-card__hint { display: block; margin-top: 22rpx; color: $brand-color-text-secondary; font-size: 24rpx; line-height: 1.6; text-align: center; }
.management-card__error { display: block; margin-top: 24rpx; color: #c5684d; font-size: 25rpx; text-align: center; }
</style>
