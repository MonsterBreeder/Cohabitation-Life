<template>
  <view class="footprint-form-page">
    <wd-toast />
    <!-- Wot 没有图片隐私重编码组件，此画布只用于本地重绘，不展示原始照片元信息。 -->
    <canvas id="footprint-photo-canvas" type="2d" class="footprint-form-page__canvas" />

    <view v-if="loading" class="footprint-form-page__state">
      <wd-loading color="#267A5A" size="42rpx" />
      <text class="footprint-form-page__state-title">正在加载足迹编辑页</text>
    </view>

    <view v-else-if="loadError" class="footprint-form-page__state">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text class="footprint-form-page__state-title">{{ loadError }}</text>
      <wd-button variant="plain" @click="initialize({ entryId })">重新加载</wd-button>
    </view>

    <view v-else class="footprint-form-page__content">
      <view class="footprint-form-page__heading">
        <text class="footprint-form-page__eyebrow">{{ isEdit ? '整理回忆' : '记录一起去过的地方' }}</text>
        <text class="footprint-form-page__title">{{ isEdit ? '更新这段足迹' : '这次去了哪里？' }}</text>
      </view>

      <view class="footprint-form-page__section">
        <text class="footprint-form-page__label">地点（必填）</text>
        <view class="footprint-form-page__location" role="button" @click="chooseLocation">
          <wd-icon name="location" size="42rpx" color="#267A5A" />
          <view class="footprint-form-page__location-copy">
            <text class="footprint-form-page__location-name">
              {{ draft.place?.name || '选择去过的地点' }}
            </text>
            <text class="footprint-form-page__location-address">
              {{ draft.place?.address || '可以在微信位置页搜索或查看附近地点' }}
            </text>
          </view>
          <wd-icon name="arrow-right" size="30rpx" color="#74847D" />
        </view>
        <view v-if="locationDenied" class="footprint-form-page__permission">
          <text>需要位置权限才能打开微信位置选择。</text>
          <wd-button size="small" variant="plain" @click="openSettings">打开设置</wd-button>
        </view>
      </view>

      <view class="footprint-form-page__section">
        <text class="footprint-form-page__label">游玩日期（必填）</text>
        <!-- 项目现有日期表单使用原生 picker，微信端触发稳定；外观仍使用品牌样式。 -->
        <picker
          mode="date"
          :value="draft.visitedAt"
          start="2000-01-01"
          :end="today"
          :disabled="busy"
          @change="onDateChange"
        >
          <view class="footprint-form-page__date">
            <wd-icon name="calendar" size="32rpx" color="#267A5A" />
            <text>{{ draft.visitedAt }}</text>
          </view>
        </picker>
      </view>

      <view class="footprint-form-page__section">
        <view class="footprint-form-page__section-heading">
          <text class="footprint-form-page__label">照片（选填）</text>
          <text class="footprint-form-page__count">{{ photos.length }}/3</text>
        </view>
        <view class="footprint-form-page__photos">
          <view v-for="(photo, index) in photos" :key="photo.key" class="footprint-form-page__photo">
            <image
              class="footprint-form-page__photo-image"
              :src="photo.localPath || photo.url"
              mode="aspectFill"
              @click="previewPhoto(index)"
            />
            <view class="footprint-form-page__photo-remove" aria-label="移除照片" @click="removePhoto(index)">
              <wd-icon name="close" size="24rpx" color="#FFFFFF" />
            </view>
            <view v-if="photo.status === 'uploading'" class="footprint-form-page__photo-mask">
              <wd-loading color="#FFFFFF" size="32rpx" />
            </view>
            <view v-else-if="photo.status === 'failed'" class="footprint-form-page__photo-mask">
              <text>上传失败，请重试保存</text>
            </view>
          </view>
          <view
            v-if="photos.length < 3"
            class="footprint-form-page__photo-add"
            role="button"
            @click="choosePhotos"
          >
            <wd-icon name="add" size="40rpx" color="#267A5A" />
            <text>添加照片</text>
          </view>
        </view>
        <text class="footprint-form-page__hint">照片会先移除定位和设备信息，再安全保存。</text>
      </view>

      <view class="footprint-form-page__section">
        <wd-textarea
          v-model="draft.memory"
          label="回忆（选填）"
          placeholder="那天有什么想记住的？"
          :maxlength="-1"
          :disabled="busy"
        />
        <text class="footprint-form-page__count">{{ memoryCount }}/300 字</text>
      </view>

      <text v-if="errorMessage" class="footprint-form-page__error">{{ errorMessage }}</text>
      <wd-button block round size="large" :loading="busy" :disabled="!canSave || busy" @click="save">
        {{ isEdit ? '保存修改' : '保存足迹' }}
      </wd-button>
    </view>

    <wd-popup v-model="discardOpen" position="bottom" custom-style="border-radius: 24rpx 24rpx 0 0;">
      <view class="footprint-form-page__discard">
        <text class="footprint-form-page__discard-title">放弃这次编辑吗？</text>
        <text class="footprint-form-page__discard-copy">还没有保存的地点、照片和回忆会被放弃。</text>
        <wd-button block round type="danger" @click="confirmDiscard">确认放弃</wd-button>
        <wd-button block round variant="plain" @click="discardOpen = false">继续编辑</wd-button>
      </view>
    </wd-popup>

    <wd-popup v-model="conflictOpen" position="center" custom-style="border-radius: 24rpx; width: 620rpx;">
      <view class="footprint-form-page__discard">
        <text class="footprint-form-page__discard-title">这条足迹刚刚被更新</text>
        <text class="footprint-form-page__discard-copy">
          你的草稿还在。再次保存会按你的草稿更新这条记录。
        </text>
        <text v-if="latestConflict" class="footprint-form-page__discard-copy">
          最新内容：{{ latestConflict.place.name }} · {{ latestConflict.visitedAt }}\n{{
            latestConflict.memory || '没有填写回忆'
          }}
        </text>
        <wd-button block round @click="confirmLatestVersion">确认最新版本并继续</wd-button>
        <wd-button block round variant="plain" @click="conflictOpen = false">先不处理</wd-button>
      </view>
    </wd-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, reactive, ref, watch } from 'vue'
import { onBackPress, onLoad, onUnload } from '@dcloudio/uni-app'
import { useToast } from '@wot-ui/ui'
import { useAuthStore } from '../../../store/modules/auth'
import { useHouseholdStore } from '../../../store/modules/household'
import { useFootprintStore } from '../../../store/modules/footprint'
import { chooseFootprintLocation, openFootprintLocationSetting } from '../../../utils/footprint-location'
import { returnAfterQuickCreate } from '../../../utils/quick-add'
import {
  abandonFootprintPhotosInCloud,
  humaniseFootprintError,
  uploadAndReviewFootprintPhoto,
  type FootprintUploadProgress,
} from '../../../services/footprint-cloud'
import { reencodePrivatePhoto, validatePrivatePhotoCount } from '../../../utils/private-photo'
import {
  canSaveFootprintDraft,
  footprintCharacterCount,
  footprintToday,
  hasFootprintDraftChanges,
} from './footprint-form-view'
import type { FootprintDraft, FootprintPhoto, FootprintEntryDetail } from '../../../types/footprint'

interface DraftPhoto {
  key: string
  localPath: string
  url: string
  resourceId?: string
  digest?: string
  progress?: FootprintUploadProgress
  status: 'ready' | 'uploading' | 'done' | 'failed'
}

const toast = useToast()
const instance = getCurrentInstance()
const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const footprintStore = useFootprintStore()
const today = footprintToday()
const loading = ref(true)
const loadError = ref('')
const draftHouseholdId = ref('')
const draftContextVersion = ref(-1)
const entryId = ref('')
const locationDenied = ref(false)
const errorMessage = ref('')
const photos = ref<DraftPhoto[]>([])
const discardOpen = ref(false)
const bypassBackGuard = ref(false)
const selectingPhotos = ref(false)
const saving = ref(false)
const conflictOpen = ref(false)
const latestConflict = ref<FootprintEntryDetail | null>(null)
const initialPhotoIds = ref(new Set<string>())
const requestId = ref(`footcreate_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`)
const operationToken = ref(`footupdate_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`)
const draft = reactive<FootprintDraft>({ place: null, visitedAt: today, memory: '', photos: [] })
const initialSnapshot = ref<FootprintDraft>({ place: null, visitedAt: today, memory: '', photos: [] })
const isEdit = computed(() => Boolean(entryId.value))
const busy = computed(
  () => saving.value || selectingPhotos.value || photos.value.some((photo) => photo.status === 'uploading'),
)
const memoryCount = computed(() => footprintCharacterCount(draft.memory))
const canSave = computed(() =>
  canSaveFootprintDraft(
    {
      ...draft,
      photos: photos.value.map((photo) => ({
        resourceId: photo.resourceId || photo.key,
        digest: photo.digest || '',
      })),
    },
    today,
  ),
)

function toDraftSnapshot(): FootprintDraft {
  return {
    entryId: entryId.value || undefined,
    place: draft.place ? { ...draft.place } : null,
    visitedAt: draft.visitedAt,
    memory: draft.memory,
    photos: photos.value.map((photo) => ({
      resourceId: photo.resourceId || photo.key,
      digest: photo.digest || '',
    })),
    editVersion: draft.editVersion,
  }
}

async function initialize(options: Record<string, string | undefined>): Promise<void> {
  loading.value = true
  loadError.value = ''
  if (!authStore.hasCompletedLogin) {
    loading.value = false
    footprintStore.resetFootprintStore()
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  await authStore.restore()
  const result = await householdStore.loadCurrent({ preserveExisting: true })
  if (result?.status !== 'HOME') {
    loading.value = false
    loadError.value = '请先创建或加入一个家'
    return
  }
  footprintStore.setHouseholdContext(result.household.id)
  draftHouseholdId.value = result.household.id
  draftContextVersion.value = footprintStore.contextVersion
  entryId.value = options.entryId || ''
  if (entryId.value) {
    const detail = await footprintStore.loadEntry(entryId.value)
    if (detail) {
      draft.place = { ...detail.place }
      draft.visitedAt = detail.visitedAt
      draft.memory = detail.memory
      draft.editVersion = detail.editVersion
      const urls = await footprintStore.hydratePhotoUrls(detail.photos)
      photos.value = detail.photos.map((photo) => ({
        key: photo.resourceId,
        localPath: '',
        url: urls[photo.resourceId] || '',
        resourceId: photo.resourceId,
        digest: photo.digest,
        status: 'done',
      }))
      initialPhotoIds.value = new Set(detail.photos.map((photo) => photo.resourceId))
    } else loadError.value = footprintStore.errorMessage || '足迹不存在或已不可访问'
  }
  initialSnapshot.value = toDraftSnapshot()
  loading.value = false
}

async function chooseLocation(): Promise<void> {
  if (busy.value) return
  const result = await chooseFootprintLocation()
  if (result.ok) {
    draft.place = result.place
    locationDenied.value = false
    return
  }
  locationDenied.value = result.reason === 'denied'
  if (result.message) toast.warning(result.message)
}

async function openSettings(): Promise<void> {
  if (await openFootprintLocationSetting()) {
    locationDenied.value = false
    await chooseLocation()
  }
}
function onDateChange(event: { detail: { value: string } }): void {
  draft.visitedAt = event.detail.value
}

async function choosePhotos(): Promise<void> {
  if (busy.value) return
  selectingPhotos.value = true
  const remaining = 3 - photos.value.length
  const selected = await new Promise<UniApp.ChooseMediaSuccessCallbackResult | null>((resolve, reject) => {
    uni.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: resolve,
      fail: (error) => (/cancel/i.test(error.errMsg) ? resolve(null) : reject(error)),
    })
  }).catch(() => {
    toast.error('暂时无法打开相册或相机，请检查权限后重试')
    return null
  })
  try {
    if (!selected || !validatePrivatePhotoCount(photos.value.length, selected.tempFiles.length)) return
    for (const file of selected.tempFiles) {
      try {
        const canvas = await new Promise<any>((resolve, reject) => {
          const query = uni.createSelectorQuery().in(instance?.proxy)
          query
            .select('#footprint-photo-canvas')
            .fields({ node: true, size: true } as any, (result: any) =>
              result?.node ? resolve(result.node) : reject(new Error('无法准备照片处理，请重新进入页面')),
            )
            .exec()
        })
        const localPath = await reencodePrivatePhoto(file.tempFilePath, canvas)
        photos.value.push({
          key: `local_${Date.now()}_${Math.random()}`,
          localPath,
          url: '',
          status: 'ready',
        })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '照片处理失败')
      }
    }
  } finally {
    selectingPhotos.value = false
  }
}

function removeLocalFile(path: string): void {
  const wxApi = (globalThis as typeof globalThis & { wx?: any }).wx
  if (path && wxApi?.getFileSystemManager)
    wxApi.getFileSystemManager().unlink({ filePath: path, fail: () => undefined })
}
function removePhoto(index: number): void {
  if (busy.value) return
  const [removed] = photos.value.splice(index, 1)
  removeLocalFile(removed?.localPath || '')
  if (removed?.resourceId && !initialPhotoIds.value.has(removed.resourceId))
    void abandonFootprintPhotosInCloud([removed.resourceId]).catch(() => undefined)
  else if (removed?.progress?.reservation)
    void abandonFootprintPhotosInCloud([removed.progress.reservation.resourceId]).catch(() => undefined)
}

async function abandonDraftPhotos(): Promise<void> {
  const resourceIds = photos.value
    .map((photo) => photo.resourceId || photo.progress?.reservation?.resourceId)
    .filter((id): id is string => Boolean(id && !initialPhotoIds.value.has(id)))
  photos.value.forEach((photo) => removeLocalFile(photo.localPath))
  await abandonFootprintPhotosInCloud(resourceIds).catch(() => undefined)
}

function syncNativeBackGuard(dirty: boolean): void {
  const wxApi = (globalThis as typeof globalThis & { wx?: any }).wx
  if (!wxApi?.enableAlertBeforeUnload || !wxApi?.disableAlertBeforeUnload) return
  if (dirty) wxApi.enableAlertBeforeUnload({ message: '还有未保存的足迹，确定离开吗？' })
  else wxApi.disableAlertBeforeUnload()
}

async function confirmLatestVersion(): Promise<void> {
  const latest = latestConflict.value
  if (!latest) {
    errorMessage.value = footprintStore.errorMessage || '无法读取最新内容'
    return
  }
  // 只更新比较版本，用户当前地点、照片和回忆保持不动，下一次保存即为明确覆盖。
  draft.editVersion = latest.editVersion
  // 已被对方移除的旧图不能重新引用；新选的照片和其余草稿保持不变。
  const retained = new Set(latest.photos.map((photo) => photo.resourceId))
  photos.value = photos.value.filter(
    (photo) =>
      !photo.resourceId || !initialPhotoIds.value.has(photo.resourceId) || retained.has(photo.resourceId),
  )
  operationToken.value = `footupdate_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`
  conflictOpen.value = false
  errorMessage.value = '已确认最新版本，可再次保存当前草稿'
}

function previewPhoto(index: number): void {
  const urls = photos.value.map((photo) => photo.localPath || photo.url).filter(Boolean)
  if (urls.length) uni.previewImage({ current: urls[index], urls })
}

async function uploadPendingPhotos(): Promise<FootprintPhoto[]> {
  const result: FootprintPhoto[] = []
  for (const photo of photos.value) {
    if (photo.resourceId && photo.digest) {
      result.push({ resourceId: photo.resourceId, digest: photo.digest })
      continue
    }
    photo.status = 'uploading'
    try {
      const progress = photo.progress || (photo.progress = {})
      const approved = await uploadAndReviewFootprintPhoto(photo.localPath, progress)
      photo.resourceId = approved.resourceId
      photo.digest = approved.digest
      photo.status = 'done'
      result.push(approved)
    } catch (error) {
      photo.status = 'failed'
      throw error
    }
  }
  return result
}

async function save(): Promise<void> {
  if (!canSave.value || !draft.place || busy.value) return
  if (
    draftHouseholdId.value !== footprintStore.householdId ||
    draftContextVersion.value !== footprintStore.contextVersion
  ) {
    errorMessage.value = '家庭信息已变化，请重新进入后再保存'
    return
  }
  saving.value = true
  errorMessage.value = ''
  try {
    const approved = await uploadPendingPhotos()
    const common = {
      place: draft.place,
      visitedAt: draft.visitedAt,
      memory: draft.memory,
      photoResourceIds: approved.map((photo) => photo.resourceId),
    }
    const saved = isEdit.value
      ? await footprintStore.updateEntry({
          ...common,
          entryId: entryId.value,
          editVersion: draft.editVersion || 1,
          operationToken: operationToken.value,
        })
      : await footprintStore.createEntry({ ...common, requestId: requestId.value })
    if (!saved) {
      errorMessage.value = footprintStore.errorMessage || '保存失败'
      if (footprintStore.errorCode === 'FOOTPRINT_CONFLICT') {
        latestConflict.value = await footprintStore.loadEntry(entryId.value)
        if (latestConflict.value) conflictOpen.value = true
      }
      return
    }
    bypassBackGuard.value = true
    syncNativeBackGuard(false)
    if (isEdit.value) {
      // 编辑流程保持原有反馈和返回节奏，不套用新建提示。
      toast.success('足迹已更新')
      setTimeout(() => uni.navigateBack(), 300)
    } else {
      await returnAfterQuickCreate('足迹已保存')
    }
  } catch (error) {
    errorMessage.value = humaniseFootprintError(error)
  } finally {
    saving.value = false
  }
}

async function confirmDiscard(): Promise<void> {
  bypassBackGuard.value = true
  syncNativeBackGuard(false)
  discardOpen.value = false
  await abandonDraftPhotos()
  uni.navigateBack()
}
onBackPress(() => {
  if (!bypassBackGuard.value && hasFootprintDraftChanges(initialSnapshot.value, toDraftSnapshot())) {
    discardOpen.value = true
    return true
  }
  return false
})
watch(
  () => !bypassBackGuard.value && hasFootprintDraftChanges(initialSnapshot.value, toDraftSnapshot()),
  syncNativeBackGuard,
)
onLoad((options) => {
  void initialize((options || {}) as Record<string, string | undefined>)
})
onUnload(() => {
  syncNativeBackGuard(false)
  photos.value.forEach((photo) => removeLocalFile(photo.localPath))
})
</script>

<style lang="scss" scoped>
.footprint-form-page {
  min-height: 100vh;
  padding: 36rpx 28rpx 80rpx;
  box-sizing: border-box;
  background: $brand-color-background;

  // 画布必须挂载在页面，移出屏幕而非 display:none，保持微信 2D 导出能力。
  &__canvas {
    position: fixed;
    left: -4000px;
    top: -4000px;
    width: 1px;
    height: 1px;
    pointer-events: none;
  }

  &__state {
    display: flex;
    min-height: 70vh;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24rpx;
  }
  &__state-title {
    color: $brand-color-text;
    font-size: 32rpx;
    font-weight: 700;
  }
  &__content {
    display: flex;
    flex-direction: column;
    gap: 26rpx;
  }
  &__heading {
    display: flex;
    flex-direction: column;
    gap: 10rpx;
    margin-bottom: 10rpx;
  }
  &__eyebrow {
    color: $brand-color-primary;
    font-size: 23rpx;
    letter-spacing: 3rpx;
  }
  &__title {
    color: $brand-color-text;
    font-size: 44rpx;
    font-weight: 700;
  }
  &__section {
    display: flex;
    flex-direction: column;
    gap: 16rpx;
    padding: 24rpx;
    border-radius: $brand-radius-card;
    background: $brand-color-surface;
  }
  &__section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__label {
    color: $brand-color-text;
    font-size: 27rpx;
    font-weight: 700;
  }
  &__count,
  &__hint {
    color: $brand-color-text-secondary;
    font-size: 23rpx;
  }
  &__location {
    display: flex;
    min-height: 104rpx;
    align-items: center;
    gap: 18rpx;
    padding: 12rpx 0;
  }
  &__location-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 8rpx;
  }
  &__location-name {
    color: $brand-color-text;
    font-size: 29rpx;
    font-weight: 600;
  }
  &__location-address {
    color: $brand-color-text-secondary;
    font-size: 23rpx;
    line-height: 1.5;
  }
  &__permission {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16rpx;
    padding: 18rpx;
    border-radius: 16rpx;
    background: #fff0ed;
    color: #a64f45;
    font-size: 23rpx;
  }
  &__date {
    display: flex;
    min-height: 88rpx;
    align-items: center;
    gap: 16rpx;
    border-radius: 16rpx;
    background: #effbf5;
    color: $brand-color-text;
    font-size: 27rpx;
    justify-content: center;
  }
  &__photos {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14rpx;
  }
  &__photo,
  &__photo-add {
    position: relative;
    height: 190rpx;
    overflow: hidden;
    border-radius: 18rpx;
    background: #effbf5;
  }
  &__photo-image {
    width: 100%;
    height: 100%;
  }
  &__photo-add {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8rpx;
    color: $brand-color-action;
    font-size: 22rpx;
  }
  &__photo-remove {
    position: absolute;
    top: 8rpx;
    right: 8rpx;
    display: flex;
    width: 44rpx;
    height: 44rpx;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.56);
  }
  &__photo-mask {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16rpx;
    background: rgba(0, 0, 0, 0.42);
    color: #fff;
    font-size: 22rpx;
    text-align: center;
    pointer-events: none;
  }
  &__error {
    color: #ba564b;
    font-size: 25rpx;
    text-align: center;
  }
  &__discard {
    display: flex;
    flex-direction: column;
    gap: 20rpx;
    padding: 38rpx 30rpx calc(38rpx + env(safe-area-inset-bottom));
    text-align: center;
  }
  &__discard-title {
    color: $brand-color-text;
    font-size: 34rpx;
    font-weight: 700;
  }
  &__discard-copy {
    margin-bottom: 8rpx;
    color: $brand-color-text-secondary;
    font-size: 25rpx;
  }
}
</style>
