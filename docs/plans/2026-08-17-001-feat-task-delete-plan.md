# 实施计划：事项删除（PRD 007）

> 模块 3 期。软删除 + 30 天定时清理 + 详情页删除按钮 + 实时推送。共 6 个 U-unit。

## 背景

PRD 005 状态机没有"删除"出口，写错或不需要的事项只能走"完成"或"放弃"，但 completed/abandoned 在 PRD 005 设计里是永久保留作为家庭记忆的，不能当垃圾桶用。PRD 007 补一个"软删除"动作，专门给未终止的事项。

7 个关键产品决策已锁（见 PRD 007 §3）。

## 约束与原则

- 软删除：`deletedAt` + `deletedBy` 字段；不删 `taskOperation`（保留审计）
- 删除权限：任一家庭成员（不是创建者专属）
- 删除范围：仅 pending/claimed（终态不允许删）
- 实时推送：复用 PRD 006 的 `db.watch` 通道，监听 `deletedAt` 字段变化
- 30 天清理：新增 `cleanup-deleted-tasks` 每日定时任务
- 不做产品级恢复 UI（30 天软删仅为运维）

## 现有代码可复用

- **task-domain.js** 的状态机、权限校验、事务模式（参考 `completeTask` / `abandonTask`）
- **task-cloud.ts** 的 `call()` 包装、严格响应校验、`isTaskResult` 已支持 `DELETED` 状态
- **taskStore** 的 `applyTerminal` / `applyCreatedOrClaimed`（删除复用类似模式）
- **task-detail** 的二次确认（参考 `onAbandon` 的 uni.showModal）
- **task-detail** 的 watch 订阅（复用 `subscribeComments`，新增 `applyRemovedFromWatch`）

## U-unit 拆分

### U1：数据契约（Data Contracts）

**目标**：前端类型、严格响应校验、加 `deletedAt` 字段、加 `DeleteTaskRequest/Result`。

**改动文件**：
- `src/types/task.ts`
  - `TaskSummary` / `TaskDetail` 加可选 `deletedAt?: string` 字段
  - 新增 `DeleteTaskRequest { taskId, requestId, operationToken }`
  - 新增 `TaskDeletedResult { status: 'DELETED'; taskId; deletedAt }`
  - `TaskResult` union 加 `TaskDeletedResult`
  - `TaskResultStatus` union 加 `'DELETED'`
  - `PendingTaskKind` 加 `'delete'`
- `src/services/task-cloud.ts`
  - `isTaskSummary` / `isTaskDetail` 接受 `deletedAt` 可选字段（但 U2 会在 server 端过滤，前端拿不到 deletedAt 的 summary/detail）
  - `isTaskResult` 支持 DELETED status + 校验返回字段
  - 新增 `deleteTaskInCloud(input)` 包装
- `src/utils/pending-task.ts`
  - `PendingTaskKind` 加 `'delete'`
  - Pending 草稿不需要（删除没有输入字段）

**验收**：
- type-check 0 错
- 现有 357 测试不破
- 新增 ≥ 5 个测试（DeleteTaskRequest 形状、DELETED 结果校验、isTaskSummary 接受 deletedAt）

---

### U2：云函数（Cloud function）

**目标**：新增 `delete` action + 所有读路径过滤 `deletedAt IS NULL`。

**改动文件**：
- `cloudfunctions/task/task-domain.js`
  - 新增 `deleteTask(input, dependencies)` 域函数
  - 在 `getTaskDetail` / `listCurrentTasks` / `listCompletedTasks` / `findOpenTasksByHousehold` 等加 `deletedAt IS NULL` 过滤
  - `normaliseTask` / `taskSummaryFromRecord` 等保持兼容（不返回 deletedAt）
  - `EVENT_KINDS` 加 `'delete'`
  - 新增工具：`isTaskDeleted(record)` 助手
- `cloudfunctions/task/index.js`
  - 新增 `case 'delete'` 路由
- `cloudfunctions/task/repository-data.js`（如果需要）
  - 在 `findOpenTasksByHousehold` 等地方过滤 `deletedAt IS NULL`
- `tests/unit/task-domain.spec.ts`
  - 新增 ≥ 8 个测试：
    - happy path：任一家庭成员删 pending 成功
    - 任一家庭成员删 claimed 成功
    - 拒绝：已终止（completed / abandoned）→ `TASK_TERMINAL`
    - 拒绝：非家庭成员 → `TASK_FORBIDDEN`
    - 拒绝：已软删 → `TASK_NOT_FOUND`
    - 幂等：同 operationToken 重复 → 返回上次结果
    - 过滤：listCurrentTasks 排除已软删
    - 过滤：getTaskDetail 排除已软删
- `cloudfunctions/cleanup-deleted-tasks/`（**新云函数**）
  - `index.js`：扫 `tasks` 集合 `deletedAt < now - 30d`，物理删除
  - 同时删 `taskOperations` 里 `taskId` 对应的所有操作
  - `package.json` + `config.json`
  - 记日志（云开发日志，不写 `taskOperations`）

**验收**：
- type-check 0 错
- 357 + 新增 ≥ 8 测试全过

---

### U3：前端状态（Pinia store）

**目标**：`taskStore.delete(taskId)` action + `applyRemovedFromCurrent` / `applyRemovedFromDetail` / `applyRemovedFromWatch` 合并。

**改动文件**：
- `src/store/modules/task.ts`
  - `TaskCloudClient` 加 `delete(input)`
  - `defaultCloudClient` 加 `deleteTaskInCloud`
  - `deleteInFlight` 单飞变量 + `resetTaskStoreForTesting` 清理
  - `delete(taskId)` action：写 pending → 调云函数 → 成功应用 `applyRemoved*` → 清空 detail → reLaunch
  - `applyRemovedFromCurrent(taskId)`：从 priority + 三个 type 分组移除
  - `applyRemovedFromWatch(taskId)`：watch 用，只动 current 和 detail，不动其他
  - `humaniseError` 不需要改（DELETED 失败 case 已被覆盖）
  - `restorePending` 阶段映射加 `delete → 'deleting'`
  - `TaskPhase` 加 `'deleting'`
- `tests/unit/task-store.spec.ts`
  - 新增 ≥ 6 个测试：
    - delete 成功应用 applyRemoved（priority + 三分组都清）
    - TASK_TERMINAL → 错误消息
    - TASK_FORBIDDEN → 错误消息
    - in-flight 保护
    - applyRemovedFromWatch 不动其他字段
    - restorePending 映射 delete → 'deleting'

**验收**：
- type-check 0 错
- 357 + 6 测试全过

---

### U4：详情页 + 二次确认（Pages）

**目标**：详情页"放弃"旁加"删除"按钮 + 二次确认 + 删除后跳首页。

**改动文件**：
- `src/subpackages/task/task-detail/task-detail-view.ts`
  - `describeActions` 加 `delete: !isTerminal`（即 pending/claimed 显示）
  - `describeDeleteConfirmMessage(detail)` 返回 "「{title}」删除后无法在产品内恢复，30 天后系统清理。是否继续？"
- `src/subpackages/task/task-detail/index.vue`
  - actions 区加"删除"按钮（plain danger 风格），仅 `availability.delete` 时显示
  - 紧邻"放弃"按钮
  - `onDelete` 方法：弹 uni.showModal → 调 `taskStore.delete(taskId)` → 成功 uni.reLaunch 回首页
  - `isDeleting` computed（taskStore.phase === 'deleting'）
  - 按钮禁用：`isAnyBusy` 加 `isDeleting`
- `tests/unit/task-detail-view.spec.ts`
  - `describeActions` 加 delete 字段
  - 已终止 delete=false 测试
  - pending/claimed delete=true 测试
  - `describeDeleteConfirmMessage` 文案测试

**验收**：
- type-check 0 错
- 357 + 新增测试全过

---

### U5：实时推送（Real-time push）

**目标**：watch 监听 `deletedAt` 字段变化，删除时通知其他家庭成员。

**改动文件**：
- `src/services/task-cloud.ts`
  - `subscribeTaskComments` 改名为 `subscribeTaskChanges`（或新增 `subscribeTaskChanges`）
  - 回调 `onChange(snapshot, type)` 推 `comments` + `deletedAt` 两个字段
  - 合并 `applyCommentedFromWatch` + `applyRemovedFromWatch` 在 `applyWatchedTaskChange(snapshot)`
  - watch 触发时检查 `doc.deletedAt`：非空 → 调 `onTaskDeleted(taskId)`；否则只读 `comments`
- `src/store/modules/task.ts`
  - `subscribeComments` 改名为 `subscribeTaskChanges`（或新增）
  - `activeCommentWatcher` 改名为 `activeTaskWatcher`
  - watch 回调同时处理评论变化和删除变化
- `src/subpackages/task/task-detail/index.vue`
  - `subscribeComments` 改名为 `subscribeTaskChanges`
  - 详情页 onLoad 订阅；onUnload 关闭

**验收**：
- 357 测试不破
- 新增 ≥ 2 个 watch 测试（deletedAt 变化触发 applyRemovedFromWatch）

---

### U6：部署（Deployment）

**目标**：定时任务 + 双账号真机验收路径。

**改动文件**：
- `cloudfunctions/cleanup-deleted-tasks/`
  - 完整云函数目录（`index.js`, `package.json`, `config.json`）
  - 在云开发控制台配置每日 03:00 触发
- `cloudfunctions/README.md`
  - 加 `cleanup-deleted-tasks` 部署说明
  - 加 4 条新双账号验收路径（19-22）
  - 修 `task` 云的 9 个 action 描述为 10 个（含 delete）
- `README.md`
  - 加 PRD 007 模块段
  - 加 `cleanup-deleted-tasks` 到云函数列表

**验收**：
- 357 测试不破
- type-check 0 错

## 文件改动清单

```
docs/prd/007-task-delete-prd.md                          (新增)
docs/plans/2026-08-17-001-feat-task-delete-plan.md       (新增)
docs/prd/README.md                                       (改：007 行)
README.md                                                (改：模块 6)

cloudfunctions/task/task-domain.js                       (改：deleteTask + 过滤 deletedAt)
cloudfunctions/task/index.js                             (改：case 'delete')
cloudfunctions/cleanup-deleted-tasks/index.js            (新增)
cloudfunctions/cleanup-deleted-tasks/package.json        (新增)
cloudfunctions/cleanup-deleted-tasks/config.json         (新增)
cloudfunctions/README.md                                  (改：部署说明 + 4 条路径)

src/types/task.ts                                        (改：deletedAt + DeleteTaskRequest/Result)
src/services/task-cloud.ts                               (改：isTaskResult DELETED + deleteTaskInCloud + watch)
src/store/modules/task.ts                                (改：delete action + applyRemoved + watch rename)
src/utils/pending-task.ts                                (改：'delete' kind)
src/subpackages/task/task-detail/task-detail-view.ts     (改：describeActions + describeDeleteConfirmMessage)
src/subpackages/task/task-detail/index.vue               (改：删除按钮 + onDelete)

tests/unit/task-domain.spec.ts                           (改：+8 tests)
tests/unit/task-store.spec.ts                            (改：+6 tests)
tests/unit/task-detail-view.spec.ts                      (改：+4 tests)
tests/unit/task-cloud.spec.ts                            (改：+2 watch tests)
```

## 测试覆盖

- U1：+5 tests (data contracts)
- U2：+8 tests (cloud function)
- U3：+6 tests (frontend state)
- U4：+4 tests (page)
- U5：+2 tests (watch)
- **总计：+25 tests，目标 382 tests**

## 风险与边界

- **风险**：如果 `cleanup-deleted-tasks` 定时任务执行失败，单条失败不应阻塞其他条；用 try/catch 包裹每条删除
- **边界**：已软删但 30 天内的事项仍占数据库空间（可接受）
- **边界**：watch 在云函数 sleep 期间断开，详情页 onShow 重拉兜底
- **不在范围**：产品级恢复 UI、批量删除、归档导出

## 实施顺序

1. U1（数据契约）→ 立即可验证：type-check
2. U2（云函数）→ 立即可验证：Jest 单元测试 + type-check
3. U3（前端状态）→ 立即可验证：Jest
4. U4（页面）→ 立即可验证：Jest + 视觉检查（dev tools）
5. U5（实时推送）→ 立即可验证：Jest + 双账号真机
6. U6（部署）→ 需要手动部署云函数 + 配置定时任务
