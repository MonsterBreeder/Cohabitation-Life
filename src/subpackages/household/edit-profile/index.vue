<template>
  <view class="edit-profile-page">
    <view v-if="loading" class="edit-profile-page__state"><wd-loading /><text>正在加载个人资料</text></view>
    <view v-else-if="!profile" class="edit-profile-page__state"><text>{{ errorMessage || '暂时无法读取个人资料' }}</text></view>
    <view v-else class="edit-profile-page__editor" data-testid="edit-profile-page">
      <view class="edit-profile-page__hero"><text class="edit-profile-page__hero-title">选择你在家里的样子</text><text class="edit-profile-page__hero-copy">这里的选择只是昵称和形象，不会记录性别。</text></view>
      <view class="edit-profile-page__panel">
        <text class="edit-profile-page__section-title">内置形象</text>
        <ProfileAvatarPicker
          v-model="draftAvatar"
          :custom-preview="customPreview"
          @pick-custom="goToCropAvatar"
        />
        <text class="edit-profile-page__section-title edit-profile-page__section-title--spaced">昵称</text>
        <wd-input v-model="nickname" placeholder="例如：小伙伴" clearable @input="markCustomNickname" />
        <text v-if="nicknameValidation" class="edit-profile-page__error">{{ nicknameValidation }}</text>
      </view>
      <wd-button block type="primary" :loading="saving" :disabled="saving || !changed" @click="save">保存修改</wd-button>
      <wd-button block plain :disabled="saving" @click="cancel">取消</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
// 编辑个人资料页。
// 设计要点：
// 1) 头像用单一 draftAvatar 表达（覆盖 builtin / custom 两态），Picker 通过 v-model 与之绑定；
// 2) 点击 Picker 第 5 格 → 跳 crop-avatar 子分包，通过 eventChannel 监听 avatarApproved 事件；
// 3) 进入页面时若 profile 已是 custom，主动拉一次临时 URL 让 Picker 缩略图显示；拉取失败时回退到 "+" 占位但不重置草稿；
// 4) 草稿不入 store，未保存就退出页面等价于放弃；onUnload 解绑 eventChannel 防止 stale 回调。
import { computed, ref } from 'vue'
import { onBackPress, onShow, onUnload } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { useHouseholdStore } from '../../../store/modules/household'
import type { CurrentProfile, ProfileAvatar } from '../../../types/household'
import { getAvatarTemporaryUrl } from '../../../services/avatar-media'
import ProfileAvatarPicker from '../components/ProfileAvatarPicker.vue'
import { hasProfileChanges, nicknameChangeError } from '../edit-view'

const store = useHouseholdStore()
const { profile, errorMessage } = storeToRefs(store)
const nickname = ref('')
// draftAvatar 是页面级别的"当前选中头像"单一来源；为 null 表示尚未初始化。
const draftAvatar = ref<ProfileAvatar | null>(null)
// customPreview 是 Picker 第 5 格要显示的图片 URL——可能是云端临时链接，也可能是 crop-avatar 回传的本地路径。
const customPreview = ref('')
const loading = ref(false)
const saving = ref(false)
const initialized = ref(false)
const nicknameValidation = ref('')
// 已注册 eventChannel 监听，便于在 onUnload 摘除避免 stale 回调。
let channelOff: (() => void) | undefined

const draft = computed<CurrentProfile | null>(() => draftAvatar.value
  ? { nickname: nickname.value, avatar: draftAvatar.value }
  : null)
const changed = computed(() => profile.value && draft.value ? hasProfileChanges(profile.value, draft.value) : false)

function initialise(): void {
  if (!profile.value || initialized.value) return
  nickname.value = profile.value.nickname
  draftAvatar.value = profile.value.avatar
  initialized.value = true
  // 已有自定义头像时主动拉临时 URL 显示缩略图；失败不重置草稿，让用户可以再点 "+" 重新上传。
  if (profile.value.avatar.kind === 'custom') void refreshCustomPreview(profile.value.avatar.resourceId)
}

async function refreshCustomPreview(resourceId: string): Promise<void> {
  try {
    customPreview.value = await getAvatarTemporaryUrl(resourceId)
  } catch {
    customPreview.value = ''
    uni.showToast({ title: '自定义头像暂时无法显示，请重新上传', icon: 'none' })
  }
}

async function load(): Promise<void> {
  loading.value = true
  if (!profile.value) await store.loadCurrent()
  loading.value = false
  if (!profile.value) { uni.navigateBack(); return }
  initialise()
}

function markCustomNickname(): void { nicknameValidation.value = '' }

function registerEventChannel(): void {
  // 仅注册一次；onShow 多次触发时不能重复挂监听，否则会有多个 stale 回调。
  if (channelOff) return
  const pages = getCurrentPages()
  const page = pages.at(-1) as (Record<string, unknown> & { getOpenerEventChannel?: () => { on: (event: string, fn: (data: { avatar: { resourceId: string; digest: string }; previewPath: string }) => void) => void; off?: (event: string) => void } | undefined }) | undefined
  const channel = page?.getOpenerEventChannel?.()
  if (!channel) return
  const handler = (data: { avatar: { resourceId: string; digest: string }; previewPath: string }) => {
    if (!data || !data.avatar || !data.avatar.resourceId || !data.avatar.digest) return
    draftAvatar.value = { kind: 'custom', resourceId: data.avatar.resourceId, digest: data.avatar.digest }
    customPreview.value = data.previewPath || ''
    nicknameValidation.value = ''
    uni.showToast({ title: '已选择新头像', icon: 'success' })
  }
  channel.on('avatarApproved', handler)
  channelOff = () => { try { channel.off?.('avatarApproved') } catch { /* 旧版 eventChannel 可能没有 off，忽略 */ } }
}

function goToCropAvatar(): void {
  registerEventChannel()
  uni.navigateTo({ url: '/subpackages/household/crop-avatar/index?purpose=profile' })
}

async function save(): Promise<void> {
  if (saving.value || !profile.value || !draft.value) return
  nicknameValidation.value = nicknameChangeError(profile.value.nickname, nickname.value)
  if (nicknameValidation.value) return
  saving.value = true
  const ok = await store.saveProfile(draft.value)
  saving.value = false
  if (ok) { uni.showToast({ title: '个人资料已保存', icon: 'success' }); uni.navigateBack() }
  else uni.showToast({ title: '保存失败，修改内容已保留', icon: 'none' })
}
function leave(): void { uni.navigateBack() }
function cancel(): void {
  if (!changed.value) { leave(); return }
  uni.showModal({ title: '放弃修改？', content: '尚未保存的修改会丢失。', confirmText: '放弃', success: ({ confirm }) => { if (confirm) leave() } })
}
onBackPress(() => { if (!changed.value || saving.value) return false; cancel(); return true })
onShow(() => { void load() })
onUnload(() => { channelOff?.(); channelOff = undefined })
</script>

<style lang="scss" scoped>
.edit-profile-page {
  min-height: 100vh;
  padding: 40rpx 32rpx 70rpx;
  box-sizing: border-box;
  background: $brand-color-background;
  &__state {
    display: flex;
    min-height: 70vh;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28rpx;
    color: $brand-color-text-secondary;
  }
  &__editor {
    display: flex;
    flex-direction: column;
    gap: 24rpx;
  }
  &__hero {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    padding: 18rpx 4rpx;
  }
  &__hero-title {
    color: $brand-color-text;
    font-size: 40rpx;
    font-weight: 700;
  }
  &__hero-copy {
    color: $brand-color-text-secondary;
    font-size: 25rpx;
    line-height: 1.6;
  }
  &__panel {
    margin-bottom: 12rpx;
    padding: 30rpx;
    border-radius: $brand-radius-card;
    background: #fff;
  }
  &__section-title {
    display: block;
    margin-bottom: 22rpx;
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 700;
  }
  &__section-title--spaced {
    margin-top: 38rpx;
  }
  &__error {
    display: block;
    margin-top: 12rpx;
    color: #d95c4f;
    font-size: 23rpx;
  }
}
</style>
