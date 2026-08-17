# PRD 007：事项删除（软删除 + 30 天清理）

> 模块 3 期：补齐 PRD 005 留下的"不含删"。本期只做删除，不做产品级恢复入口。

## 1. 背景

PRD 005 状态机：`pending → claimed → (completed | abandoned)`，终态不可重开。但仍缺一个明确的"删除"动作。当前只能通过"完成"或"放弃"结束一个任务，但有时候任务就是写错了 / 重复了 / 不再需要，再放在"已完成"里占位置很别扭。

需要给 pending/claimed 的事项一个"删除"动作，让家庭成员能把"无效"或"误建"的事项从所有人的视图里清掉。completed / abandoned 的事项有审计价值，**不允许删**。

## 2. 目标

- 任何家庭成员都能删除**未终止**的事项（pending/claimed）
- 软删除：30 天内数据保留（供工程师运维恢复），30 天后由定时任务物理清理
- 删除实时推送：其他家庭成员的首页 / 详情页立刻看到这条消失
- 删除是不可逆的产品操作，但留 30 天软删窗口
- 没有任何"产品级恢复"入口（避免误操作空间）

## 3. 关键决策（已锁）

| # | 决策 | 选择 |
|---|------|------|
| 1 | 删除范围 | 只删 pending/claimed；completed/abandoned 永久保留 |
| 2 | 删除方式 | 软删除：tasks 加 `deletedAt` + `deletedBy` 字段，30 天后定时任务物理删 |
| 3 | 删除权限 | 任一家庭成员（`identityKey ∈ household.memberKeys`） |
| 4 | 触发点 | 详情页"放弃"按钮旁加"删除"按钮；点击弹二次确认 |
| 5 | 删除后行为 | 二次确认后直接 `uni.reLaunch` 回首页（事项不再可见） |
| 6 | 恢复入口 | **不做**产品级恢复 UI；30 天软删仅供工程师运维恢复 |
| 7 | 30 天清理 | 新增 `cleanup-deleted-tasks` 每日定时任务，物理删除过期软删数据 |

## 4. 用户流程

### 4.1 删除一条 pending 事项

```
A 在详情页点"删除" 
  → 弹确认框 "「事项标题」删除后无法在产品内恢复，30 天后系统清理。是否继续？"
  → A 选"继续"
  → 调云函数 delete action
  → 云端软删（写 deletedAt + deletedBy + taskOperation）
  → 返回 DELETED
  → 前端清空 store.detail + applyRemovedFromCurrent
  → uni.reLaunch 回首页
  → A 看到首页这条已消失

B 在另一台设备
  → watch 收到 deletedAt 变化
  → applyRemovedFromWatch(taskId)
  → B 首页这条消失
  → B 如果正在看这条详情，detail 返回 TASK_NOT_FOUND（因为 getTaskDetail 过滤 deletedAt）
```

### 4.2 删除一条 claimed 事项

```
A 在详情页点"删除"（即使 B 已认领）
  → 同上，但会写一条 "X 删除了这件事" 到 taskOperations
  → terminalActor 字段不动（因为这不是完成/放弃）
  → events 列表里 create → claim → delete，X 看到由 B 接手处理过但最终被 A 删了
```

### 4.3 已终止任务不能删

- 详情页 completed/abandoned 时"删除"按钮不显示
- 即使云端被绕过调用，server 返回 `TASK_TERMINAL`

### 4.4 重复点击 / 网络异常

- 重复点击：同 `operationToken` 走幂等，第二次返回上次结果
- 超时：先查详情，已软删则按成功处理（带"删除结果仍在确认中"提示）
- 断网：撤销失败；用户可在云端用 30 天软删恢复（运维）

## 5. 详细规则（R-items）

### 删除触发

- R1：详情页 pending/claimed 时显示"删除"按钮（plain 风格，紧邻"放弃"）
- R2：completed/abandoned 时"删除"按钮不显示
- R3：点击"删除"弹二次确认（uni.showModal），文案："「{title}」删除后无法在产品内恢复，30 天后系统清理。是否继续？"
- R4：用户必须选"继续"才发起请求；选"取消"或关闭弹窗不请求
- R5：删除按钮在 in-flight 期间禁用，避免重复点击

### 云端校验

- R6：必须为家庭成员（`identityKey ∈ household.memberKeys`），否则 `TASK_FORBIDDEN`
- R7：任务必须未终止（`status ∈ {pending, claimed}`），否则 `TASK_TERMINAL`
- R8：必须未软删（`deletedAt IS NULL`），否则 `TASK_NOT_FOUND`
- R9：同 `operationToken` 重复提交返回上次结果（幂等）
- R10：内容安全检查（与 create / update 一致）

### 软删写库

- R11：在同一事务内：
  - `task.deletedAt = now()`
  - `task.deletedBy = identityKey`
  - `task.updatedAt = now()`
  - 创建 `taskOperation`（`_id = opId`，`taskId`，`householdId`，`kind = 'delete'`，`actorKey = identityKey`，`at = now()`）
- R12：taskOperation 写 kind='delete'，不带 changedFields（delete 没有"改了哪些字段"概念）

### 列表过滤

- R13：`listCurrentTasks` 过滤 `deletedAt IS NULL`（所有未终止查询都过滤）
- R14：`getTaskDetail` 看到 `deletedAt != null` 返回 `TASK_NOT_FOUND`
- R15：`listCompletedTasks` 过滤 `deletedAt IS NULL`（已完成的也不应列出已删的）
- R16：单条 summary 查询（首页的 `findOpenTasksByHousehold`）过滤 `deletedAt IS NULL`

### 实时推送

- R17：删除触发 `db.watch` 的 onChange 推送（doc 的 deletedAt 变化）
- R18：前端 watch 回调识别 `deletedAt` 被设置，调用 `applyRemovedFromWatch(taskId)`，从 store.current 和 store.detail 移除
- R19：watch 不推送时（连接断开），onShow 重拉兜底
- R20：watch 静默回退（不弹错误），跟评论 watch 走同一条通道

### 前端状态

- R21：成功删除后清空 `store.detail`（避免下次进详情页拿到旧数据）
- R22：`store.current` 中删除这条（priority + 三个分组都要清）
- R23：成功删除后 `uni.reLaunch` 回首页（不留历史栈）

### 30 天清理

- R24：新增 `cleanup-deleted-tasks` 定时云函数（每日 03:00 触发）
- R25：扫 `tasks` 集合 `deletedAt < now - 30d` 的文档，物理删除
- R26：同时删 `taskOperations` 里 `taskId` 对应的所有操作记录（避免孤立 op）
- R27：清理操作记日志（"deleted N tasks / M operations"），但不写 `taskOperations`（避免循环）

## 6. 不在本期范围

- 产品级恢复 UI（30 天内"已删除"列表 + 恢复按钮）
- 删除前的批量操作
- 家庭成员 A 看到"X 删除了这件事"系统通知（只通过 watch 实时推送事件，不接 wx 订阅消息）
- 任务删除前的导出 / 归档
- 操作记录里把 delete 单独分类（仍是普通事件）

## 7. 数据契约

### 7.1 task 文档扩展

```js
// tasks/{taskId}
{
  _id, householdId, type, title, dueDate, note,
  status, createdBy, createdAt, updatedAt,
  assigneeKey, terminalAt, terminalBy, terminalKind,
  comments, editVersion,
  // 新增（PRD 007）
  deletedAt: ISO  | null,   // 软删时间；null = 未删
  deletedBy: identityKey | null  // 删的人；null = 未删
}
```

### 7.2 taskOperation kind 扩展

```js
// taskOperations/{opId}
{
  _id, taskId, householdId, kind, actorKey, at, changedFields?,
// kind: 'create' | 'claim' | 'complete' | 'abandon' | 'edit' | 'delete'
// delete 事件没有 changedFields 字段
}
```

### 7.3 前端 API

```ts
// 请求
interface DeleteTaskRequest {
  taskId: string
  requestId: string
  operationToken: string
}

// 结果
type DeleteTaskResult =
  | { status: 'DELETED'; retryable: false; taskId: string; deletedAt: string }
  | { status: 'TASK_NOT_FOUND' | 'TASK_FORBIDDEN' | 'TASK_TERMINAL' | 'TASK_DUPLICATE_OPERATION' | 'TASK_TEMPORARY_FAILURE' | 'TASK_INVALID_REQUEST'; retryable: boolean; errorMessage: string }
```

## 8. 异常处理

| 场景 | 行为 |
|------|------|
| 已终止任务 | server `TASK_TERMINAL`；前端"删除"按钮本来就不显示 |
| 非家庭成员 | server `TASK_FORBIDDEN` |
| 重复点击 | operationToken 幂等 |
| 网络中断 | 超时后 `recoverAfterTimeout` 查详情；已删则按成功 |
| watch 断开 | 静默回退到 onShow 重拉 |
| 30 天清理失败 | 单条失败不阻塞其他条；下次再清 |

## 9. 安全 / 隐私

- `deletedBy` 只存内部身份键（跟其他 event 一致）
- 删除操作不进家庭 / 用户 / 头像相关审计
- 不写云函数调用日志里的"title / 内容"原文（已结束的事项可能含敏感备注）
- 30 天清理时只清 `tasks` + `taskOperations`，不触碰 `households` / `users`

## 10. 双账号真机验证（4 条新路径，加到 cloudfunctions/README.md）

19. **删除 pending**：A 创建 → A 点删除 → 二次确认 → A 回首页看不到；B 刷新也看不到
20. **删除 claimed**：A 创建 → B 认领 → A 点删除 → 二次确认 → 双方都看不到；A 详情页操作记录有"由 A 删除了"
21. **删除实时推送**：A 在首页看 → B 删一条 → A 看到这条消失
22. **已终止不能删**：A 完成某事项 → A 进详情 → "删除"按钮不显示

## 11. 验收清单

- [ ] 详情页"删除"按钮：仅 pending/claimed 可见
- [ ] 二次确认弹窗：标题、内容、确认/取消按钮
- [ ] 删除成功 → 跳回首页，事项不再可见
- [ ] 双账号实时：另一台设备看到事项消失
- [ ] 二次确认取消：UI 状态回到正常，不发请求
- [ ] 重复点击：单飞保护，只有一次 delete 操作落库
- [ ] 已终止任务：UI 不显示删除按钮；server 拒绝
- [ ] 非家庭成员：server 拒绝（TASK_FORBIDDEN）
- [ ] 30 天后定时清理：deletedAt < now - 30d 的 task + 关联 taskOperations 物理删除
- [ ] watch 断开：不弹错误，onShow 重拉兜底
- [ ] 自动化测试：cloud function 域 + 前端 store + 详情页按钮可见性 + 二次确认流
