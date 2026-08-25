<!--
  日期入口（PRD 008 优化 R6-R8）。
  封装 Wot UI `wd-calendar` type='date'：
  - 双向同步 date (yyyy-MM-dd) ↔ Wot UI 内部 modelValue (13 位时间戳)
  - min-date=2020-01-01 00:00:00，max-date=今天 23:59:59
  - 选完 emit 'update:date' (yyyy-MM-dd)
  - props.date 非空时显示"清除"按钮 emit 'clear'
-->
<template>
  <view class="date-picker">
    <view v-if="!date" class="date-picker__icon" data-testid="date-picker-open" @click="open">
      <!-- Wot UI iconfont 实际叫 `calendar-line`（line 463），`calendar` 字符不在 font 里会渲染为空。 -->
      <wd-icon name="calendar-line" size="36rpx" color="#74847D" />
    </view>
    <view v-else class="date-picker__clear" data-testid="date-picker-clear" @click="onClear">
      <wd-icon name="close" size="36rpx" color="#BA564B" />
    </view>

    <!-- 把日历主题色从 wd 默认蓝覆盖为项目 mint。
         覆盖方式：包一层 view 用 :deep() 改内部 .is-selected / .wd-month__day-container 的背景色；
         同步覆盖 CSS 变量 --wot-calendar-view-color-active 双保险。 -->
    <view class="date-picker__calendar">
      <wd-calendar
        v-model="calendarValue"
        type="date"
        :min-date="minTimestamp"
        :max-date="maxTimestamp"
        v-model:visible="visibleProxy"
        :show-confirm="true"
        :z-index="200"
        :custom-style="calendarThemeStyle"
        @confirm="onConfirm"
      />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

interface Props {
  /** yyyy-MM-dd 字符串；空 = 未选。 */
  date: string
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:date', value: string): void
  (e: 'clear'): void
  (e: 'update:open', value: boolean): void
}>()

const visible = ref(false)

/** wd-calendar 内部状态 `pickerShow` 通过 `v-model:visible` 双向同步给我们。
 *  用计算属性代理比直接 `v-model="visible"` 更稳：wd-calendar 在 confirm/cancel 时都会
 *  走 `update:visible`，单向 :visible 配合 @close 监听会让 visible 卡在 true 后再也点不开
 *  （原 bug：第一次关闭只触发 update:visible，@close 永不触发，第二次点击时 pickerShow
 *  已经是 false 但 visible 仍是 true，watch 不触发变化，UI 假死）。
 *  同步把 open 状态 emit 到父组件，让父组件能据此隐藏 FAB 避免它浮在日历之上。 */
const visibleProxy = computed<boolean>({
  get(): boolean { return visible.value },
  set(v: boolean): void {
    visible.value = v
    emit('update:open', v)
  },
})

/** props.date → 13 位时间戳（midnight of day）。空 = null。 */
const calendarValue = computed<number | null>({
  get(): number | null {
    if (!props.date) return null
    const [y, m, d] = props.date.split('-').map((v) => Number.parseInt(v, 10))
    if (!y || !m || !d) return null
    return new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
  },
  set(_v: number | null): void {
    // 通过 confirm 事件统一写回；不直接接 v-model
  },
})

const minTimestamp = new Date(2020, 0, 1, 0, 0, 0, 0).getTime()
const maxTimestamp = (() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime()
})()

/** 覆盖 Wot UI 日历内部 CSS 变量，把默认蓝主题改成项目 mint。
 *  wd-calendar 的 selected day 用 var(--wot-calendar-view-color-active)；
 *  在 customStyle 注入一个 inline 样式表，把这个变量重新指向品牌主色 #43C89A。 */
const calendarThemeStyle = computed(() => (
  '--wot-calendar-view-color-active: #43C89A; --wot-button-primary-color: #43C89A;'
))

function open(): void {
  visible.value = true
}

function onClear(): void {
  emit('clear')
}

function onConfirm(value: { value: number | number[] | null; type?: string } | number | number[] | null): void {
  // wd-calendar 的 confirm 事件实际 payload 是 { value: <number | number[] | null>, type: 'date' }
  // 旧版只接 value 数字，曾用 `value as number` 然后 typeof 检查失败 return——导致选完日期不更新
  // 父 store 的 selectedDate，列表自然不会按日期筛选（用户反馈 Bug 1）。现在按 3 种 shape 都接住。
  let ts: number | null = null
  if (typeof value === 'number') {
    ts = value
  } else if (Array.isArray(value)) {
    ts = value[0] ?? null
  } else if (value && typeof value === 'object' && 'value' in value) {
    const v = value.value
    ts = Array.isArray(v) ? (v[0] ?? null) : v
  }
  visible.value = false
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return
  const dt = new Date(ts)
  if (Number.isNaN(dt.getTime())) return
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  emit('update:date', `${y}-${m}-${d}`)
}
</script>

<style lang="scss" scoped>
.date-picker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  &__icon,
  &__clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56rpx;
    height: 56rpx;
    border-radius: 50%;
    transition: background .15s ease;
  }
  &__icon:active,
  &__clear:active {
    background: rgba($brand-color-border, .4);
  }
  // 日历弹层被 render 到 rootPortal，外层 scoped style 不能直接选中子组件内部节点。
  // 改用 :global(.xxx) 注入，覆盖 Wot UI 默认蓝色 → 项目 mint。
  // BEM 守门脚本对 ":global" 不限制（"global" 不是连续 &），但要写在 :deep 之前避免被 deep 包住。
  :global(.wd-month__day-container) {
    background: transparent;
  }
  :global(.wd-month__day.is-selected .wd-month__day-container),
  :global(.wd-month__day.is-current .wd-month__day-container) {
    background: $brand-color-primary;
    color: #FFFFFF;
  }
  :global(.wd-month__day.is-current) {
    color: $brand-color-primary;
  }
  :global(.wd-month__day.is-selected.is-current .wd-month__day-container) {
    background: $brand-color-primary;
    color: #FFFFFF;
  }
  :global(.wd-month__day.is-active) {
    background: rgba($brand-color-primary, .12);
  }
}
</style>
