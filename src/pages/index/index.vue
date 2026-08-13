<template>
  <!-- 家庭状态确认完成前只显示安全状态，不展示任何事项。 -->
  <view class="page">
    <view v-if="isCheckingHome" class="page__safe-state" data-testid="home-checking">
      <text class="page__safe-title">正在确认我们的小家…</text>
      <text class="page__safe-copy">确认完成后再为你展示家里的事项。</text>
    </view>

    <view v-else-if="errorMessage" class="page__safe-state" data-testid="home-retry">
      <text class="page__safe-title">暂时无法确认家庭状态</text>
      <text class="page__safe-copy">{{ errorMessage }}</text>
      <button class="page__retry" :disabled="isResolving" @click="confirmHome">重新确认</button>
    </view>

    <template v-else-if="homeConfirmed">
      <view v-if="showInviteConflictNotice" class="page__notice" data-testid="home-invite-conflict">
        <text>你已经在自己的家中，这份邀请没有被使用。</text>
      </view>
      <view class="hero">
        <text class="eyebrow">家里有事</text>
        <text class="title">{{ greeting }}</text>
        <text class="subtitle">把家里的小事，一起记住、一起完成。</text>
      </view>
      <view class="summary-grid">
        <HomeSummaryCard label="今天要处理" :count="taskStore.todayTasks.length" tone="warm" />
        <HomeSummaryCard label="家里快没了" :count="taskStore.lowStockTasks.length" tone="green" />
        <HomeSummaryCard label="正在等待" :count="taskStore.waitingTasks.length" tone="blue" />
        <HomeSummaryCard label="即将到期" :count="taskStore.expiringTasks.length" tone="pink" />
      </view>
      <TaskList :tasks="taskStore.pendingTasks" />
      <button class="quick-add" @click="handleQuickAdd"><text class="quick-add-symbol">＋</text>快速添加</button>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { onShow } from '@dcloudio/uni-app'
import HomeSummaryCard from '../../components/home/HomeSummaryCard.vue'
import TaskList from '../../components/task/TaskList.vue'
import { useAuthStore } from '../../store/modules/auth'
import { useTaskStore } from '../../store/modules/task'

const authStore = useAuthStore()
const taskStore = useTaskStore()
// 首页拆出的状态使用 storeToRefs，操作仍通过原 store 调用。
const { errorMessage, hasCompletedLogin, isResolving, notice } = storeToRefs(authStore)
const { hasHome } = storeToRefs(taskStore)
// 页面只在本次显示周期内保存确认结果。
const isCheckingHome = ref(true)
const homeConfirmed = ref(false)
const showInviteConflictNotice = ref(notice.value === 'already_in_home')
const greeting = computed(() => hasHome.value ? '我们的小家' : '我们的小家')

/** 使用 reLaunch 清空登录页，避免返回到身份确认流程。 */
function relaunch(url: string): void {
  uni.reLaunch({ url })
}

/** 每次显示首页都向云端重新确认家庭归属。 */
async function confirmHome(): Promise<void> {
  if (!hasCompletedLogin.value) {
    relaunch('/pages/login/index')
    return
  }

  isCheckingHome.value = true
  homeConfirmed.value = false
  await authStore.restore()

  const route = authStore.consumeNavigationIntent()
  if (route && route.url !== '/pages/index/index') {
    relaunch(route.url)
    return
  }

  if (!errorMessage.value) {
    homeConfirmed.value = true
  }
  isCheckingHome.value = false
}

/** 当前 MVP 尚未实现添加事项，仅提供明确提示。 */
function handleQuickAdd(): void {
  uni.showToast({ title: '添加事项页面即将接入', icon: 'none' })
}

onShow(() => {
  void confirmHome()
})
</script>

<style scoped>
/* 首页安全状态、内容区和浮动操作按钮。 */
.page { min-height: 100vh; padding: 48rpx 32rpx 160rpx; box-sizing: border-box; }
.page__safe-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: calc(100vh - 208rpx); text-align: center; }
.page__safe-title { color: #29443a; font-size: 36rpx; font-weight: 700; }
.page__safe-copy { max-width: 520rpx; margin-top: 20rpx; color: #74847d; font-size: 28rpx; line-height: 1.7; }
.page__retry { height: 80rpx; margin-top: 34rpx; border: 2rpx solid #43c89a; border-radius: 40rpx; background: #fff; color: #267a5a; font-size: 28rpx; line-height: 76rpx; }
.page__retry::after { border: 0; }
.page__notice { margin-bottom: 28rpx; padding: 20rpx 24rpx; border-radius: 16rpx; background: #effbf5; color: #267a5a; font-size: 26rpx; line-height: 1.6; }
.hero { display: flex; flex-direction: column; gap: 12rpx; margin-bottom: 40rpx; }
.eyebrow { color: #43c89a; font-size: 24rpx; font-weight: 600; letter-spacing: 4rpx; }
.title { color: #29443a; font-size: 52rpx; font-weight: 700; }
.subtitle { color: #74847d; font-size: 28rpx; line-height: 1.6; }
.summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20rpx; margin-bottom: 48rpx; }
.quick-add { position: fixed; right: 32rpx; bottom: 40rpx; display: flex; align-items: center; justify-content: center; width: 216rpx; height: 88rpx; border: 0; border-radius: 44rpx; background: #267a5a; box-shadow: 0 16rpx 28rpx rgba(38, 122, 90, 0.22); color: #fff; font-size: 30rpx; font-weight: 600; line-height: 88rpx; }
.quick-add::after { border: 0; }
.quick-add-symbol { margin-right: 6rpx; font-size: 38rpx; font-weight: 400; }
</style>
