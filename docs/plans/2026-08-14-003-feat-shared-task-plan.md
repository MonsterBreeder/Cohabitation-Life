---
title: "feat: 共同事项的新增、认领、完成与放弃"
type: feat
status: active
date: 2026-08-14
origin: docs/prd/005-shared-task-prd.md
---

# 共同事项模块实施计划

## 概览

在已完成的"邀请与加入家庭"基础上,增加"共同事项":任一成员都能创建、认领、完成或放弃事项;首页按"优先处理(今天/逾期)+ 其他事项(按类型分组)"展示;已完成/已放弃通过"我们的家→已完成"分页查看(永久保留)。所有访问和修改都按当前家庭身份由云端校验,确保一个事项只属于一个家庭、两个家庭成员可读可写。

## 问题与范围

### 当前现状

- `src/types/task.ts`、`src/store/modules/task.ts`、`src/components/task/TaskList.vue` 是占位实现,首页 `src/pages/index/index.vue` 仍展示"今天还没有家里事项,等邀请完成后,我们就从第一件小事开始"提示。
- `cloudfunctions/` 下只有 `household` 和 `resolve-login`,没有 `task` 云函数,也无 `tasks`、`taskOperations` 集合。
- 现有家庭成员关系(`households.memberKeys` + `householdCreationLocks`)已经能为事项做归属判断,无需扩展家庭领域。
- 已有 PRD 003 / PRD 004 的"个人资料保留、家庭资料不可见"对称原则,本计划直接复用。

### 本计划范围

- PRD 005 全部需求(R1-R30)、双账号验收路径(10 条)、关键决定(6 条)。
- 数据契约、云端规则、前端状态、添加页/详情页/首页接入,以及部署说明与双账号验收。

### 不在范围

- 编辑事项、转交、重新打开、删除(只能完成或放弃)。
- 重复事项、模板、提醒、推送、附件。
- 多人家庭(>2 人)、统计/积分/排行。
- 把已有事项从一个家庭迁移到另一个家庭(PRD 004 R32 已确认本阶段不涉及)。

## 需求追踪

- R1-R6:新增流程的入口、字段、提示与重试。
- R7-R9:认领的状态变化、单飞保护与超时后重试。
- R10-R13:完成的权限(任一成员)、UI 入口、记录实际完成人。
- R14-R16:放弃的二次确认、状态变化、记录实际放弃人。
- R17-R21:首页优先规则、分组、空状态。
- R22-R27:详情页顶部状态/操作/底部操作记录。
- R28-R30:网络失败、重复点击、超时后重试的明确提示。
- 双账号验收 10 条路径。

## 调研结论

### 现有基础

- `cloudfunctions/household/household-domain.js` 已有 `HouseholdDomainError` + repository 注入 + 事务(创建锁、成员锁),可直接作为本计划的领域错误和事务模式参考。
- `cloudfunctions/household/invitation-domain.js` 已有"安全转义"(只返回页面需要的字段,不返回内部身份键);`homeResult` 模式(把家庭结果收敛为只展示资料)可直接迁移到 task 域。
- `src/services/household-cloud.ts` 已有 `HouseholdCloudError` + 响应严格校验 (`isHouseholdResult` 等) 模式,可直接迁移到 `task-cloud.ts`。
- `src/store/modules/household.ts` 已有对象式 Pinia 写法 + `cloudClient` 抽象 + 单飞保护 + `authoritativeRevision` 防 race + `pending` 短期操作凭证(刷新可恢复) + `applyHome`/`applyNoHome` 结果收敛,可直接迁移到 `task-store.ts`。
- `src/subpackages/household/create-home/index.vue` 已有"私有视图函数 + 单文件 Vue + 加载/失败/重试状态"模式,可直接迁移到 task 添加/详情页。
- `src/pages/index/index.vue` 已具备 `home-single-member` / `home-two-members` 两种 testid,首页可按现有结构接入事项区。
- `tests/unit/household-domain.spec.ts`、`household-store.spec.ts`、`invitation-domain.spec.ts` 已有"内存事务替身 + cloudClient 注入"测试模式,新增 `task-domain`、`task-store` 测试可直接复制。

### 外部约束

- 微信云函数事务只支持已确定文档的读取和写入;不使用条件查询或外部调用。[CloudBase 事务说明](https://docs.cloudbase.net/database/transaction)
- 数据库规则不限制云函数;`tasks` 与 `taskOperations` 集合继续设为"所有用户不可读写",由云端统一校验归属。
- 微信云端 `wx-server-sdk` 已支持 `db.runTransaction`,本计划沿用 `household` 的事务封装方式。

## 关键技术决定

| 决定 | 处理方式 | 原因 |
| --- | --- | --- |
| 事项归属 | 由家庭 `memberKeys` 直接判断访问,沿用 `household` 的归属锁(创建锁)防并发创建新家庭时的越权 | 沿用已验证的归属模型,避免引入新锁 |
| 文档结构 | `tasks` 与 `taskOperations` 两个集合;`tasks` 存当前状态,`taskOperations` 存事件流 | 读路径只读 `tasks`(快);详情页读 `taskOperations` 按 taskId 过滤(可分页) |
| 状态机 | 四个状态:`pending` / `claimed` / `completed` / `abandoned`;状态字段直接写在 `tasks.status`;转移时同事务追加一条 `taskOperations` | 与 PRD 005 状态机一一对应;事务保证原子性 |
| 截止日期 | 仅日期(年-月-日),不允许具体时间;服务端用 `dueDate` 字符串或 `dueDateAt` 当日 00:00 UTC,客户端只展示日期 | 避免时区与"今天/逾期"判断的歧义 |
| 重复点击 | store 层单飞 + `requestId`/`operationToken` 短期凭证 + 服务端去重 | 沿用 `household` 已验证模式 |
| 操作记录展示 | 详情页按 `taskOperations` 时间倒序拉取(只拉 1 次,不增量分页) | 首版事项操作事件数有限,一次性拉够 |
| 首页优先规则 | 服务端返回时按"优先处理(今天/逾期)+ 其他事项(按类型)"分组,客户端不重新排序 | 避免双端排序不一致,服务端为单一排序源 |
| 已完成/已放弃 | 单独走 `loadCompleted` 云函数,按 `completedAt`/`abandonedAt` 倒序分页(20 条/页) | 永久保留,避免首页被历史挤爆 |
| 移除成员后未完成事项 | 不跟随;留在原家庭;被移除者不能再读 | 与 PRD 003 个人资料保留对称;`tasks.householdId` 不变,被移除者 `memberKeys` 不再包含 → 拒绝 |
| 内容校验 | 名称 1-20 字、类型固定枚举、截止日期格式 `YYYY-MM-DD`、备注 0-100 字;沿用 `display-text.js` | 与现有 `validateDisplayText` 对齐 |

## 高层交互关系

```mermaid
flowchart TB
  A[首页 onShow] --> B[taskStore.loadCurrent]
  B --> C[task-cloud.listCurrent]
  C --> D[task 云端 listCurrentTasks]
  D --> E[tasks 集合按家庭过滤 + 排序]
  E --> F[返回优先处理 + 其他事项分组]
  F --> G[首页渲染]

  H[点"快速添加"] --> I[添加页]
  I --> J[taskStore.create]
  J --> K[task-cloud.create]
  K --> L[task 云端 createTask]
  L --> M[事务:写 tasks + 写 taskOperations]

  N[详情页 claim/complete/abandon] --> O[taskStore.claim/complete/abandon]
  O --> P[task 云端对应领域函数]
  P --> Q[事务:更新 tasks.status + 写 taskOperations]

  R[我们的家→已完成] --> S[taskStore.loadCompleted]
  S --> T[task-cloud.listCompleted]
  T --> U[task 云端 listCompletedTasks]
  U --> V[tasks 集合按家庭+状态+分页]
```

## 实施单元

### U1:补齐事项、事件和首页数据契约

**目标:** 为事项类型、操作事件和首页/已完成/详情页提供受限且一致的数据形状,云端与前端都基于这个契约实现。

**需求:** R1-R30,尤其 R17-R21(首页分组)、R22-R27(详情页)、R28-R30(错误码与文案编号)。

**依赖:** 无。

**文件:**

- 新建:`src/types/task.ts`(扩展现有占位)
- 新建:`src/types/task-event.ts`
- 新建:`src/services/task-cloud.ts`
- 修改:`src/services/household-cloud.ts`(可能复用其 cloudRuntime 初始化)

**实施方法:**

- 定义有限联合:`TaskType = 'low_stock' | 'to_handle' | 'expiring'`;`TaskStatus = 'pending' | 'claimed' | 'completed' | 'abandoned'`。
- 定义 `TaskSummary`(首页分组条目,只含名称、类型、截止日期、负责人昵称、状态);`TaskDetail`(详情页,含 events 数组);`TaskEvent`(kind, actorNickname, at);`CompletedTaskItem`(完成/放弃列表条目)。
- 客户端对每个云端响应做严格校验(`isTaskSummary` / `isTaskDetail` / `isCompletedTaskItem`),与 `household-cloud.ts` 的 `isHouseholdResult` 一致,防止云端任意文字或伪造字段。
- 错误码有限集合:`TASK_INVALID_REQUEST` / `TASK_NOT_FOUND` / `TASK_FORBIDDEN` / `TASK_TERMINAL` / `TASK_DUPLICATE_OPERATION` / `TASK_TEMPORARY_FAILURE`。
- 文本展示编号有限集合(放在 `src/utils/display-text.ts` 或新增 `src/utils/task-text.ts`),用于首页/详情页/添加页的占位与错误提示。

**遵循模式:** `src/types/household.ts` 的有限联合 + `src/services/household-cloud.ts` 的响应严格校验。

**测试场景:**

- 正常:三种类型的 `TaskSummary` 都被识别;`TaskDetail` 含 events 数组且每个 event 都有 `actorNickname`。
- 边界:`actorKey` 或 `householdId` 等内部键不出现在前端类型中(类型层确保)。
- 错误:未知状态(如 `deleted`)、未知类型(如 `todo`)、缺字段(如缺 `dueDate`)的响应被严格校验拒绝,不让错误结果落到页面上。
- 集成:`isTaskDetail` 与 `isTaskSummary` 在面对部分字段被裁剪时返回 false;不会"差不多"就放行。

**完成验证:** 所有前端类型禁止出现 `householdId` / `actorKey` / `_id`;`isTaskDetail` 的所有负向用例都有对应测试;typecheck 通过。

### U2:实现云端 task 领域(创建、列表、详情、状态转移)

**目标:** 在云端按当前家庭身份完成事项的创建、首页列表、详情加载、认领、完成、放弃,以及完成/放弃列表分页。所有状态转移在同一事务内完成。

**需求:** R1-R16, R17-R21(服务端排序与分组), R22-R27(详情 events), R28-R30(错误码)。

**依赖:** U1。

**文件:**

- 新建:`cloudfunctions/task/task-domain.js`
- 新建:`cloudfunctions/task/index.js`
- 新建:`cloudfunctions/task/display-text.js`(如需独立校验,可放 `household/display-text.js` 复用)
- 新建:`cloudfunctions/task/repository-data.js`
- 修改:`cloudfunctions/README.md`(增加 task 云函数说明 + 集合清单)
- 测试:`tests/unit/task-domain.spec.ts`

**实施方法:**

- 事务内固化的文档模式:每个事项有 `id = task_<uuid>`(或 `task_<sha256(uuid+)>`),每个 `taskOperation` 有 `id = taskop_<taskId>_<sha256(operationToken)>`(同一 task 同一 operationToken 幂等)。
- `createTask(input, deps)`:
  - 校验身份属于至少一个家庭(沿用 `households.memberKeys` 查询),不是则返回 `TASK_FORBIDDEN`。
  - 校验名称、类型、截止日期、备注,不合规返回 `TASK_INVALID_REQUEST`。
  - 事务中:写 `tasks` 文档,追加 `taskOperations`(`create` 事件)。
  - 返回 `TaskSummary`。
- `listCurrentTasks(input, deps)`:
  - 查询该家庭所有 `status in ('pending', 'claimed')` 的事项。
  - 服务端按"优先处理(今天/逾期) + 其他事项(按类型)"分组,返回 `{ priority: TaskSummary[], groups: { low_stock: TaskSummary[], to_handle: TaskSummary[], expiring: TaskSummary[] } }`。
  - 同组内按 `dueDate` 升序(无 `dueDate` 排最后);跨组顺序固定 `low_stock → to_handle → expiring`。
- `getTaskDetail(input, deps)`:
  - 校验身份属于该事项所属家庭,否则 `TASK_FORBIDDEN`。
  - 一次性拉取该 `taskId` 的所有 `taskOperations`,按 `at` 倒序。
  - 安全转义:返回的 `TaskDetail` 不含 `householdId` / 内部 `actorKey`,events 也不含 `actorKey`,只含 `actorNickname`。
- `claimTask(input, deps)`:
  - 事务前只读预检:事项存在、属于当前家庭、状态为 `pending`、非终止;否则返回对应错误。
  - 事务中:更新 `tasks.status = 'claimed'`、`tasks.assigneeKey = identityKey`;追加 `claim` 事件;同一 `operationToken` 已存在则幂等返回。
- `completeTask(input, deps)` / `abandonTask(input, deps)`:
  - 同样模式:事务前预检 → 事务内更新状态 + 追加事件 + 幂等。
  - 二次确认不存储在云端,只由前端在点击时弹;`abandonTask` 不需要服务端二次校验。
  - `abandonTask` 在事件 `kind = 'abandon'`;`completeTask` 在事件 `kind = 'complete'`。
- `listCompletedTasks(input, deps)`:
  - 查询 `status in ('completed', 'abandoned')`,按 `completedAt or abandonedAt` 倒序;支持 `cursor`(用 `at` + `_id` 复合游标);limit 20。
  - 返回 `{ items: CompletedTaskItem[], nextCursor?: string }`。

**遵循模式:** `cloudfunctions/household/household-domain.js` 的 `HouseholdDomainError` + 事务 + repository 注入;`cloudfunctions/household/invitation-domain.js` 的 `safeProfile` / `homeResult` 安全转义。

**测试场景:**

- 正常:任一成员创建后,双方 `listCurrentTasks` 都能看到;`getTaskDetail` 拉到的 events 含 `create` 事件且 `actorNickname` 是创建者。
- 正常:任一成员都能 `claimTask` 一个 `pending` 事项;`completeTask` 一个 `pending` 或 `claimed` 事项;`abandonTask` 二次确认后生效。
- 边界:截止日期为空字符串、`null`、`'今天'` 都被拒绝;名称 21 字被拒;备注 101 字被拒。
- 错误:非家庭成员调用任何 task 云函数都返回 `TASK_FORBIDDEN`(用同家庭成员 key 之外的身份键)。
- 错误:已 `completed` 的事项再次 `complete` 返回 `TASK_TERMINAL`;`abandon` 同理。
- 错误:同一 `operationToken` 重复提交 `claim/complete/abandon` 只产生一次状态变化(幂等)。
- 错误:事务写失败时 `tasks.status` 与 `taskOperations` 都不改变。
- 集成:被移除成员调用 `listCurrentTasks` / `getTaskDetail` 都返回 `TASK_FORBIDDEN`;但 `household.removeOtherMember` 在事务内完成时,留在原家庭的未完成事项的 `householdId` 不变,创建者仍能读到。

**完成验证:** 任意家庭事项在任意时刻最多被其两名成员看到;同一 `operationToken` 重复提交幂等;完成/放弃记录下 `actorNickname` 能在详情页正确显示。

### U3:建立前端 task 状态、单飞保护与超时后重试

**目标:** 让两个成员在不同设备上能可靠地创建、认领、完成和放弃,且重复点击、网络超时不会产生重复事件或错误状态。

**需求:** R4-R6、R8-R9、R11-R13、R15-R16、R28-R30。

**依赖:** U1、U2。

**文件:**

- 新建:`src/store/modules/task.ts`(替换占位)
- 新建:`src/utils/pending-task.ts`(短期操作凭证 storage)
- 修改:`src/store/modules/household.ts`(只在 `household` 模块内,可能需要监听 `tasks` 列表,本计划不强耦合;若需"事项变更后首页刷新"则订阅 task store)
- 测试:`tests/unit/task-store.spec.ts`
- 测试:`tests/unit/pending-task.spec.ts`

**实施方法:**

- `useTaskStore` 沿用对象式 Pinia 写法;state 包含 `phase`(checking/editable/creating/claiming/completing/abandoning/loaded/failed),`current: { priority, groups }`,`detail: TaskDetail | undefined`,`completed: { items, cursor, loading }`,`pendingOperation: PendingTask | undefined`,`errorMessage`。
- 操作凭证:每次 create/claim/complete/abandon 生成 `requestId_<timestamp>_<random>` + `operationToken_<timestamp>_<random>`,落到 `pending-task.ts` 的 storage,刷新可恢复。
- 单飞保护:`createInFlight` / `claimInFlight` / `completeInFlight` / `abandonInFlight` 与云端调用一一对应,重复点击直接复用 inflight 的 promise。
- 超时后重试:首页 `loadCurrent` 在超时后先调用 `getTaskDetail` 或 `listCurrentTasks` 重新确认;若已生效则按成功更新 state;否则保留可重试。
- 完成/放弃二次确认:前端弹 `uni.showModal` 二次确认,只针对 `abandon`;`complete` 不弹。

**遵循模式:** `src/store/modules/household.ts` 的 `applyHome` / `applyNoHome` / `authoritativeRevision` 防 race / `pending` 短期凭证 / `cloudClient` 抽象。

**测试场景:**

- 正常:createTask 成功后 `current.groups` 增加新事项;claim 成功后 `current` 对应事项 `status` 变为 `claimed`;complete 后该事项从 `current` 消失并出现在 `completed.items` 头部。
- 边界:连续点击 3 次"完成"按钮,只发一次 `completeTask` 云端调用。
- 边界:已过期的 `pending-task.ts` storage 条目在 store 初始化时被清空。
- 错误:网络中断后页面停在 `creating/claiming/completing/abandoning`;恢复后用户点重试,先调用 `getTaskDetail` 确认;已生效则按成功处理。
- 错误:云端返回 `TASK_TERMINAL` / `TASK_FORBIDDEN` / `TASK_DUPLICATE_OPERATION` 时,`errorMessage` 展示受控提示,不覆盖 `current` 已有内容。
- 集成:被移除者刷新后,`loadCurrent` 返回 `TASK_FORBIDDEN`,`errorMessage` 显示"你已不在这个家中",并触发"我们的家"页或 create-home 路由(由 `auth.consumeNavigationIntent` 接力)。

**完成验证:** 重复点击、重连、迟到响应不会让前端显示错误家庭或重复事件;`pending-task.ts` 不留永久凭证;typecheck 通过。

### U4:实现添加、详情、首页事项区与"我们的家→已完成"页面

**目标:** 把真实事项状态变成用户可以理解和操作的页面,包括添加页、详情页、首页分组、"我们的家→已完成"分页入口。

**需求:** R1-R3(添加入口)、R17-R21(首页)、R22-R27(详情)、R12(已完成入口)、R20(已放弃入口)。

**依赖:** U1、U3。

**文件:**

- 新建:`src/subpackages/task/add-task/index.vue`
- 新建:`src/subpackages/task/add-task/add-task-view.ts`
- 新建:`src/subpackages/task/task-detail/index.vue`
- 新建:`src/subpackages/task/task-detail/task-detail-view.ts`
- 新建:`src/components/task/TaskList.vue`(替换占位,真正按类型分组)
- 新建:`src/components/task/TaskSummaryCard.vue`
- 新建:`src/components/task/TaskEventList.vue`
- 新建:`src/subpackages/task/completed-tasks/index.vue`
- 新建:`src/subpackages/task/completed-tasks/completed-tasks-view.ts`
- 修改:`src/pages/index/index.vue`(接入 `current.priority` 和 `current.groups`,加"快速添加"按钮,保留 `home-single-member` / `home-two-members` testid)
- 修改:`src/subpackages/household/member-management/index.vue` 或在"我们的家"页加"已完成事项"入口
- 修改:`src/pages.json`(注册新增分包页面)
- 测试:`tests/unit/add-task-view.spec.ts`
- 测试:`tests/unit/task-detail-view.spec.ts`
- 测试:`tests/unit/completed-tasks-view.spec.ts`
- 测试:`tests/e2e/shared-task.spec.js`(新建)

**实施方法:**

- 添加页 (`/subpackages/task/add-task/index.vue`):
  - 字段:名称(必填,1-20 字,失焦时校验)、类型(三个 chip 必选)、截止日期(可空,日期选择器)、备注(可空,最多 100 字)。
  - 提交按钮:名称合法 + 类型已选时启用;`isBusy` 时禁用 + loading;成功后 `uni.reLaunch('/pages/index/index')`。
  - 错误信息:展示在按钮上方,只显示受控文案编号对应的中文。
- 详情页 (`/subpackages/task/task-detail/index.vue`):
  - 顶部:名称、类型(色块)、状态(待处理/已认领/由 X 处理/已完成/已放弃)、截止日期。
  - 操作区:按状态显示按钮(待处理→"我来处理"+"完成"+"放弃";已认领→"完成"+"放弃";终止态→无按钮)。
  - 底部 events 列表:按时间倒序展示"X 在 Y 时 创建/认领/完成/放弃",只显示昵称。
  - `onShow` 调用 `loadDetail(taskId)`,失败时停在骨架 + 错误页 + 重试。
- 首页事项区(替换占位):
  - 单人家庭:保持邀请入口,事项区显示"等邀请完成后,我们就从第一件小事开始"(不显示"先记下一件事"——本需求 R21)。
  - 双人家庭 + 无未终止事项:显示"先记下一件事"空状态。
  - 双人家庭 + 有未终止事项:渲染"优先处理"组(在"其他事项"上方),然后是"快没了 / 待处理 / 快到期"三个分组。
  - 底部固定"快速添加"按钮(`safe-area-inset-bottom`)。
- "我们的家→已完成"页 (`/subpackages/task/completed-tasks/index.vue`):
  - 一次性加载首屏 20 条;上拉触底加载下一页(`nextCursor`)。
  - 每条显示:名称、状态(已完成/已放弃)、完成人/放弃人、时间。
  - 空状态:显示"还没有已完成的事项"。
- 视图函数文件(`*-view.ts`)承担纯函数(校验、分组、按钮可见性、日期文案),不写 UI;由 `.vue` 通过 `setup` 引用。
- 私有组件:`TaskList`、`TaskSummaryCard`、`TaskEventList` 放在 `src/components/task/`,因为被首页、详情页、已完成页共用。

**遵循模式:** `src/subpackages/household/create-home/index.vue` 的"私有视图函数 + 单文件 Vue + 加载/失败/重试";`src/components/home/HomeSummaryCard.vue` 的"业务卡片而非通用组件";`src/subpackages/household/member-management/index.vue` 的"二次确认 modal"。

**测试场景:**

- 正常:添加页空名称时按钮禁用 + 错误提示;选择类型后按钮启用;成功提交后回到首页看到新事项。
- 正常:详情页待处理状态下,任一成员都能看到"我来处理"+"完成"+"放弃"三个按钮;点"我来处理"后状态变已认领,按钮变"完成"+"放弃";点"完成"后跳回首页,该事项从待处理消失,进已完成第一页。
- 正常:首页"优先处理"组按截止日期升序,今天/逾期的排在最前;其他事项按类型分组,每组内无日期的排最后。
- 边界:无日期的事项排在"快到期"组最后,跨组顺序固定。
- 边界:截止日期等于今天的事项在"优先处理"组,不在"快到期"组。
- 错误:网络失败时添加页/详情页都保留已填内容 + 重试;重复点"完成"按钮只生效一次。
- 错误:被移除者打开任务详情 URL(直接 reLaunch),看到"你已不在这个家中"并跳回创建页。
- 集成:e2e `shared-task.spec.js` 验证:`reLaunch` 添加页 → 提交 → 首页看到;`reLaunch` 详情页(用 query 传 taskId)→ 看到对应内容;首页事项区分组的 testid 存在。

**完成验证:** 全部 UI 流程在 `program.reLaunch` e2e 下可触发(无真实微信会话时按预期 skip);typecheck + 单元测试通过;首页 `home-single-member` / `home-two-members` testid 保持(行为不变,但内容由事项区替换);新 testid:`task-priority-section`、`task-group-low_stock` / `task-group-to_handle` / `task-group-expiring`、`task-add-entry`、`task-detail-card`、`task-completed-entry`。

### U5:补齐部署说明与双账号验收

**目标:** 让测试云环境能够可靠部署、验证事项模块,而不是只在模拟账号上看页面。

**需求:** 全部需求 + 成功标准 + 双账号验收路径(10 条)。

**依赖:** U2、U3、U4。

**文件:**

- 修改:`cloudfunctions/README.md`(增加 `task` 云函数 + `tasks` / `taskOperations` 集合说明)
- 修改:`docs/prd/005-shared-task-prd.md`(在"成功标准"后加"双账号验收路径"小节,参照 PRD 004 的格式)
- 修改:`tests/e2e/shared-task.spec.js`(扩展更多页面结构)
- 测试:`tests/unit/task-store.spec.ts`、`task-domain.spec.ts` 扩展

**实施方法:**

- 更新云端集合清单:在"所有用户不可读写"清单中加入 `tasks`、`taskOperations`。
- 记录双账号验收 10 条路径(已在 PRD 005 列出);每条都要在测试云环境用真机走完,并把验收截图/录像链接附在发布说明。
- 自动化可覆盖的页面结构和文案状态继续写入 e2e;微信真分享、两个账号同时操作、云端并发归真机验收。
- 在 `cloudfunctions/README.md` 的"部署前检查清单(邀请与成员变更)"后追加"部署前检查清单(共同事项)"小节,结构对齐。

**遵循模式:** `cloudfunctions/README.md` 的现有清单;`docs/prd/004-invite-join-home-prd.md` 的"双账号验收路径"小节;`tests/e2e/invite-join-home.spec.js` 的页面结构测试。

**测试场景:**

- 集成:两个真实账号在测试环境完成"创建 → 双方可见 → 任一成员认领 → 任一成员完成 → 双方在已完成看到"全流程,每一步都符合预期。
- 集成:两个账号同时点"完成"(并发),仅一个成功,另一个得到"已完成"或幂等结果。
- 集成:创建者移除成员后,被移除者刷新不再能读取原家庭事项;创建者仍能读取未完成事项。
- 集成:自定义家庭头像、成员头像在事项详情/首页事项区只对当前家庭成员可见,非成员不可见。

**完成验证:** 文档列明全部需要的集合、权限和双账号检查;自动化测试与真机验收边界清晰可重复;`task` 云函数在测试云环境部署成功,版本号记录在 README。

## 系统影响

- **入口影响:** `src/pages/index/index.vue` 在邀请上线后的"快速添加"入口从无到有;`/subpackages/task/add-task`、`/subpackages/task/task-detail`、`/subpackages/task/completed-tasks` 是新分包。
- **状态影响:** 现有 `useTaskStore` 是占位假数据,本计划重写为真实云端数据;`useHouseholdStore` 与本计划无强耦合,只共享"家庭归属"语义。
- **数据影响:** 新增 `tasks` 与 `taskOperations` 两个集合;`tasks.householdId` 与 `households._id` 关联;`tasks.assigneeKey` 是家庭成员内部身份键(不返回前端);`taskOperations` 与 `householdOperations` 风格一致,记录每次状态变化。
- **资料影响:** 操作记录的 `actorNickname` 是事件发生时该成员的家庭展示昵称;成员改昵称后,旧事件仍显示旧昵称(用事件时快照,不回溯)。
- **不变规则:** 登录仍不收集手机号或强制微信资料;家庭模块的归属锁、双账号访问限制保持;事项不暴露给非家庭成员,即使复制 URL。

## 风险与应对

| 风险 | 应对 |
| --- | --- |
| 服务端排序与客户端预期不一致,首页分组错位 | 服务端为单一排序源,客户端不重新排序;`listCurrentTasks` 的分组结构与 PRD 005 R17-R21 严格对应 |
| 截止日期时区歧义("今天"是哪天) | 服务端用 `dueDateAt = dueDate 00:00 UTC`,客户端只展示日期;判断"今天"用本地时区与 `dueDate` 字符串比较,不解析 `dueDateAt` |
| 操作事件被前端伪造(`actorNickname` 来自前端) | 服务端按 `identityKey` 在事务内查 `users.nickname`,写入 `taskOperations.actorNickname`;前端只展示,不能传入 |
| 重复点击造成重复事项/重复事件 | store 单飞 + `operationToken` 幂等;e2e 覆盖连续点击 3 次的场景 |
| 已完成列表无限增长导致首页加载慢 | 完成/放弃事项不进首页,只在"我们的家→已完成"分页;每次只拉 20 条 |
| 被移除成员仍能读历史事项 | 每次调用都校验身份属于该 `household.memberKeys`;`household.removeOtherMember` 在事务内更新 `memberKeys`,后续调用都失败 |
| 创建者移除成员后未完成事项没人认领,变成长期孤儿 | R14-R16 已允许任一成员放弃;创建者自己也能放弃,不必依赖被移除者 |
| 微信分享任务详情链接(未来扩展)涉及权限 | 本阶段不开放任务详情分享;只允许从首页/添加页进入 |
| 客户端类型宽到接受任意 actorKey,被注入 | `isTaskDetail` 严格校验 `actorKey` 不出现在前端类型里,负向测试覆盖 |

## 延后事项

- 编辑事项(名称、截止日期、备注)。
- 转交、重新打开、删除(只能完成或放弃)。
- 重复事项、模板。
- 提醒、推送、附件。
- 多人家庭(>2 人)、统计、积分、排行。
- 任务详情分享(可能涉及权限模型升级)。
- 把已有事项从一个家庭迁移到另一个家庭(PRD 004 R32 留待"事项上线后必须重新确认",本计划已确定"留在原家庭变孤儿")。

## 参考

- 原始需求:`docs/prd/005-shared-task-prd.md`
- MVP 设计方案:`docs/plans/2026-08-13-001-feat-mvp-product-design-plan.md`(第十三节"后续开发顺序")
- 现有登录分流:`cloudfunctions/resolve-login/entry-state.js`
- 现有家庭领域规则:`cloudfunctions/household/household-domain.js`
- 现有邀请领域规则:`cloudfunctions/household/invitation-domain.js`
- 现有家庭状态:`src/store/modules/household.ts`
- 现有家庭服务:`src/services/household-cloud.ts`
- 邀请模块实施计划:`docs/plans/2026-08-14-002-feat-invite-join-home-plan.md`(单元 5 部署说明与双账号验收可作参考)
- 云端事务:[CloudBase 事务说明](https://docs.cloudbase.net/database/transaction)
- 数据库权限:[CloudBase 安全规则说明](https://cloud.tencent.com/document/product/876/41802)
