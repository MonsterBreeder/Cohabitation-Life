<template>
  <view class="page">
    <wd-toast />

    <!-- 骨架保留两张资料卡的真实结构，但不展示伪造名称或头像。 -->
    <view v-if="isLoading" class="home-skeleton" data-testid="home-loading">
      <wd-skeleton :row-col="householdSkeleton" animation="gradient" />
      <wd-skeleton :row-col="memberSkeleton" animation="gradient" />
    </view>

    <view v-else-if="loadError" class="page-state" data-testid="home-error">
      <wd-icon name="warning" size="76rpx" color="#ff8f79" />
      <text class="page-state__title">家庭资料暂时走丢了</text>
      <text class="page-state__copy">{{ loadError }}</text>
      <wd-button type="primary" :loading="isLoading" @click="loadHome">重新加载</wd-button>
    </view>

    <view v-else-if="household && profile" class="home-content" :data-testid="household.memberCount === 1 ? 'home-single-member' : 'home-two-members'">
      <view class="hero">
        <text class="hero__eyebrow">家里有事</text>
        <text class="hero__title">欢迎回家</text>
        <text class="hero__copy">家不在大小，有人惦记就好。</text>
      </view>

      <HomeSummaryCard
        :name="household.name"
        :avatar-src="household.avatar.kind === 'builtin' ? householdAvatarSource(household.avatar.id) : householdAvatarUrl"
        :member-count="household.memberCount"
      />

      <!-- 单人家庭：保留邀请入口，事项区显示邀请占位 -->
      <view v-if="household.memberCount === 1" class="home-empty">
        <wd-icon name="calendar" size="68rpx" color="#43c89a" />
        <text class="home-empty__title">等邀请完成后，我们就从第一件小事开始。</text>
        <text class="home-empty__copy">先和另一半一起加入这个家，再开始记下第一件事。</text>
      </view>

      <!-- 双人家庭：事项区分组 + 空状态 + 快速添加 -->
      <template v-else>
        <view v-if="taskCurrent" class="home-tasks">
          <TaskList
            v-if="hasAnyOpenTask"
            :current="taskCurrent"
            @press="onPressTask"
          />
          <view v-else class="home-empty" data-testid="home-tasks-empty">
            <wd-icon name="notes" size="68rpx" color="#43c89a" />
            <text class="home-empty__title">先记下一件事</text>
            <text class="home-empty__copy">生活里的小事记下来，才不会从聊天里溜走。</text>
          </view>
        </view>
        <view v-if="homeError" class="home-error" data-testid="home-tasks-error">{{ homeError }}</view>
        <view v-if="hasCompletedLink" class="home-completed-link" data-testid="home-completed-link" @click="goCompleted">
          <view class="home-completed-link__icon">
            <wd-icon name="history" size="40rpx" color="#267A5A" />
          </view>
          <view class="home-completed-link__text">
            <text class="home-completed-link__title">看看我们做完的事</text>
            <text class="home-completed-link__copy">已完成和已放弃会一直留着</text>
          </view>
          <text class="home-completed-link__arrow">›</text>
        </view>
      </template>
    </view>

    <!-- 悬浮"快速添加"按钮：仅在有家庭时显示；用 Wot UI 的 wd-fab 组件，避开 tab bar -->
    <wd-fab
      v-if="household && household.memberCount === 2"
      type="primary"
      position="right-bottom"
      :expandable="false"
      :gap="{ right: 32, bottom: 180 }"
      :loading="isQuickAdd"
      :aria-busy="isQuickAdd"
      data-testid="home-quick-add"
      @click="goAdd"
    />

    <AppTabBar active="home" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { onShow } from '@dcloudio/uni-app'
import HomeSummaryCard from '../../components/home/HomeSummaryCard.vue'
import AppTabBar from '../../components/AppTabBar.vue'
import TaskList from '../../components/task/TaskList.vue'
import { useAuthStore } from '../../store/modules/auth'
import { useHouseholdStore } from '../../store/modules/household'
import { useTaskStore } from '../../store/modules/task'
import { householdAvatarSource, resolveHomeLoadDestination } from './home-view'
import { getAvatarTemporaryUrl } from '../../services/avatar-media'
import type { CurrentTasks } from '../../types/task'

const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const taskStore = useTaskStore()
const { hasCompletedLogin, errorMessage: authError } = storeToRefs(authStore)
const { phase, household, profile, errorMessage: householdError } = storeToRefs(householdStore)
const { current: taskCurrent, errorMessage: taskError } = storeToRefs(taskStore)

// 两组骨架分别对应家庭卡和成员卡，重试时复用同一布局。
const householdSkeleton = [[{ type: 'circle', size: '72px', marginRight: '16px' }, { width: '65%', height: '72px' }]]
const memberSkeleton = [[{ type: 'circle', size: '52px', marginRight: '14px' }, { width: '58%', height: '52px' }]]
const isLoading = computed(() => phase.value === 'checking')
const loadError = computed(() => authError.value || householdError.value)
const homeError = computed(() => taskError.value || '')
const householdAvatarUrl = ref('/static/avatars/households/household-01.png')
const isQuickAdd = ref(false)

const hasAnyOpenTask = computed(() => {
  const c = taskCurrent.value as CurrentTasks | undefined
  if (!c) return false
  return c.priority.length > 0
    || c.groups.low_stock.length > 0
    || c.groups.to_handle.length > 0
    || c.groups.expiring.length > 0
})

const hasCompletedLink = computed(() => household.value?.memberCount === 2)

/** 使用重新进入页面清空错误页面历史，避免返回到失效身份状态。 */
function relaunch(url: string): void {
  uni.reLaunch({ url })
}

function onPressTask(taskId: string): void {
  uni.navigateTo({ url: `/subpackages/task/task-detail/index?taskId=${taskId}` })
}

function goAdd(): void {
  if (isQuickAdd.value) return
  isQuickAdd.value = true
  uni.navigateTo({ url: '/subpackages/task/add-task/index' })
  // 简单防护，避免连续点
  setTimeout(() => { isQuickAdd.value = false }, 500)
}

function goCompleted(): void {
  uni.navigateTo({ url: '/subpackages/task/completed-tasks/index' })
}

/** 登录确认和家庭查询串行执行，旧资料在查询开始时立即清空。 */
async function loadHome(): Promise<void> {
  if (resolveHomeLoadDestination(hasCompletedLogin.value) === 'login') {
    relaunch('/pages/login/index')
    return
  }

  await authStore.restore()
  const route = authStore.consumeNavigationIntent()
  if (authError.value) return
  if (route && route.url !== '/pages/index/index') {
    relaunch(route.url)
    return
  }

  const result = await householdStore.loadCurrent()
  if (result?.status === 'HOME') {
    if (result.household.avatar.kind === 'custom') householdAvatarUrl.value = await getAvatarTemporaryUrl(result.household.avatar.resourceId).catch(() => householdAvatarUrl.value)
    // 拉事项列表
    await taskStore.loadCurrent()
  }
  const destination = resolveHomeLoadDestination(hasCompletedLogin.value, result?.status)
  if (destination === 'login') relaunch('/pages/login/index')
  if (destination === 'create-home') relaunch('/subpackages/household/create-home/index')
}

onShow(() => {
  void loadHome()
})
</script>

<style lang="scss" scoped>
.page { min-height: 100vh; padding: 48rpx 32rpx 160rpx; box-sizing: border-box; background: $brand-color-background; }
.home-skeleton { display: flex; flex-direction: column; gap: 52rpx; padding-top: 180rpx; }
.page-state { display: flex; min-height: calc(100vh - 128rpx); flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.page-state__title { margin-top: 28rpx; color: $brand-color-text; font-size: 34rpx; font-weight: 700; }
.page-state__copy { max-width: 520rpx; margin: 16rpx 0 36rpx; color: $brand-color-text-secondary; font-size: 26rpx; line-height: 1.65; }
.home-content { display: flex; flex-direction: column; }
.hero { display: flex; flex-direction: column; margin-bottom: 42rpx; }
.hero__eyebrow { color: $brand-color-primary; font-size: 23rpx; font-weight: 600; letter-spacing: 4rpx; }
.hero__title { margin-top: 14rpx; color: $brand-color-text; font-size: 52rpx; font-weight: 700; line-height: 1.3; }
.hero__copy { margin-top: 12rpx; color: $brand-color-text-secondary; font-size: 27rpx; line-height: 1.6; }
.home-empty { display: flex; flex-direction: column; align-items: center; margin-top: 36rpx; padding: 54rpx 32rpx; border: 2rpx dashed $brand-color-border; border-radius: $brand-radius-card; background: rgba($brand-color-surface, .7); text-align: center; }
.home-empty__title { margin-top: 20rpx; color: $brand-color-text; font-size: 30rpx; font-weight: 700; }
.home-empty__copy { margin-top: 12rpx; color: $brand-color-text-secondary; font-size: 25rpx; line-height: 1.6; }
.home-tasks { display: flex; flex-direction: column; margin-top: 36rpx; }
.home-error { display: block; margin-top: 24rpx; color: #c5684d; font-size: 25rpx; text-align: center; }
.home-completed-link {
  display: flex; align-items: center; gap: 20rpx;
  margin-top: 24rpx;
  padding: 24rpx 24rpx;
  border-radius: 20rpx;
  background: $brand-color-surface;
  transition: transform .12s ease, background .15s ease;
}
.home-completed-link:active { transform: scale(.99); background: #effbf5; }
.home-completed-link__icon {
  width: 64rpx; height: 64rpx;
  display: flex; align-items: center; justify-content: center;
  border-radius: 16rpx;
  background: #effbf5;
  flex-shrink: 0;
}
.home-completed-link__text { display: flex; flex: 1; flex-direction: column; gap: 4rpx; min-width: 0; }
.home-completed-link__title { color: $brand-color-text; font-size: 28rpx; font-weight: 600; line-height: 1.3; }
.home-completed-link__copy { color: $brand-color-text-secondary; font-size: 22rpx; line-height: 1.4; }
.home-completed-link__arrow { color: $brand-color-text-secondary; font-size: 40rpx; font-weight: 300; line-height: 1; flex-shrink: 0; }
</style>
