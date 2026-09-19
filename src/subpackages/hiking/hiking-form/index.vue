<template>
  <view class="hiking-form">
    <wd-toast />
    <!-- Wot 没有图片隐私重编码组件；隐藏画布只在本机移除照片元信息。 -->
    <canvas id="hiking-photo-canvas" type="2d" class="hiking-form__canvas" />

    <view v-if="loading" class="hiking-form__state">
      <wd-loading color="#267A5A" size="42rpx" />
      <text>正在加载徒步编辑页</text>
    </view>
    <view v-else-if="loadError" class="hiking-form__state">
      <wd-icon name="warning" size="64rpx" color="#BA564B" />
      <text>{{ loadError }}</text>
      <wd-button size="small" variant="plain" @click="initialize">重新加载</wd-button>
    </view>

    <template v-else>
      <view class="hiking-form__intro">
        <text class="hiking-form__intro-title">
          {{ isEdit ? '整理这次共同徒步' : '补上一段一起走过的路' }}
        </text>
        <text class="hiking-form__intro-copy">
          没有路线时需要选择地点；有 KML 路线时，其余资料都可以以后再补。
        </text>
      </view>

      <view class="hiking-form__section">
        <text class="hiking-form__section-title">路线</text>
        <view v-if="draft.route" class="hiking-form__route">
          <HikingRouteMap :route="draft.route" @ready="routeReady = true" @error="routeReady = false" />
          <view class="hiking-form__route-heading">
            <text>{{ draft.routeFileName }}</text>
            <text>{{ routePointCount }} 个点 · {{ draft.route.segments.length }} 段</text>
          </view>
          <HikingMetrics :metrics="metrics" />
          <view class="hiking-form__route-actions">
            <wd-button size="small" variant="plain" @click="openImport">更换 KML</wd-button>
            <wd-button size="small" type="danger" plain @click="removeRoute">移除路线</wd-button>
          </view>
        </view>
        <view v-else class="hiking-form__route-empty" @click="openImport">
          <view class="hiking-form__route-icon">
            <wd-icon name="folder" size="48rpx" color="#267A5A" />
          </view>
          <view class="hiking-form__route-copy">
            <text class="hiking-form__route-title">导入 KML 路线</text>
            <text class="hiking-form__route-note">从微信聊天选择，先在本机预览</text>
          </view>
          <wd-icon name="arrow-right" size="32rpx" color="#74847D" />
        </view>
      </view>

      <view class="hiking-form__section">
        <text class="hiking-form__section-title">基本资料</text>
        <wd-input
          v-model="draft.name"
          label="名称"
          placeholder="例如：周末白云山"
          :maxlength="50"
          clearable
        />
        <view class="hiking-form__field">
          <text class="hiking-form__field-label">日期</text>
          <picker mode="date" :value="draft.hikedAt" :end="today" @change="onDateChange">
            <view class="hiking-form__field-value">{{ draft.hikedAt || '暂无数据' }}</view>
          </picker>
          <wd-icon name="arrow-right" size="30rpx" color="#74847D" />
        </view>
        <view class="hiking-form__field" @click="choosePlace">
          <text class="hiking-form__field-label">地点</text>
          <text class="hiking-form__field-value">
            {{ draft.place?.name || (draft.route ? '暂无数据' : '请选择地点') }}
          </text>
          <wd-icon name="arrow-right" size="30rpx" color="#74847D" />
        </view>
        <wd-input
          v-if="!draft.route"
          v-model="draft.manualDistanceKm"
          label="距离"
          placeholder="可选"
          type="digit"
          suffix="公里"
        />
        <wd-input
          v-model="draft.durationMinutes"
          label="有效时长"
          placeholder="可选"
          type="digit"
          suffix="分钟"
        />
        <wd-textarea
          v-model="draft.memory"
          label="感受"
          placeholder="这一路，最想记住什么？"
          :maxlength="300"
          show-word-limit
          auto-height
        />
      </view>

      <view class="hiking-form__section">
        <view class="hiking-form__section-heading">
          <text class="hiking-form__section-title">照片</text>
          <text class="hiking-form__photo-count">{{ photos.length }}/3</text>
        </view>
        <view class="hiking-form__photos">
          <view v-for="(photo, index) in photos" :key="photo.key" class="hiking-form__photo">
            <image
              class="hiking-form__photo-image"
              :src="photo.localPath || photo.url"
              mode="aspectFill"
              @click="previewPhoto(index)"
            />
            <view class="hiking-form__photo-remove" @click="removePhoto(index)">
              <wd-icon name="close" size="24rpx" color="#FFFFFF" />
            </view>
            <view v-if="photo.status === 'uploading'" class="hiking-form__photo-mask">
              <wd-loading color="#FFFFFF" size="32rpx" />
            </view>
            <view v-else-if="photo.status === 'failed'" class="hiking-form__photo-mask">
              <text>上传失败，请重试保存</text>
            </view>
          </view>
          <view v-if="photos.length < 3" class="hiking-form__photo-add" @click="choosePhotos">
            <wd-icon name="add" size="40rpx" color="#267A5A" />
            <text>添加照片</text>
          </view>
        </view>
        <text class="hiking-form__photo-hint">照片会先移除定位和设备信息，再安全保存。</text>
      </view>

      <view v-if="!draft.route" class="hiking-form__manual-metrics">
        <text class="hiking-form__manual-title">可识别成果</text>
        <HikingMetrics :metrics="metrics" />
      </view>
      <view v-if="formError" class="hiking-form__error">{{ formError }}</view>
      <wd-button
        block
        round
        :loading="saving"
        :disabled="saving || selectingPhotos || (Boolean(draft.route) && !routeReady)"
        @click="save"
      >
        {{ isEdit ? '保存修改' : '保存共同徒步' }}
      </wd-button>
      <text v-if="draft.route && !routeReady" class="hiking-form__save-note">路线成功显示后才能保存</text>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, reactive, ref } from 'vue'
import { onLoad, onUnload, onReady } from '@dcloudio/uni-app'
import HikingMetrics from '../components/HikingMetrics.vue'
import HikingRouteMap from '../components/HikingRouteMap.vue'
import type { FootprintUploadProgress } from '../../../services/footprint-cloud'
import {
  abandonFootprintPhotosInCloud,
  getFootprintPhotoUrlsInCloud,
  uploadAndReviewFootprintPhoto,
} from '../../../services/footprint-cloud'
import { getHikeInCloud, getHikingRouteInCloud, humaniseHikingError } from '../../../services/hiking-cloud'
import { useAuthStore } from '../../../store/modules/auth'
import { useHouseholdStore } from '../../../store/modules/household'
import { useHikingStore } from '../../../store/modules/hiking'
import type { HikingEntryDetail, HikingKmlParseResult, HikingPhoto } from '../../../types/hiking'
import { reencodePrivatePhoto, validatePrivatePhotoCount } from '../../../utils/private-photo'
import {
  clearHikingRecordingDraft,
  loadHikingRecordingDraft,
  routeFromTracker,
} from '../hiking-record/hiking-record-draft'
import {
  createEmptyHikingFormDraft,
  hikingFormMetrics,
  placeFromChooseLocation,
  validateHikingForm,
} from './hiking-form-view'

interface DraftPhoto {
  key: string
  localPath: string
  url: string
  resourceId?: string
  digest?: string
  progress?: FootprintUploadProgress
  status: 'ready' | 'uploading' | 'done' | 'failed'
}

const instance = getCurrentInstance()
const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const hikingStore = useHikingStore()
const draft = reactive(createEmptyHikingFormDraft())
const loading = ref(true)
const loadError = ref('')
const saving = ref(false)
const selectingPhotos = ref(false)
const formError = ref('')
const routeReady = ref(false)
const shouldOpenImport = ref(false)
const fromTracking = ref(false)
const entryId = ref('')
const editVersion = ref(1)
const existingRouteResourceId = ref<string | null>(null)
const routeChanged = ref(false)
const photos = ref<DraftPhoto[]>([])
const initialPhotoIds = ref(new Set<string>())
const saved = ref(false)
const requestId = ref(`hikecreate_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`)
const operationToken = ref(`hikeupdate_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`)
const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
const isEdit = computed(() => Boolean(entryId.value))
const metrics = computed(() => hikingFormMetrics(draft))
const routePointCount = computed(
  () => draft.route?.segments.reduce((sum, segment) => sum + segment.points.length, 0) || 0,
)

function applyImportedRoute(payload: { fileName: string; result: HikingKmlParseResult }): void {
  draft.route = payload.result.route
  draft.routeFileName = payload.fileName
  draft.manualDistanceKm = ''
  routeChanged.value = true
  routeReady.value = false
  formError.value = ''
}

/** EventChannel 由发起导航的表单监听，导入页只回传本机解析后的规范路线。 */
function openImport(): void {
  if (saving.value) return
  uni.navigateTo({
    url: '/subpackages/hiking/hiking-import/index',
    success: (navigation) => navigation.eventChannel.on('hikingKmlImported', applyImportedRoute),
  })
}

function removeRoute(): void {
  draft.route = null
  draft.routeFileName = ''
  routeChanged.value = true
  routeReady.value = false
}

function onDateChange(event: { detail: { value: string } }): void {
  draft.hikedAt = event.detail.value
}

function choosePlace(): void {
  if (saving.value) return
  uni.chooseLocation({
    success: (result) => {
      draft.place = placeFromChooseLocation(result)
      formError.value = ''
    },
    fail: (error) => {
      if (!/cancel/i.test(error.errMsg || '')) formError.value = '暂时无法选择地点，请检查位置权限后重试'
    },
  })
}

function removeLocalFile(path: string): void {
  const wxApi = (globalThis as typeof globalThis & { wx?: any }).wx
  if (path && wxApi?.getFileSystemManager) {
    wxApi.getFileSystemManager().unlink({ filePath: path, fail: () => undefined })
  }
}

async function choosePhotos(): Promise<void> {
  if (saving.value || selectingPhotos.value) return
  selectingPhotos.value = true
  try {
    const remaining = 3 - photos.value.length
    const selected = await new Promise<UniApp.ChooseMediaSuccessCallbackResult | null>((resolve, reject) => {
      uni.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: resolve,
        fail: (error) => (/cancel/i.test(error.errMsg || '') ? resolve(null) : reject(error)),
      })
    })
    if (!selected || !validatePrivatePhotoCount(photos.value.length, selected.tempFiles.length)) return
    for (const file of selected.tempFiles) {
      const canvas = await new Promise<any>((resolve, reject) => {
        uni
          .createSelectorQuery()
          .in(instance?.proxy)
          .select('#hiking-photo-canvas')
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
    }
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '暂时无法选择照片，请检查权限后重试'
  } finally {
    selectingPhotos.value = false
  }
}

function removePhoto(index: number): void {
  if (saving.value || selectingPhotos.value) return
  const [removed] = photos.value.splice(index, 1)
  removeLocalFile(removed?.localPath || '')
  const resourceId = removed?.resourceId || removed?.progress?.reservation?.resourceId
  if (resourceId && !initialPhotoIds.value.has(resourceId)) {
    void abandonFootprintPhotosInCloud([resourceId]).catch(() => undefined)
  }
}

function previewPhoto(index: number): void {
  const urls = photos.value.map((photo) => photo.localPath || photo.url).filter(Boolean)
  if (urls.length) uni.previewImage({ current: urls[index], urls })
}

async function uploadPendingPhotos(): Promise<HikingPhoto[]> {
  const result: HikingPhoto[] = []
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

function applyDetail(detail: HikingEntryDetail): void {
  draft.name = detail.name
  draft.hikedAt = detail.hikedAt || ''
  draft.place = detail.place ? { ...detail.place } : null
  draft.memory = detail.memory
  draft.manualDistanceKm =
    detail.hasRoute || detail.metrics.distanceMeters == null
      ? ''
      : String(detail.metrics.distanceMeters / 1000)
  draft.durationMinutes =
    detail.metrics.durationSeconds == null ? '' : String(detail.metrics.durationSeconds / 60)
  editVersion.value = detail.editVersion
  existingRouteResourceId.value = detail.routeResourceId
}

async function initialize(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    if (!authStore.hasCompletedLogin) {
      uni.reLaunch({ url: '/pages/login/index' })
      return
    }
    await authStore.restore()
    const homeResult = await householdStore.loadCurrent({ preserveExisting: true })
    if (homeResult?.status !== 'HOME') throw new Error('请先创建或加入一个家')
    hikingStore.setHouseholdContext(homeResult.household.id)
    if (!entryId.value) {
      if (fromTracking.value) {
        const recording = loadHikingRecordingDraft()
        if (!recording) throw new Error('没有找到现场记录草稿，请重新开始记录')
        draft.route = routeFromTracker(recording)
        draft.routeFileName = draft.route ? '现场记录路线' : ''
        draft.durationMinutes = recording.activeSeconds
          ? String(Math.round((recording.activeSeconds / 60) * 10) / 10)
          : ''
        draft.hikedAt = today
        routeChanged.value = Boolean(draft.route)
        routeReady.value = false
      }
      return
    }
    const detail = await getHikeInCloud(entryId.value)
    if ('status' in detail) throw detail
    applyDetail(detail)
    const photoResults = await getFootprintPhotoUrlsInCloud(detail.photos.map((photo) => photo.resourceId))
    const photoUrls = Object.fromEntries(photoResults.map((photo) => [photo.resourceId, photo.url || '']))
    photos.value = detail.photos.map((photo) => ({
      key: photo.resourceId,
      localPath: '',
      url: photoUrls[photo.resourceId] || '',
      resourceId: photo.resourceId,
      digest: photo.digest,
      status: 'done',
    }))
    initialPhotoIds.value = new Set(detail.photos.map((photo) => photo.resourceId))
    if (detail.routeResourceId) {
      draft.route = await getHikingRouteInCloud(detail.routeResourceId)
      draft.routeFileName = '已保存路线'
      routeReady.value = false
    }
  } catch (error) {
    loadError.value = humaniseHikingError(error)
  } finally {
    loading.value = false
  }
}

/** 创建与更新都固定复用同一凭证，网络超时重试不会生成第二条记录。 */
async function save(): Promise<void> {
  if (saving.value || selectingPhotos.value) return
  formError.value = validateHikingForm(draft) || ''
  if (formError.value) return
  saving.value = true
  try {
    const approved = await uploadPendingPhotos()
    const photoResourceIds = approved.map((photo) => photo.resourceId)
    const result = isEdit.value
      ? await hikingStore.updateDraft({
          draft,
          entryId: entryId.value,
          editVersion: editVersion.value,
          operationToken: operationToken.value,
          photoResourceIds,
          existingRouteResourceId: existingRouteResourceId.value,
          routeChanged: routeChanged.value,
        })
      : await hikingStore.saveDraft(draft, requestId.value, photoResourceIds)
    if (!result) {
      formError.value = hikingStore.errorMessage || '暂时无法保存，请稍后重试'
      return
    }
    saved.value = true
    if (fromTracking.value) clearHikingRecordingDraft()
    uni.showToast({ title: isEdit.value ? '徒步已更新' : '共同徒步已保存', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 500)
  } catch (error) {
    formError.value = humaniseHikingError(error)
  } finally {
    saving.value = false
  }
}

onLoad((options) => {
  entryId.value = typeof options?.entryId === 'string' ? options.entryId : ''
  shouldOpenImport.value = !entryId.value && options?.import === '1'
  fromTracking.value = !entryId.value && options?.tracking === '1'
  void initialize()
})
onReady(() => {
  if (shouldOpenImport.value) openImport()
})
onUnload(() => {
  photos.value.forEach((photo) => removeLocalFile(photo.localPath))
  if (!saved.value) {
    const newResourceIds = photos.value
      .map((photo) => photo.resourceId || photo.progress?.reservation?.resourceId)
      .filter((id): id is string => Boolean(id && !initialPhotoIds.value.has(id)))
    void abandonFootprintPhotosInCloud(newResourceIds).catch(() => undefined)
  }
})
</script>

<style lang="scss" scoped>
.hiking-form {
  min-height: 100vh;
  padding: 28rpx 28rpx 80rpx;
  box-sizing: border-box;
  background: $brand-color-background;

  &__canvas {
    position: fixed;
    top: -4000px;
    left: -4000px;
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
    gap: 20rpx;
    color: $brand-color-text-secondary;
    text-align: center;
  }

  &__intro {
    display: flex;
    flex-direction: column;
    padding: 30rpx;
    border-radius: 28rpx;
    background: #edf9f3;
  }

  &__intro-title {
    color: $brand-color-text;
    font-size: 34rpx;
    font-weight: 800;
  }

  &__intro-copy {
    margin-top: 12rpx;
    color: $brand-color-text-secondary;
    font-size: 23rpx;
    line-height: 1.6;
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    margin-top: 24rpx;
    padding: 26rpx;
    border-radius: 26rpx;
    background: $brand-color-surface;
    box-shadow: 0 8rpx 24rpx rgba(38, 90, 70, 0.04);
  }

  &__section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__section-title {
    margin-bottom: 14rpx;
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 800;
  }

  &__route {
    display: flex;
    flex-direction: column;
    gap: 18rpx;
  }

  &__route-heading {
    display: flex;
    justify-content: space-between;
    gap: 16rpx;
    color: $brand-color-text-secondary;
    font-size: 21rpx;
  }

  &__route-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12rpx;
  }

  &__route-empty {
    display: flex;
    min-height: 112rpx;
    align-items: center;
    gap: 18rpx;
    padding: 20rpx;
    border: 2rpx dashed rgba(38, 122, 90, 0.2);
    border-radius: 22rpx;
    background: #f6fbf8;
  }

  &__route-icon {
    display: flex;
    width: 72rpx;
    height: 72rpx;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 20rpx;
    background: #e7f6ef;
  }

  &__route-copy {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 6rpx;
  }

  &__route-title {
    color: $brand-color-text;
    font-size: 27rpx;
    font-weight: 700;
  }

  &__route-note {
    color: $brand-color-text-secondary;
    font-size: 21rpx;
  }

  &__field {
    display: flex;
    min-height: 96rpx;
    align-items: center;
    gap: 16rpx;
    border-bottom: 1rpx solid $brand-color-border;
  }

  &__field-label {
    width: 160rpx;
    flex-shrink: 0;
    color: $brand-color-text;
    font-size: 26rpx;
  }

  &__field-value {
    min-height: 88rpx;
    flex: 1;
    color: $brand-color-text-secondary;
    font-size: 26rpx;
    line-height: 88rpx;
    text-align: right;
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

  &__photo-count,
  &__photo-hint {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
  }

  &__manual-metrics {
    margin: 24rpx 0;
    padding: 24rpx;
    border-radius: 24rpx;
    background: $brand-color-surface;
  }

  &__manual-title {
    display: block;
    margin-bottom: 18rpx;
    color: $brand-color-text;
    font-size: 26rpx;
    font-weight: 700;
  }

  &__error {
    margin: 20rpx 4rpx;
    padding: 18rpx 20rpx;
    border-radius: 16rpx;
    background: #fff0ed;
    color: #ba564b;
    font-size: 23rpx;
    line-height: 1.5;
  }

  &__save-note {
    display: block;
    margin-top: 14rpx;
    color: $brand-color-text-secondary;
    font-size: 21rpx;
    text-align: center;
  }
}
</style>
