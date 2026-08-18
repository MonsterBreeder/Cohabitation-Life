<template>
  <view class="create-home-page">
    <wd-toast />

    <view v-if="isCheckingEligibility" class="create-home-page__state" data-testid="create-home-checking">
      <wd-loading color="#267A5A" size="44rpx" />
      <text class="create-home-page__state-title">正在加载创建家庭</text>
      <text class="create-home-page__state-copy">确认完成后就可以创建你们的小家。</text>
    </view>

    <view v-else-if="eligibilityError" class="create-home-page__state" data-testid="create-home-eligibility-error">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="create-home-page__state-title">暂时无法确认</text>
      <text class="create-home-page__state-copy">{{ eligibilityError }}</text>
      <wd-button block round variant="plain" :loading="isCheckingEligibility" @click="retryEligibility">重新确认</wd-button>
    </view>

    <view v-else-if="isConfirming" class="create-home-page__state" data-testid="create-home-confirming">
      <wd-loading color="#267A5A" size="44rpx" />
      <text class="create-home-page__state-title">正在加载确认结果</text>
      <text class="create-home-page__state-copy">刚才的创建可能已经成功，请不要重复创建。</text>
      <wd-button block round :loading="isConfirmingRequest" :disabled="isConfirmingRequest" @click="confirmAgain">重新确认</wd-button>
      <wd-button block round variant="plain" :disabled="isConfirmingRequest" @click="tryLater">稍后再试</wd-button>
      <text v-if="errorMessage" class="create-home-page__error">{{ errorMessage }}</text>
    </view>

    <view v-else class="create-home-page__content" data-testid="create-home-form">
      <view class="create-home-page__heading">
        <text class="create-home-page__eyebrow">创建家庭</text>
        <text class="create-home-page__title">给我们的家一个开始</text>
        <text class="create-home-page__subtitle">先选一个喜欢的头像和名字，以后还可以修改。</text>
      </view>

      <HouseholdAvatarPicker
        :current-id="customAvatar ? undefined : selectedAvatarId"
        :custom-preview="customAvatarPreview"
        :disabled="isBusy"
        @select="handleAvatarSelect"
        @select-custom="chooseCustomAvatar"
      />

      <view class="create-home-page__field">
        <view class="create-home-page__field-heading">
          <text class="create-home-page__label">家庭名称</text>
          <text class="create-home-page__count" data-testid="household-name-remaining">还可输入 {{ nameState.remaining }} 个字</text>
        </view>
        <wd-input
          v-model="familyName"
          clearable
          :maxlength="80"
          :disabled="isBusy"
          :error="Boolean(nameState.errorMessage)"
          placeholder="例如：我们的小家"
          data-testid="household-name-input"
        />
        <text v-if="nameState.errorMessage" class="create-home-page__validation" data-testid="household-name-error">
          {{ nameState.errorMessage }}
        </text>
      </view>

      <view v-if="phase === 'failed' && errorMessage" class="create-home-page__failure" data-testid="create-home-failure">
        <text class="create-home-page__failure-title">这次没有创建成功</text>
        <text class="create-home-page__failure-copy">{{ errorMessage }}</text>
      </view>

      <wd-button
        block
        round
        size="large"
        :loading="isBusy"
        :disabled="!canSubmit"
        custom-class="create-home-page__submit"
        data-testid="create-home-submit"
        @click="submitCreate"
      >
        {{ isBusy ? '正在创建…' : '创建家庭' }}
      </wd-button>
      <text class="create-home-page__privacy">创建后，你会成为这个家的第一位成员。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { onBackPress, onShow } from '@dcloudio/uni-app'
import { useToast } from '@wot-ui/ui'
import HouseholdAvatarPicker from '../components/HouseholdAvatarPicker.vue'
import { describeHouseholdName } from './create-home-view'
import { useAuthStore } from '../../../store/modules/auth'
import { useHouseholdStore } from '../../../store/modules/household'
import type { BuiltinHouseholdAvatarId, HouseholdAvatar } from '../../../types/household'

const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const toast = useToast()
const { errorMessage, phase } = storeToRefs(householdStore)
const familyName = shallowRef(householdStore.draft.name)
const selectedAvatarId = shallowRef<BuiltinHouseholdAvatarId>(householdStore.draft.avatar.kind === 'builtin' ? householdStore.draft.avatar.id : 'household-01')
const customAvatar = shallowRef<HouseholdAvatar | undefined>(householdStore.draft.avatar.kind === 'custom' ? householdStore.draft.avatar : undefined)
const customAvatarPreview = shallowRef('')
const isCheckingEligibility = shallowRef(true)
const isConfirmingRequest = shallowRef(false)
const eligibilityError = shallowRef('')
const eligibilityInFlight = shallowRef<Promise<void>>()

const nameState = computed(() => describeHouseholdName(familyName.value))
const isBusy = computed(() => phase.value === 'creating' || phase.value === 'checking-content')
const isConfirming = computed(() => phase.value === 'confirming')
const canSubmit = computed(() => householdStore.canCreate && nameState.value.valid && !isBusy.value)

function reLaunch(url: string): void {
  uni.reLaunch({ url })
}

function handleAvatarSelect(id: BuiltinHouseholdAvatarId): void {
  if (!isBusy.value) {
    selectedAvatarId.value = id
    customAvatar.value = undefined
    customAvatarPreview.value = ''
  }
}

function chooseCustomAvatar(): void {
  if (isBusy.value) return
  uni.navigateTo({
    url: '/subpackages/household/crop-avatar/index?purpose=household',
    success: (result) => {
      result.eventChannel.on('avatarApproved', ({ avatar, previewPath }: { avatar: HouseholdAvatar; previewPath: string }) => {
        if (avatar.kind !== 'custom') return
        customAvatar.value = avatar
        customAvatarPreview.value = previewPath
      })
    },
    fail: () => toast.error('暂时无法打开图片选择，请稍后再试'),
  })
}

/** 直接打开页面时仍以云端分流结果为准，不能只相信本地登录标记。 */
async function checkEligibility(): Promise<void> {
  if (eligibilityInFlight.value) return eligibilityInFlight.value

  eligibilityInFlight.value = (async () => {
    eligibilityError.value = ''
    isCheckingEligibility.value = true

    if (!authStore.hasCompletedLogin) {
      reLaunch('/pages/login/index')
      return
    }

    await authStore.restore()
    const route = authStore.consumeNavigationIntent()
    if (route && route.page !== 'create-home') {
      reLaunch(route.url)
      return
    }
    if (authStore.errorMessage) {
      eligibilityError.value = authStore.errorMessage
      return
    }

    await householdStore.restorePending()
    familyName.value = householdStore.draft.name
    selectedAvatarId.value = householdStore.draft.avatar.kind === 'builtin' ? householdStore.draft.avatar.id : 'household-01'
    customAvatar.value = householdStore.draft.avatar.kind === 'custom' ? householdStore.draft.avatar : undefined
    if (phase.value === 'loaded') reLaunch('/pages/index/index')
  })().finally(() => {
    isCheckingEligibility.value = false
    eligibilityInFlight.value = undefined
  })

  return eligibilityInFlight.value
}

async function submitCreate(): Promise<void> {
  if (!canSubmit.value || !nameState.value.valid) return
  await householdStore.create({
    name: nameState.value.value,
    avatar: customAvatar.value || { kind: 'builtin', id: selectedAvatarId.value },
  })
  if (phase.value === 'loaded') reLaunch('/pages/index/index')
}

async function confirmAgain(): Promise<void> {
  if (isConfirmingRequest.value) return
  isConfirmingRequest.value = true
  await householdStore.confirmPending()
  isConfirmingRequest.value = false
  if (phase.value === 'loaded') reLaunch('/pages/index/index')
}

function retryEligibility(): void {
  void checkEligibility()
}

function tryLater(): void {
  reLaunch('/pages/login/index')
}

onShow(() => {
  void checkEligibility()
})

// 创建和结果确认期间阻止误触返回，避免用户把同一次操作误认为可以重新提交。
onBackPress(() => isBusy.value || isConfirming.value)

watch(phase, (nextPhase) => {
  if (nextPhase === 'loaded') reLaunch('/pages/index/index')
  if (nextPhase === 'failed' && errorMessage.value) toast.error(errorMessage.value)
})
</script>

<style lang="scss" scoped>
.create-home-page { min-height: 100vh; padding: 52rpx 40rpx 72rpx; box-sizing: border-box; background: $brand-color-background; }
.create-home-page__content { width: 100%; max-width: 680rpx; margin: 0 auto; }
.create-home-page__heading { margin-bottom: 48rpx; }
.create-home-page__eyebrow { display: block; color: $brand-color-primary; font-size: 24rpx; font-weight: 700; letter-spacing: 4rpx; }
.create-home-page__title { display: block; margin-top: 18rpx; color: $brand-color-text; font-size: 44rpx; font-weight: 700; line-height: 1.35; }
.create-home-page__subtitle { display: block; margin-top: 16rpx; color: $brand-color-text-secondary; font-size: 27rpx; line-height: 1.65; }
.create-home-page__field { margin-top: 48rpx; padding: 32rpx; border: 2rpx solid $brand-color-border; border-radius: $brand-radius-card; background: $brand-color-surface; }
.create-home-page__field-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18rpx; gap: 24rpx; }
.create-home-page__label { color: $brand-color-text; font-size: 29rpx; font-weight: 700; }
.create-home-page__count { flex-shrink: 0; color: $brand-color-text-secondary; font-size: 23rpx; }
.create-home-page__validation { display: block; margin-top: 14rpx; color: #ba564b; font-size: 24rpx; line-height: 1.5; }
.create-home-page__failure { margin-top: 28rpx; padding: 28rpx; border: 2rpx solid rgba($brand-color-accent, .42); border-radius: $brand-radius-input; background: rgba($brand-color-accent, .08); }
.create-home-page__failure-title { display: block; color: #8e463e; font-size: 27rpx; font-weight: 700; }
.create-home-page__failure-copy { display: block; margin-top: 10rpx; color: #8e5a54; font-size: 24rpx; line-height: 1.55; }
:deep(.create-home-page__submit) { width: 100%; height: 94rpx; margin-top: 40rpx; background: $brand-color-action; color: #fff; font-size: 30rpx; font-weight: 700; }
:deep(.create-home-page__submit.is-disabled) { background: rgba($brand-color-action, .42); color: rgba(255, 255, 255, .9); }
.create-home-page__privacy { display: block; margin-top: 20rpx; color: $brand-color-text-secondary; font-size: 23rpx; line-height: 1.5; text-align: center; }
.create-home-page__state { display: flex; min-height: calc(100vh - 124rpx); flex-direction: column; align-items: center; justify-content: center; max-width: 600rpx; margin: 0 auto; text-align: center; gap: 24rpx; }
.create-home-page__state-title { color: $brand-color-text; font-size: 34rpx; font-weight: 700; }
.create-home-page__state-copy { margin-bottom: 12rpx; color: $brand-color-text-secondary; font-size: 26rpx; line-height: 1.65; }
.create-home-page__error { color: #ba564b; font-size: 24rpx; line-height: 1.5; }
@media (max-width: 360px) { .create-home-page { padding-right: 30rpx; padding-left: 30rpx; } .create-home-page__field { padding: 26rpx; } }
</style>
