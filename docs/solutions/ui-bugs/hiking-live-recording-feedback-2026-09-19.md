---
title: 徒步现场记录的实时地图、计时与操作区状态不同步
date: 2026-09-19
category: ui-bugs
module: hiking-recording
problem_type: ui_bug
component: frontend_stimulus
severity: high
symptoms:
  - 首个有效定位点已经出现，但页面仍不显示实时地图
  - 用户静止或定位回调没有产生新采样时，有效时长一直停留在 00:00:00
  - 记录开始后没有始终可见的中止入口
  - 危险操作按钮显示成普通文字或非红色按钮
  - 暂停、结束待保存和放弃操作的视觉层级不清晰
root_cause: logic_error
resolution_type: code_fix
tags: [uni-app, vue3, wechat-mini-program, hiking-tracking, live-map, wall-clock-timer, wot-ui, state-machine]
---

# 徒步现场记录的实时地图、计时与操作区状态不同步

## Problem

徒步现场记录页把“是否已经形成完整路线”误当成“是否有位置可显示”，又把有效时长绑定在定位采样上，导致首个定位点不能及时显示、用户静止时计时不走。记录生命周期和操作区也没有完整表达：中止入口藏在返回流程里，危险按钮属性与当前 Wot UI 版本不匹配，暂停后的三个动作宽度和层级混乱。

## Symptoms

- 只有一个有效定位点时仍显示等待占位内容；达到两个点、能够组成路线后才出现地图。
- 用户站着不动或模拟器不再推送新位置时，“有效时长”长期保持 `00:00:00`。
- 记录中、暂停后和结束待保存时，页面上没有始终可见的放弃入口。
- 初次尝试把按钮改红时，使用了 Wot UI 不支持的 `type="error"` 或旧式 `plain` 属性；未重新构建时，开发者工具还会继续读取旧页面。
- 首页曾把 `ended` 草稿显示成“继续现场记录”，进入后实际只能整理保存。
- 暂停状态下，“继续”“结束并整理”和“中止并放弃”没有清楚的主次关系。

截图已确认首点地图、红色中止按钮和独立计时生效；最新按钮布局已完成构建，最终视觉仍待用户确认。

## What Didn't Work

### 用完整路线决定是否显示地图

原页面只有在 `routeFromTracker` 返回路线后才渲染地图：

```vue
<HikingRouteMap v-if="route" :route="route" />
<view v-else>正在等待有效定位点</view>
```

`routeFromTracker` 会过滤少于两个点的分段。这个条件适合判断“能否画线”，不适合判断“能否显示地图和当前位置”。因此第一个有效点已经存在时，页面仍会误判为没有可显示内容。

### 用定位回调充当计时器

旧状态机只在接受新定位样本时，根据两次采样的时间差增加 `activeSeconds`。定位回调不是稳定时钟；用户静止、系统节流或模拟器只给出一个点时，页面没有新状态，计时也不会刷新。

只把计算公式改成 `Date.now()` 仍不够。如果没有一个按秒变化的响应式值，Vue 不会主动重新计算页面文字。

### 只在返回流程里提供放弃

返回页面时弹出“继续记录 / 暂存并退出 / 放弃本次记录”，逻辑上虽然存在放弃能力，但页面本身没有可见入口。用户不能从当前界面确认自己可以随时中止。

### 猜测按钮属性并反复叠加样式

Wot UI v2 的危险按钮类型是 `danger`，视觉变体使用 `variant="base"`、`variant="plain"` 等。`type="error"` 和布尔属性 `plain` 不属于当前版本的有效组合，最终会退回普通外观。

此外，源码修改、微信小程序构建输出和开发者工具页面是三份不同证据。只修改源码但不重新构建，不能证明开发者工具已经读取到新按钮。

### 给旧的结束草稿补算时间

旧 `ended` 草稿只保存了错误的 `activeSeconds: 0`，没有可靠的开始、暂停和结束时刻。结束状态也不应继续计时。强行用当前时间补算会制造虚假时长，因此旧记录只能整理保存或放弃后重新记录。

## Solution

### 1. 地图始终渲染，一个点定位，两个点画线

记录页直接把原始分段交给实时地图，不再用完整路线作为地图总开关：

```vue
<view class="hiking-record__map-shell">
  <HikingLiveMap :segments="tracker.segments" />
</view>
```

展示模型分别计算地图中心、所有可见点和可绘制线段：

```ts
export function createLiveMapModel(segments: readonly HikingRouteSegment[]) {
  const displaySegments = segments.map((segment) =>
    segment.points.map((point) => wgs84ToGcj02(point)),
  )
  const includePoints = displaySegments.flatMap((points) => points)
  const center = includePoints[includePoints.length - 1] ?? {
    latitude: 23.1291,
    longitude: 113.2644,
  }

  return {
    hasLocation: includePoints.length > 0,
    center,
    includePoints,
    polylines: displaySegments
      .filter((points) => points.length >= 2)
      .map((points) => ({
        points,
        color: '#267A5ACC',
        width: 6,
        dottedLine: false,
        arrowLine: true,
      })),
  }
}
```

这样首个点立即负责地图居中，达到两个点后才开始画线，不会为了提前展示而伪造未知路线。

### 2. 时长使用墙钟计算，独立秒钟只刷新显示

状态新增 `activeStartedAt`。记录中时，当前时长由“已累计秒数 + 本段开始后的自然时间”得到：

```ts
export function currentActiveSeconds(state: HikingTrackerState, now = Date.now()): number {
  if (state.status !== 'recording' || state.activeStartedAt == null) return state.activeSeconds
  return state.activeSeconds + Math.max(0, Math.floor((now - state.activeStartedAt) / 1000))
}
```

页面组合函数维护一个只负责触发显示刷新的秒钟：

```ts
const clockNow = shallowRef(Date.now())
const activeSeconds = computed(() => currentActiveSeconds(tracker.value, clockNow.value))

function startClock(): void {
  if (clockTimer) return
  clockNow.value = Date.now()
  clockTimer = setInterval(() => {
    clockNow.value = Date.now()
  }, 1000)
}
```

开始记录时启动，暂停、中断、结束、放弃和页面销毁时停止。状态切换时把本段时长结算进 `activeSeconds`，不需要每秒写本地草稿。

“静止”和“暂停”必须分开：

- 用户站着不动但仍是 `recording`：继续计时。
- 用户主动暂停、页面被中断或记录已结束：停止计时。

### 3. 所有非空闲状态都提供显式中止

中止入口由生命周期决定，而不是由当前页面动作决定：

```ts
export function canAbortRecording(
  state: Readonly<Pick<HikingTrackerState, 'status'>>,
): boolean {
  return state.status !== 'idle'
}
```

记录中、暂停和结束待保存都显示红色全宽按钮。点击后必须再次确认，确认才清除本机草稿并返回：

```vue
<wd-button
  block
  size="large"
  type="danger"
  variant="base"
  icon="close-circle"
  custom-style="background: #ba564b; color: #ffffff"
  @click="confirmAbort"
>
  中止并放弃本次记录
</wd-button>
```

### 4. 操作区按危险程度分层

记录中或暂停时，主要操作使用两列等宽布局；放弃操作独占下一行：

```scss
.hiking-record {
  &__controls--split {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16rpx;
  }

  &__abort {
    margin-top: 18rpx;
  }
}
```

暂停状态下，“继续记录”是绿色实心主操作，“结束并整理”是橙色描边次操作，“中止并放弃”是下一行红色实心危险操作。

### 5. 首页按草稿状态显示真实下一步

首页入口不能只判断“有没有草稿”。`ended`、活动草稿和无草稿分别显示“继续整理并保存”“继续现场记录”“开始现场记录”，避免入口文案与记录页动作冲突。

## Why This Works

地图、计时、定位采样和记录状态分别判断，不再让其中一个充当另一个的触发条件。首个点负责显示位置，足够点数才负责画线；记录状态负责时间累计，独立秒钟只负责刷新页面；生命周期负责可用操作和草稿结算。

## Prevention

- 把“地图可见”“当前位置可见”“路线可绘制”分别建模，禁止再用完整路线对象作为地图渲染总开关。
- 所有持续时长使用时间戳计算；定位、网络和传感器事件只能提供业务数据，不能充当计时器。
- 对记录状态建立固定检查表：

  | 状态 | 是否计时 | 是否显示地图 | 是否允许中止 | 主要操作 |
  | --- | --- | --- | --- | --- |
  | `idle` | 否 | 是 | 否 | 开始徒步 |
  | `recording` | 是 | 是 | 是 | 暂停、结束 |
  | `paused` | 否 | 是 | 是 | 继续、结束 |
  | `ended` | 否 | 是 | 是 | 整理并保存 |

- 保留以下回归测试：一个点显示位置但不画线；两个点开始画线；纯函数在没有新定位点时仍能按时间差计算；暂停和结束后计时停止；恢复后新增路线分段；所有非空闲状态都能中止；`ended` 草稿首页入口为“继续整理并保存”。
- 增加 `useHikingRecorder` 的假定时器测试，覆盖页面秒钟启动、每秒刷新，以及暂停、结束、放弃和销毁后的停止。现有状态机测试只保护时间差计算，还不能单独证明页面会持续刷新。
- 增加异常遗留草稿测试：如果小程序意外退出后草稿仍是 `recording`，恢复时必须转为中断状态或重新挂载定位和秒钟，不能停在无法继续的状态。
- Wot UI 危险按钮固定使用 `type="danger"` 和 `variant="base"`；不要使用 `type="error"` 或布尔 `plain`。
- 页面样式修改后重新构建微信小程序输出。自动测试、构建成功和开发者工具视觉确认分开记录，不能互相替代。
- 不对缺少可靠时间点的旧结束草稿做推测性迁移；未来若要恢复历史时长，必须先保存开始、暂停和结束时间点。
- 分别检查 `recording`、`paused`、`ended` 三种页面，确认按钮等宽、文字不截断、危险操作分组明确，并留出底部安全区域。

## Related Issues

- [从需求讨论到实际交付的文档闭环](../workflow-issues/prd-brainstorm-plan-delivery-loop-2026-09-09.md)：说明异常状态应和正常流程一起设计，并区分自动检查与真实环境确认。
- [共同徒步生活应用 PRD](../../prd/016-hiking-life-app-prd.md)：现场记录、暂停继续、结束保存、放弃确认和地图展示的产品依据。
