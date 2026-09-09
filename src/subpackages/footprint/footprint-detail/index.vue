<template>
  <view class="footprint-detail-page">
    <view v-if="loading" class="footprint-detail-page__state"><wd-loading color="#267A5A" size="42rpx" /><text>正在加载足迹详情</text></view>
    <view v-else-if="errorMessage || !detail" class="footprint-detail-page__state">
      <wd-icon name="warning" size="64rpx" color="#BA564B" /><text>{{ errorMessage || '足迹不存在或已不可访问' }}</text><wd-button variant="plain" @click="loadDetail">重新加载</wd-button>
    </view>
    <view v-else class="footprint-detail-page__content">
      <view class="footprint-detail-page__hero">
        <wd-icon name="location" size="52rpx" color="#267A5A" />
        <view class="footprint-detail-page__hero-copy"><text class="footprint-detail-page__place">{{ detail.place.name }}</text><text class="footprint-detail-page__address">{{ detail.place.address }}</text></view>
      </view>
      <!-- 导航只使用当前详情地点，与编辑、删除操作分开。 -->
      <FootprintNavigationButton :place="detail.place" />
      <text class="footprint-detail-page__date">{{ formatFootprintVisitDate(detail.visitedAt) }}</text>
      <FootprintPhotoGallery :photos="detail.photos" :photo-urls="photoUrls" />
      <view v-if="detail.memory" class="footprint-detail-page__memory"><text>{{ detail.memory }}</text></view>
      <view class="footprint-detail-page__meta">
        <text>由{{ detail.creator.isSelf ? '我' : detail.creator.nickname }}记录</text>
        <text>最后修改：{{ formatUpdatedAt(detail.updatedAt) }}</text>
        <view v-if="detail.samePlaceCount > 1" class="footprint-detail-page__same-place" role="button" @click="goSamePlace">这个地方一共去过 {{ detail.samePlaceCount }} 次，查看全部</view>
      </view>
      <view class="footprint-detail-page__actions">
        <wd-button block round variant="plain" @click="goEdit">编辑足迹</wd-button>
        <wd-button block round type="danger" :loading="deleting" @click="deleteOpen = true">删除足迹</wd-button>
      </view>
    </view>

    <wd-popup v-model="deleteOpen" position="bottom" custom-style="border-radius: 24rpx 24rpx 0 0;">
      <view class="footprint-detail-page__confirm">
        <text class="footprint-detail-page__confirm-title">删除这条足迹吗？</text>
        <text class="footprint-detail-page__confirm-copy">{{ detail?.place.name }} · {{ detail && formatFootprintVisitDate(detail.visitedAt) }}</text>
        <wd-button block round type="danger" :loading="deleting" @click="confirmDelete">确认删除</wd-button>
        <wd-button block round variant="plain" @click="deleteOpen = false">取消</wd-button>
      </view>
    </wd-popup>

    <!-- 删除确认和删除执行期间隐藏公共入口，避免两个操作层竞争。 -->
    <GlobalQuickAdd
      :visible="Boolean(detail && householdStore.household) && !loading && !errorMessage"
      :blocked="deleteOpen || deleting"
    />
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import FootprintPhotoGallery from '../components/FootprintPhotoGallery.vue'
import FootprintNavigationButton from '../../../components/FootprintNavigationButton.vue'
import GlobalQuickAdd from '../../../components/GlobalQuickAdd.vue'
import { useAuthStore } from '../../../store/modules/auth'
import { useHouseholdStore } from '../../../store/modules/household'
import { useFootprintStore } from '../../../store/modules/footprint'
import { formatFootprintVisitDate } from '../../../utils/footprint-display'
import type { FootprintEntryDetail } from '../../../types/footprint'

const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const footprintStore = useFootprintStore()
const entryId = ref('')
const detail = ref<FootprintEntryDetail | null>(null)
const photoUrls = ref<Record<string, string>>({})
const loading = ref(true)
const errorMessage = ref('')
const deleteOpen = ref(false)
const deleting = ref(false)

function formatUpdatedAt(value: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }

async function loadDetail(): Promise<void> {
  if (!entryId.value) { loading.value = false; errorMessage.value = '足迹不存在或已不可访问'; return }
  loading.value = true; errorMessage.value = ''
  detail.value = null; photoUrls.value = {}
  if (!authStore.hasCompletedLogin) { loading.value = false; footprintStore.resetFootprintStore(); uni.reLaunch({ url: '/pages/login/index' }); return }
  await authStore.restore()
  const home = await householdStore.loadCurrent({ preserveExisting: true })
  if (home?.status !== 'HOME') { loading.value = false; errorMessage.value = '足迹不存在或已不可访问'; return }
  footprintStore.setHouseholdContext(home.household.id)
  const version = footprintStore.contextVersion
  detail.value = await footprintStore.loadEntry(entryId.value)
  if (detail.value) photoUrls.value = await footprintStore.hydratePhotoUrls(detail.value.photos)
  else errorMessage.value = footprintStore.errorMessage || '足迹不存在或已不可访问'
  loading.value = false
  if (version !== footprintStore.contextVersion) { detail.value = null; photoUrls.value = {}; errorMessage.value = '家庭信息已变化，请重新进入' }
}

function goEdit(): void { uni.navigateTo({ url: `/subpackages/footprint/footprint-form/index?entryId=${entryId.value}` }) }
function goSamePlace(): void { uni.reLaunch({ url: `/pages/footprint/index?placeKey=${detail.value?.placeKey || ''}` }) }
async function confirmDelete(): Promise<void> {
  if (deleting.value) return
  deleting.value = true
  const ok = await footprintStore.deleteEntry(entryId.value, `footdelete_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`)
  deleting.value = false
  if (!ok) { errorMessage.value = footprintStore.errorMessage || '删除失败'; deleteOpen.value = false; return }
  deleteOpen.value = false
  uni.navigateBack()
}

onLoad((options) => { entryId.value = String(options?.entryId || '') })
onShow(() => { void loadDetail() })
</script>

<style lang="scss" scoped>
.footprint-detail-page {
  min-height: 100vh;
  padding: 34rpx 28rpx 80rpx;
  box-sizing: border-box;
  background: $brand-color-background;

  &__state { display: flex; min-height: 70vh; flex-direction: column; align-items: center; justify-content: center; gap: 24rpx; color: $brand-color-text-secondary; font-size: 27rpx; text-align: center; }
  &__content { display: flex; flex-direction: column; gap: 26rpx; }
  &__hero { display: flex; align-items: flex-start; gap: 18rpx; padding: 28rpx; border-radius: $brand-radius-card; background: $brand-color-surface; }
  &__hero-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 10rpx; }
  &__place { color: $brand-color-text; font-size: 40rpx; font-weight: 700; }
  &__address { color: $brand-color-text-secondary; font-size: 24rpx; line-height: 1.55; }
  &__date { color: $brand-color-action; font-size: 29rpx; font-weight: 600; }
  &__memory { padding: 28rpx; border-radius: $brand-radius-card; background: $brand-color-surface; color: $brand-color-text; font-size: 28rpx; line-height: 1.8; white-space: pre-wrap; }
  &__meta { display: flex; flex-direction: column; gap: 10rpx; padding: 22rpx; border-radius: 18rpx; background: #effbf5; color: $brand-color-text-secondary; font-size: 23rpx; }
  &__same-place { color: $brand-color-action; font-weight: 600; }
  &__actions, &__confirm { display: flex; flex-direction: column; gap: 18rpx; }
  &__confirm { padding: 38rpx 30rpx calc(38rpx + env(safe-area-inset-bottom)); text-align: center; }
  &__confirm-title { color: $brand-color-text; font-size: 34rpx; font-weight: 700; }
  &__confirm-copy { margin-bottom: 8rpx; color: $brand-color-text-secondary; font-size: 25rpx; }
}
</style>
