<template>
  <view class="edit-profile-page">
    <view v-if="loading" class="edit-profile-page__state"><wd-loading /><text>正在加载个人资料</text></view>
    <view v-else-if="!profile" class="edit-profile-page__state"><text>{{ errorMessage || '暂时无法读取个人资料' }}</text></view>
    <view v-else class="edit-profile-page__editor" data-testid="edit-profile-page">
      <view class="edit-profile-page__hero"><text class="edit-profile-page__hero-title">选择你在家里的样子</text><text class="edit-profile-page__hero-copy">这里的选择只是昵称和形象，不会记录性别。</text></view>
      <view class="edit-profile-page__panel">
        <text class="edit-profile-page__section-title">快捷选择</text>
        <view class="edit-profile-page__presets">
          <wd-button v-for="item in profilePresets" :key="item.id" size="small" :plain="preset !== item.id" @click="selectPreset(item)">{{ item.label }}</wd-button>
          <wd-button size="small" :plain="preset !== 'random'" @click="selectRandom">随机形象</wd-button>
        </view>
        <text class="edit-profile-page__section-title edit-profile-page__section-title--spaced">内置形象</text>
        <ProfileAvatarPicker v-model="avatarId" @update:model-value="markCustomAvatar" />
        <view v-if="customPreview" class="edit-profile-page__custom-preview"><wd-avatar :src="customPreview" size="108rpx" /><text>已通过检查的自定义头像</text></view>
        <view class="edit-profile-page__wechat-note"><text>自定义头像和微信资料稍后开放</text><text>云端访问规则完成真实验证后才会开放入口。</text></view>
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
import { computed, ref } from 'vue'
import { onBackPress, onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import { useHouseholdStore } from '../../../store/modules/household'
import type { BuiltinProfileAvatarId, CurrentProfile, ProfileAvatar } from '../../../types/household'
import ProfileAvatarPicker from '../components/ProfileAvatarPicker.vue'
import { hasProfileChanges, nicknameChangeError, pickRandomProfileAvatar, profilePresets } from '../edit-view'

const store = useHouseholdStore()
const { profile, errorMessage } = storeToRefs(store)
const nickname = ref('')
const avatarId = ref<BuiltinProfileAvatarId>('person-neutral')
const preset = ref<CurrentProfile['profilePreset']>('neutral')
const loading = ref(false)
const saving = ref(false)
const initialized = ref(false)
const customAvatar = ref<ProfileAvatar>(); const customPreview = ref('')
const nicknameValidation = ref('')
const draft = computed<CurrentProfile>(() => ({ nickname: nickname.value, avatar: customAvatar.value || { kind: 'builtin', id: avatarId.value }, profilePreset: preset.value }))
const changed = computed(() => profile.value ? hasProfileChanges(profile.value, draft.value) : false)

function initialise(): void {
  if (!profile.value || initialized.value) return
  nickname.value = profile.value.nickname
  if (profile.value.avatar.kind === 'builtin') avatarId.value = profile.value.avatar.id
  else customAvatar.value = profile.value.avatar
  preset.value = profile.value.profilePreset
  initialized.value = true
}
async function load(): Promise<void> {
  loading.value = true
  if (!profile.value) await store.loadCurrent()
  loading.value = false
  if (!profile.value) { uni.navigateBack(); return }
  initialise()
}
function selectPreset(item: typeof profilePresets[number]): void { customAvatar.value = undefined; customPreview.value = ''; preset.value = item.id; nickname.value = item.nickname; nicknameValidation.value = ''; avatarId.value = item.avatarId }
function selectRandom(): void { customAvatar.value = undefined; customPreview.value = ''; preset.value = 'random'; nickname.value = '小伙伴'; nicknameValidation.value = ''; avatarId.value = pickRandomProfileAvatar() }
function markCustomAvatar(): void { customAvatar.value = undefined; customPreview.value = ''; if (!['xiaoshuai', 'xiaomei', 'random'].includes(preset.value)) preset.value = 'custom' }
function markCustomNickname(): void { nicknameValidation.value = ''; preset.value = 'custom' }
async function save(): Promise<void> {
  if (saving.value || !profile.value) return
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
  &__presets {
    display: flex;
    flex-wrap: wrap;
    gap: 16rpx;
  }
  &__error {
    display: block;
    margin-top: 12rpx;
    color: #d95c4f;
    font-size: 23rpx;
  }
  &__wechat-note {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
    margin-top: 34rpx;
    padding: 22rpx;
    border-radius: 20rpx;
    background: #f7f8f7;
    color: $brand-color-text-secondary;
    font-size: 23rpx;
    line-height: 1.55;
  }
  &__custom-preview {
    display: flex;
    align-items: center;
    gap: 18rpx;
    margin: 16rpx 0;
    color: $brand-color-text-secondary;
    font-size: 23rpx;
  }
}
</style>
