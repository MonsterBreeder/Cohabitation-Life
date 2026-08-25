<template>
  <view class="home-page">
    <wd-toast />

    <!-- 加载态：转圈 + 标准文案（与全站 loading 风格统一；方案 2 全站统一为转圈） -->
    <view v-if="isLoading" class="page-state" data-testid="home-loading">
      <wd-loading color="#267A5A" size="40rpx" />
      <text class="page-state__title">正在加载首页</text>
    </view>

    <view v-else-if="loadError" class="page-state" data-testid="home-error">
      <wd-icon name="close" size="76rpx" color="#ff8f79" />
      <text class="page-state__title">家庭资料暂时走丢了</text>
      <text class="page-state__copy">{{ loadError }}</text>
      <wd-button type="primary" :loading="isLoading" @click="loadHome">重新加载</wd-button>
    </view>

    <view v-else-if="household && profile" class="home-content" :data-testid="household.memberCount === 1 ? 'home-single-member' : 'home-two-members'">
      <view class="hero">
        <!-- 品牌 logo 放在 eyebrow 行（与"家里有事"同级），保持视觉但不喧宾夺主。
             旁边跟品牌主色文字 + 圆形描边占位，跟《品牌视觉标准》"Logo 周围应保留充足空白"对齐。 -->
        <view class="hero__brand">
          <image
            class="hero__logo"
            src="/static/brand/logo.png"
            mode="aspectFit"
            aria-label="睦录品牌 logo"
          />
          <text class="hero__eyebrow">家里有事</text>
        </view>
        <text class="hero__title">欢迎回家</text>
        <text class="hero__copy">家不在大小，有人惦记就好。</text>
      </view>

      <HomeSummaryCard
        :name="household.name"
        :avatar-src="resolvedAvatarSrc"
        :avatar-loading="avatarLoading"
        :member-count="household.memberCount"
        @press="openHouseholdEditor"
      />

      <!-- 本月账本小卡（PRD 008 优化 R11-R15 + 用户反馈：同时显示支出和收入）。无家庭时已在外层 v-if="household" 隐藏。 -->
      <MonthlyExpenseCard
        :expense-cents="monthlyExpenseCents"
        :income-cents="monthlyIncomeCents"
        :loading="ledgerStatsLoading"
        :error-message="ledgerStatsError"
        @press="goLedger"
        @retry="reloadLedgerStats"
      />

      <!-- 事项区：单成员 / 双成员家庭都用同一套——只是单成员没有 "完成记录" 链接。
           不再把单成员锁在外面"等邀请另一半"——一个人也能记下自己的事。 -->
      <view v-if="taskCurrent" class="home-tasks">
        <TaskList
          v-if="hasAnyOpenTask"
          :current="taskCurrent"
          @press="onPressTask"
        />
        <view v-else class="home-empty" data-testid="home-tasks-empty">
          <wd-icon name="tags" size="68rpx" color="#43c89a" />
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
          <text class="home-completed-link__title">{{ completedLinkTitle }}</text>
          <text class="home-completed-link__copy">已完成和已放弃会一直留着</text>
        </view>
        <text class="home-completed-link__arrow">›</text>
      </view>
    </view>

    <!-- 悬浮"快速添加"按钮：有家庭时一直显示（单成员也允许加自己的事）。
         用 Wot UI 的 wd-fab 组件，避开 tab bar。 -->
    <wd-fab
      v-if="household"
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
import MonthlyExpenseCard from '../../components/home/MonthlyExpenseCard.vue'
import AppTabBar from '../../components/AppTabBar.vue'
import TaskList from '../../components/task/TaskList.vue'
import { useAuthStore } from '../../store/modules/auth'
import { useHouseholdStore } from '../../store/modules/household'
import { useTaskStore } from '../../store/modules/task'
import { useLedgerStore } from '../../store/modules/ledger'
import { formatLedgerMonth } from '../../utils/format'
import { householdAvatarSource, resolveHomeLoadDestination } from './home-view'
import { getAvatarTemporaryUrl } from '../../services/avatar-media'
import type { CurrentTasks } from '../../types/task'

const authStore = useAuthStore()
const householdStore = useHouseholdStore()
const taskStore = useTaskStore()
const ledgerStore = useLedgerStore()
const { hasCompletedLogin, errorMessage: authError } = storeToRefs(authStore)
const { phase, household, profile, errorMessage: householdError } = storeToRefs(householdStore)
const { current: taskCurrent, errorMessage: taskError } = storeToRefs(taskStore)
const { stats: ledgerStats, phase: ledgerPhase, errorMessage: ledgerError } = storeToRefs(ledgerStore)

const isLoading = computed(() => phase.value === 'checking')
const loadError = computed(() => authError.value || householdError.value)
const homeError = computed(() => taskError.value || '')
// 自定义头像 URL 由云端异步签发；sign 'empty' 期间不要让组件显示默认头像。
// 用 avatarLoading 单独控制占位状态，householdAvatarUrl 仅在拿到真实 URL 时才赋值。
const householdAvatarUrl = ref('')
const avatarLoading = ref(false)
const isQuickAdd = ref(false)

const hasAnyOpenTask = computed(() => {
  const c = taskCurrent.value as CurrentTasks | undefined
  if (!c) return false
  return c.priority.length > 0
    || c.groups.low_stock.length > 0
    || c.groups.to_handle.length > 0
    || c.groups.expiring.length > 0
})

// 历史记录入口：有家庭时一直显示（单成员也能看自己做完的事），文案根据成员数变
// "看看我们做完的事"（双成员）/ "看看我做完的事"（单成员）。
const hasCompletedLink = computed(() => Boolean(household.value))
const completedLinkTitle = computed(() =>
  household.value?.memberCount === 2 ? '看看我们做完的事' : '看看我做完的事',
)

// PRD 008 优化 R12：首页小卡 = ledger store stats.monthExpenseCents
// 用户反馈：当前卡片只显示支出，要同时显示收入。
// 双成员家庭里 A / B 看到一样的数字（跟"双方都看全部"对齐）；不按当前用户拆。
const monthlyExpenseCents = computed(() => ledgerStats.value?.monthExpenseCents ?? null)
const monthlyIncomeCents = computed(() => ledgerStats.value?.monthIncomeCents ?? null)
const ledgerStatsLoading = computed(() => ledgerPhase.value === 'loading' && ledgerStats.value === null)
const ledgerStatsError = computed(() => (ledgerError.value && ledgerStats.value === null ? ledgerError.value : null))

/** 给 HomeSummaryCard 喂头像 src。
 *  - 内置头像：直接本地路径
 *  - 自定义头像：只有 URL 拿到后才返回；否则返回空串（搭配 avatarLoading 走占位）
 *  这种"晚到一步"的方式避免出现"默认头像 → 自定义头像"的闪屏（用户反馈）。 */
const resolvedAvatarSrc = computed(() => {
  if (!household.value) return ''
  if (household.value.avatar.kind === 'builtin') return householdAvatarSource(household.value.avatar.id)
  return householdAvatarUrl.value
})

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

/** 点击本月支出小卡：跳账本 tab（R13）。
 *  注意：项目用 Wot UI 自定义 `wd-tabbar` 组件做底栏（不是 pages.json 的原生 tabBar），
 *  所以 `uni.switchTab` 会报"can not switch to no-tabBar page"。改用 `uni.reLaunch`
 *  跟 src/components/AppTabBar.vue:handleChange 的做法保持一致——清栈后跳目标页，
 *  不会出现"假 tabBar 叠加"问题。 */
function goLedger(): void {
  uni.reLaunch({ url: '/pages/ledger/index' })
}

/** 重试加载账本统计。 */
function reloadLedgerStats(): void {
  if (!household.value) return
  ledgerStore.setHouseholdContext(household.value.id, '')
  void ledgerStore.loadStats(formatLedgerMonth(new Date()))
}

/** 点击首页的家庭资料卡：跳到编辑家庭资料页（改家庭名 / 头像）。
 *  与 profile 页 HomeSummaryCard 行为保持一致——同一组件，同一交互。 */
function openHouseholdEditor(): void {
  uni.navigateTo({ url: '/subpackages/household/edit-household/index' })
}

/** 拉取自定义家庭头像 URL（云端异步签发）。失败兜底为空串 + 保持 loading=false，
 *  让 HomeSummaryCard 继续按空 src 渲染（占位圈由父组件决定）。 */
async function loadCustomAvatarUrl(resourceId: string): Promise<void> {
  avatarLoading.value = true
  try {
    const url = await getAvatarTemporaryUrl(resourceId)
    householdAvatarUrl.value = url || ''
  } catch {
    householdAvatarUrl.value = ''
  } finally {
    avatarLoading.value = false
  }
}

/** 登录确认和家庭查询串行执行，旧资料在查询开始时立即清空。
 *  拉到家庭后，并行拉 ①自定义头像 URL ②事项列表 ③本月支出统计——避免一个一个串行阻塞，
 *  让用户感知到所有数据几乎同时就绪（之前是"先 household，再 task，再 ledger stats"，
 *  出现家庭卡 → 短暂停顿 → 任务卡 / 支出卡 闪入的视觉断层）。 */
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
    ledgerStore.setHouseholdContext(result.household.id, '')
    const month = formatLedgerMonth(new Date())
    const tasks: Array<Promise<unknown>> = [
      taskStore.loadCurrent(),
      ledgerStore.loadStats(month),
    ]
    if (result.household.avatar.kind === 'custom') {
      tasks.push(loadCustomAvatarUrl(result.household.avatar.resourceId))
    } else {
      // 内置头像无需异步 URL；显式置空避免上次离开时残留
      householdAvatarUrl.value = ''
      avatarLoading.value = false
    }
    await Promise.all(tasks)
  } else {
    // 非 HOME（如 NO_HOME）清空头像相关状态
    householdAvatarUrl.value = ''
    avatarLoading.value = false
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
.home-page {
  min-height: 100vh;
  padding: 48rpx 32rpx 160rpx;
  box-sizing: border-box;
  background: $brand-color-background;
}
.page-state {
  display: flex;
  min-height: calc(100vh - 128rpx);
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  &__title {
    margin-top: 28rpx;
    color: $brand-color-text;
    font-size: 34rpx;
    font-weight: 700;
  }
  &__copy {
    max-width: 520rpx;
    margin: 16rpx 0 36rpx;
    color: $brand-color-text-secondary;
    font-size: 26rpx;
    line-height: 1.65;
  }
}
.home-content {
  display: flex;
  flex-direction: column;
}
.hero {
  display: flex;
  flex-direction: column;
  margin-bottom: 42rpx;
  // 品牌行：logo + eyebrow 文字并排，与家庭名层级错开但视觉成组。
  &__brand {
    display: flex;
    align-items: center;
    gap: 16rpx;
  }
  &__logo {
    width: 56rpx;
    height: 56rpx;
    flex-shrink: 0;
  }
  &__eyebrow {
    color: $brand-color-primary;
    font-size: 23rpx;
    font-weight: 600;
    letter-spacing: 4rpx;
  }
  &__title {
    margin-top: 14rpx;
    color: $brand-color-text;
    font-size: 52rpx;
    font-weight: 700;
    line-height: 1.3;
  }
  &__copy {
    margin-top: 12rpx;
    color: $brand-color-text-secondary;
    font-size: 27rpx;
    line-height: 1.6;
  }
}
.home-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 36rpx;
  padding: 54rpx 32rpx;
  border: 2rpx dashed $brand-color-border;
  border-radius: $brand-radius-card;
  background: rgba($brand-color-surface, .7);
  text-align: center;
  &__title {
    margin-top: 20rpx;
    color: $brand-color-text;
    font-size: 30rpx;
    font-weight: 700;
  }
  &__copy {
    margin-top: 12rpx;
    color: $brand-color-text-secondary;
    font-size: 25rpx;
    line-height: 1.6;
  }
}
.home-tasks {
  display: flex;
  flex-direction: column;
  margin-top: 36rpx;
}
.home-error {
  display: block;
  margin-top: 24rpx;
  color: #c5684d;
  font-size: 25rpx;
  text-align: center;
}
.home-completed-link {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-top: 24rpx;
  padding: 24rpx 24rpx;
  border-radius: 20rpx;
  background: $brand-color-surface;
  transition: transform .12s ease, background .15s ease;
  &:active {
    transform: scale(.99);
    background: #effbf5;
  }
  &__icon {
    width: 64rpx;
    height: 64rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16rpx;
    background: #effbf5;
    flex-shrink: 0;
  }
  &__text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4rpx;
    min-width: 0;
  }
  &__title {
    color: $brand-color-text;
    font-size: 28rpx;
    font-weight: 600;
    line-height: 1.3;
  }
  &__copy {
    color: $brand-color-text-secondary;
    font-size: 22rpx;
    line-height: 1.4;
  }
  &__arrow {
    color: $brand-color-text-secondary;
    font-size: 40rpx;
    font-weight: 300;
    line-height: 1;
    flex-shrink: 0;
  }
}
</style>
