<template>
  <view class="page">
    <view v-if="loading" class="state"><wd-loading /><text>正在加载家庭资料</text></view>
    <view v-else-if="!household" class="state"><text>{{ errorMessage || '暂时无法读取家庭资料' }}</text><wd-button @click="load">重试</wd-button></view>
    <view v-else class="editor" data-testid="edit-household-page">
      <view class="hero"><text class="hero__title">把小家打扮成喜欢的样子</text><text class="hero__copy">修改只会在保存成功后生效。</text></view>
      <view class="panel">
        <text class="section-title">家庭头像</text>
        <HouseholdAvatarPicker :current-id="customAvatar ? undefined : avatarId" :custom-preview="customPreview" @select="selectBuiltinAvatar" @select-custom="selectCustomAvatar" />
        <view v-if="customPreview" class="custom-preview"><wd-avatar :src="customPreview" size="108rpx" /><text>已通过检查的自定义头像</text></view>
        <text class="section-title section-title--spaced">家庭名称</text>
        <wd-input v-model="name" placeholder="例如：我们的小家" clearable />
        <text v-if="nameError" class="error">{{ nameError }}</text>
      </view>
      <wd-button block type="primary" :loading="saving" :disabled="saving || !!nameError || !changed" @click="save">保存修改</wd-button>
      <wd-button block plain :disabled="saving" @click="cancel">取消</wd-button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onBackPress, onShow } from '@dcloudio/uni-app'
import { storeToRefs } from 'pinia'
import HouseholdAvatarPicker from '../components/HouseholdAvatarPicker.vue'
import { useHouseholdStore } from '../../../store/modules/household'
import type { BuiltinHouseholdAvatarId, HouseholdAvatar } from '../../../types/household'
import { getAvatarTemporaryUrl } from '../../../services/avatar-media'
import { hasHouseholdChanges, householdNameError } from '../edit-view'

const store = useHouseholdStore()
const { household, errorMessage } = storeToRefs(store)
const name = ref('')
const avatarId = ref<BuiltinHouseholdAvatarId>('household-01')
const loading = ref(false)
const saving = ref(false)
const customAvatar = ref<HouseholdAvatar>(); const customPreview = ref('')
const initializedId = ref('')
const nameError = computed(() => householdNameError(name.value))
const changed = computed(() => household.value ? household.value.name !== name.value.trim() || JSON.stringify(household.value.avatar) !== JSON.stringify(customAvatar.value || { kind: 'builtin', id: avatarId.value }) : false)

function initialise(): void {
  if (!household.value || initializedId.value === household.value.id) return
  name.value = household.value.name
  if (household.value.avatar.kind === 'builtin') avatarId.value = household.value.avatar.id
  else {
    customAvatar.value = household.value.avatar
    void getAvatarTemporaryUrl(household.value.avatar.resourceId).then((url) => { customPreview.value = url }).catch(() => { customPreview.value = '' })
  }
  initializedId.value = household.value.id
}

async function load(): Promise<void> {
  loading.value = true
  if (!household.value) await store.loadCurrent()
  loading.value = false
  if (!household.value) { uni.navigateBack(); return }
  initialise()
}

async function save(): Promise<void> {
  if (saving.value || nameError.value) return
  saving.value = true
  const ok = await store.saveHousehold({ name: name.value, avatar: customAvatar.value || { kind: 'builtin', id: avatarId.value } })
  saving.value = false
  if (ok) { uni.showToast({ title: '家庭资料已保存', icon: 'success' }); uni.navigateBack() }
  else uni.showToast({ title: '保存失败，修改内容已保留', icon: 'none' })
}
function selectBuiltinAvatar(value: BuiltinHouseholdAvatarId): void { avatarId.value = value; customAvatar.value = undefined; customPreview.value = '' }
function selectCustomAvatar(): void {
  uni.navigateTo({
    url: '/subpackages/household/crop-avatar/index?purpose=household',
    success: (result) => {
      result.eventChannel.on('avatarApproved', ({ avatar, previewPath }: { avatar: HouseholdAvatar; previewPath: string }) => {
        if (avatar.kind !== 'custom') return
        customAvatar.value = avatar
        customPreview.value = previewPath
      })
    },
    fail: () => uni.showToast({ title: '暂时无法打开图片选择，请稍后再试', icon: 'none' }),
  })
}

function leave(): void { uni.navigateBack() }
function cancel(): void {
  if (!changed.value) { leave(); return }
  uni.showModal({ title: '放弃修改？', content: '尚未保存的修改会丢失。', confirmText: '放弃', success: ({ confirm }) => { if (confirm) leave() } })
}

onBackPress(() => {
  if (!changed.value || saving.value) return false
  cancel()
  return true
})
onShow(() => { void load() })
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding: 40rpx 32rpx 70rpx; box-sizing: border-box; background: $brand-color-background; }
.state { display: flex; min-height: 70vh; flex-direction: column; align-items: center; justify-content: center; gap: 28rpx; color: $brand-color-text-secondary; }
.editor { display: flex; flex-direction: column; gap: 24rpx; }
.hero { display: flex; flex-direction: column; gap: 12rpx; padding: 18rpx 4rpx; }
.hero__title { color: $brand-color-text; font-size: 40rpx; font-weight: 700; }
.hero__copy { color: $brand-color-text-secondary; font-size: 25rpx; }
.panel { margin-bottom: 12rpx; padding: 30rpx; border-radius: $brand-radius-card; background: #fff; }
.section-title { display: block; margin-bottom: 22rpx; color: $brand-color-text; font-size: 28rpx; font-weight: 700; }
.section-title--spaced { margin-top: 38rpx; }
.error { display: block; margin-top: 12rpx; color: #d95c4f; font-size: 23rpx; }
.custom-preview { display: flex; align-items: center; gap: 18rpx; margin: 16rpx 0; color: $brand-color-text-secondary; font-size: 23rpx; }
</style>
