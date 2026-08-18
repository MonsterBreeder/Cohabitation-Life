# 微信云端服务目录

这里放置用户、家庭、事项、记账 4 类云端服务。首次在微信开发者工具中开通开发环境后，再创建并上传这些服务。

第一版只允许同一家庭的两名成员读取和修改家庭数据，所有权限判断都在云端完成。

## 登录入口服务

`resolve-login` 是登录和启动分流的唯一云端入口。它只从微信可信调用上下文取得当前身份，再转换为服务端稳定身份键；数据库不保存原始微信身份。家庭归属只以家庭成员名单为准，不信任前端传来的用户、家庭或邀请判断。`resume` 只查询；`login` 只会幂等创建最小用户资料，不会创建家庭成员关系，也不会使用邀请。

邀请标识仅用于校验。格式错误、查询不到或无权使用时，服务统一返回"邀请无效"，不会写入用户资料。日志只保留调用意图、结果、耗时和内部关联编号，不记录身份、邀请原值或家庭资料。

部署前需要在微信云开发控制台为 `users`、`households` 和 `invitations` 三个集合设置规则：小程序客户端直接读取和写入一律拒绝，只允许云函数访问。

## 家庭服务

`household` 负责创建家庭。它只使用微信可信身份建立拥有者和成员关系，不接受前端指定的用户、拥有者、成员或家庭编号。创建过程会在同一事务内保存家庭和固定创建锁；重复提交、并发提交或首次响应丢失时，都会返回第一次成功创建的家庭资料，不覆盖第一次填写的内容。

部署前还需创建 `householdCreationLocks` 集合，并与 `households` 一样拒绝小程序客户端直接读写。历史家庭仍以 `households.memberKeys` 为归属依据；同一身份异常归属多个家庭时，服务会停止创建，等待人工核对，不能自行选择或新增家庭。

## 邀请与成员变更

`household` 同时负责生成邀请、预览、确认加入或转入，以及移除另一位成员。邀请原文只会短暂保存在创建者自己的设备上；云端只保存不可还原的摘要。每个家庭始终只保留一份当前有效邀请，重新生成后原邀请立即失效。

## 部署前检查清单（邀请与成员变更）

邀请功能上线前必须按顺序完成以下步骤；任一项未确认前，不要发布新版本小程序或新版本云函数。

### 1. 云函数部署

- 在云开发控制台分别上传 `cloudfunctions/resolve-login` 和 `cloudfunctions/household` 两个云函数。
- 等待两个云函数的部署状态变为"部署成功"，记录版本号。
- 确认 `household` 云函数内的 `package.json` 已经声明 `wx-server-sdk` 与 `uuid`，不要在控制台里把依赖标记为"不上传"导致运行时找不到包。

### 2. 集合与权限

- 在云开发数据库里创建以下集合（不存在则新建）：
  - `users`
  - `households`
  - `householdCreationLocks`
  - `householdOperations`
  - `invitations`
  - `avatarMedia`
  - `avatarUploadSlots`
  - 头像相关辅助集合（按 `cloudfunctions/household` 内实际引用补齐）
- 把上述每个集合的"安全规则"都设为"所有用户不可读写"，即只允许云函数访问。
- 验证方式：使用任意一个非云函数客户端（如本地调试器或 Postman 携带小程序 token 模拟）尝试读取或写入任一集合，都应返回权限错误而不是空数据。
- 不要给任何集合开启"所有用户可读"或"创建者读写"的默认规则；成员关系、邀请摘要和操作记录的可见性由云函数在事务内决定。

### 3. 自定义头像目录

- 部署 `household` 时保留 `config.json` 中的图片安全检查权限；本版本使用同步图片检查，检查不可用时不会保存头像。
- `avatar-staging/` 与 `avatar-private/` 必须禁止客户端读取，正式头像只由云函数在确认家庭成员身份后返回短期地址。
- 正式文件路径包含独立随机段和完整内容摘要，不可由家庭编号、用户编号或资源编号推测。短期地址的实际有效期以微信云返回为准，不在客户端作固定秒数承诺。
- 在云开发控制台完成临时上传目录与正式头像目录的访问规则验证：临时上传目录不对其他用户开放，正式头像目录不允许客户端覆盖；成员头像通过短期地址读取。上线前以成员和非成员两个身份完成真机验证。
- 部署 `cleanup-avatar-media` 的每日定时任务，用于分批清理取消、拒绝、失败和已替换图片。
- 正式验收前必须用成员与非成员两个微信身份验证存储规则、图片检查权限和短期地址过期行为。

### 4. 双账号验收（真机 + 微信开发者工具）

下列每一条都必须在测试云环境用两个不同的微信账号走完；任一账号的成员关系、家庭归属或可见资料与预期不符时，立即停止发布并定位修复。

1. **首次邀请加入**。账号 A 创建家庭 → 准备邀请 → 通过微信分享发送给账号 B → B 接受后双方首页都显示两人家庭，且家庭成员数与昵称一致。
2. **两边已建单人家庭后的转入**。账号 A 和账号 B 各自先创建单人家庭 → A 准备邀请并分享 → B 在加入确认页选择"确认转入"并完成二次确认 → 双方均进入 A 的家庭，B 的旧单人家庭不再出现；B 自己的昵称和头像保留。
3. **并发确认同一邀请**。在测试云环境同时用两个账号在 2 秒内提交同一份邀请的确认 → 仅一个账号成功，另一个账号得到"这个家已经满员"的提示，旧家庭双方均未受影响。
4. **创建者移除成员**。双人家庭中由创建者在成员管理页二次确认移除 → 创建者立即回到单人状态 → 被移除者下次打开或刷新时进入创建家庭页，并显示"你已不在这个家中"的说明。
5. **被移除者重进**。被移除者重新创建家庭 → 旧邀请链接再次被打开时显示"邀请已被使用"或"邀请无效"，不能直接加回原家庭。
6. **非成员访问**。在测试云环境用一个未加入任何家庭的第三方账号，尝试访问被分享的家庭头像、名称或成员资料；无论是直接打开页面、复制分享链接再次访问，还是通过控制台拉取云端数据，都不应返回真实家庭资料。
7. **邀请过期**。将测试云环境的邀请过期时间临时调短（如 1 分钟）或等待 24 小时后再次打开原邀请链接，确认展示"邀请已失效"而不是其它入口，且不会写入或修改任何家庭资料。

### 5. 自动化与真机的边界

下列场景在本地或 CI 里用 Jest 自动化覆盖：页面结构（testid、关键文案、可见性）、云端纯函数规则（`household-domain`、`invitation-domain`）、状态机（家庭状态、邀请状态、登录入口分流）。下列场景必须用微信开发者工具或真机验收，不通过自动化伪造通过：微信分享卡片（无法在没有真微信的进程里复现）、两个真实微信账号同时操作（无法由单进程模拟）、云端事务并发（需要部署到测试云后用多设备同时触发）。

发布前在自动化测试报告里确认所有可自动化项都通过，并把真机验收记录（截图或录像链接）附在版本说明里。

## 部署前检查清单（共同事项）

共同事项功能上线前必须按顺序完成以下步骤；任一项未确认前，不要发布新版本小程序或新版本 `task` 云函数。

### 1. 云函数部署

- 在云开发控制台上传 `cloudfunctions/task` 云函数。
- 等待部署状态变为"部署成功"，记录版本号。
- 确认 `task` 云函数内的 `package.json` 已经声明 `wx-server-sdk`。
- `task` 云函数不需要图片安全检查，`config.json` 仅保留 `security.msgSecCheck` 权限。
- `task` 云函数当前支持 10 个 action：`create` / `claim` / `complete` / `abandon` / `update` / `addComment` / `delete` / `getDetail` / `listCurrent` / `listCompleted`。
  - `update`（PRD 006）：编辑 name / type / dueDate / note；带 `editVersion` 乐观锁；只有 pending / claimed 可改；返回最新 `task` + `events` + `editVersion`。
  - `addComment`（PRD 006）：多人评论 1-200 字；评论不可改不可删；终态后拒绝；返回最新 `detail`（含 `comments` 数组 + `editVersion`）。
  - `delete`（PRD 007）：软删除（写 `deletedAt` + `deletedBy`，30 天后由 `cleanup-deleted-tasks` 定时任务物理清理）；只有 pending / claimed 可删；返回 `DELETED` + `deletedAt`。
- **新增定时任务** `cloudfunctions/cleanup-deleted-tasks`：每日 03:00 触发，扫 `deletedAt < now - 30d` 的 task 物理删除（同时删关联的 `taskOperations`）。部署到云开发后，在云开发控制台 → 云函数 → 找到 `cleanup-deleted-tasks` → 触发器 → 创建定时触发器（cron: `0 3 * * * *`）。

### 2.1 实时推送（WeChat Cloud db.watch）

- 仅 `comments` 字段接实时推送；`title` / `type` / `dueDate` / `note` / `status` 等其他字段变化不会触发前端实时刷新，仍按详情页 `onShow` 拉取最新值。
- 详情页 `onLoad` 调用 `subscribeTaskComments(taskId)`；`onUnload` 关闭 watcher；`onHide` 不关闭（用户切回仍可继续收推送）。
- watch 通道是 SSE，长时间后台运行后会自动断开；断开时静默回退到 `onShow` 重拉，不弹错误。
- 合并规则（`applyCommentedFromWatch`）：按 `comment.id` 去重，合并到本地 `detail.comments`；不覆盖 `detail` 其他字段，保留编辑中的草稿。
- 微信云 `db.watch` 按"每条 doc 每次变化"计费；只在详情页打开期间订阅，单次详情页访问只产生 1 个 watcher，按"每条评论推送"计费。

### 2. 集合与权限

- 在云开发数据库里创建以下集合（不存在则新建）：`tasks` 与 `taskOperations`。
- 把上述两个集合的"安全规则"都设为"所有用户不可读写"，由 `task` 云函数在事务内统一校验访问资格。
- 不要给 `tasks` / `taskOperations` 集合开启任何客户端读取或写入权限；首页 / 详情页 / 已完成列表只能通过云函数访问。
- 验证方式：使用任意一个非云函数客户端（本地调试器、Postman 携带小程序 token 模拟）尝试读取或写入 `tasks` / `taskOperations`，应返回权限错误而不是空数据。

### 3. 与现有家庭模块的访问校验

- `task` 云端只通过 `households.memberKeys` 判断身份归属，不重新读家庭资料文档。
- 创建者移除成员时（`household.removeOtherMember`），确保该成员对应的 `tasks` 集合文档 `householdId` 不变；事务完成后 `memberKeys` 已不含此身份键，被移除者后续 `listCurrentTasks` / `getTaskDetail` 都返回 `TASK_FORBIDDEN`，创建者继续读到这些未完成事项（孤儿留在原家庭）。
- 受邀者加入家庭的同事务内确认家庭成员数仍为 1；并发加入场景已在 PRD 004 单元 5 验收。

### 4. 双账号验收（真机 + 微信开发者工具）

下列每一条都必须在测试云环境用两个不同的微信账号走完；任一账号的事项归属、操作记录、可见状态与预期不符时，立即停止发布并定位修复。

1. **创建 → 双方可见**。A 创建三类事项各 1 个；B 刷新后能全部看到；A 自己也看到。
2. **认领闭环**。A 创建待处理事项；B 刷新后看到"我来处理"，点击后状态变为已认领（负责人 B）；A 刷新看到"由 B 处理"，且 A 自己能点"完成"。
3. **完成闭环**。A 或 B 都能完成（任一成员）；完成后该事项从"待处理"列表消失，进入"已完成"，A 与 B 双方都能在"我们的家→已完成"看到，显示实际完成人。
4. **放弃闭环**。A 或 B 都能放弃，放弃需要二次确认；二次确认后才生效；放弃后双方都看不到该事项在"待处理"区，在"已完成"区能看到"由 X 放弃"。
5. **首页优先规则**。同一家庭存在 4 个未终止事项，分别为：已逾期、今天到期、明天到期、本周到期。刷新后只看到 1 个"优先处理"和其余 3 个在"其他事项"按类型分组。
6. **重复点击保护**。连续点 3 次"完成"按钮，只产生一条 `taskOperation`；事项状态只变更一次。
7. **超时后重试**。提交认领时网络中断（DevTools 断网），页面停在"我来处理"；恢复网络后重试，先查询当前状态，已生效则按成功处理。
8. **非成员访问**。第三方账号 C（未加入任何家庭）直接打开分享链接或复制 URL，都看不到 A、B 家庭的事项详情；通过控制台拉取 `tasks` 集合的数据也只返回空（权限拒绝）。
9. **移除成员后归属**。A 创建双人家庭 → B 加入 → A 创建 3 个未终止事项 → A 移除 B → A 仍能看到这 3 个未终止事项；B 刷新后回到无家庭状态，看不到 A 的任何事项，包括这 3 个。
10. **历史保留与分页**。累计创建 25 个事项，完成 25 个；打开"我们的家→已完成"翻页 2 次，看到 20 + 5 条，按时间倒序排列。

### 4.1 事项删除（PRD 007）

11. **删除 pending**：A 创建 → A 进详情 → 点"删除" → 二次确认 → 弹窗选"继续" → A 跳回首页看不到这条；B 刷新也看不到
12. **删除 claimed**：A 创建 → B 认领 → A 点"删除" → 二次确认 → 双方都看不到这条；A 详情页操作记录里有"由 A 删除了"事件
13. **删除实时推送**：A 在首页看 → B 在另一台设备删一条 → A 看到这条消失（无需手动刷新）
14. **已终止不能删**：A 完成某事项 → A 进详情 → "删除"按钮**不显示**（操作按钮区只有"由 X 完成"chip + 截止日期 chip，没有"删除"）

### 4.2 30 天软删清理（PRD 007 U6）

15. **删除后数据库状态**：A 删除一条 → 查 `tasks` 集合 → 该文档 `deletedAt` 字段是 ISO 时间；`deletedBy` 是 A 的 identityKey
16. **30 天清理前查询**：创建一条 31 天前软删的 task + 操作记录 → 列表查询时**看不到**（`deletedAt: null` 过滤）；详情查询返回 `TASK_NOT_FOUND`
17. **30 天后定时清理**：手动把系统时间调到 deletedAt 之后 30 天 → 触发 `cleanup-deleted-tasks` → 任务文档 + 关联 taskOperations 物理删除
11. **编辑权限与可见**。A 创建事项后 B 刷新能看到 → B 进入详情 → 点"编辑事项" → 改名称和截止日期 → A 刷新后看到名称与截止日期均已更新，操作记录里出现"小美 修改了 名称、截止日期"。任一成员都能编辑（不含 assignee）。
12. **editVersion CAS 冲突**。A、B 同时进入同一事项的编辑页 → A 先保存成功（editVersion +1）→ B 再保存 → B 收到"请求已处理，请刷新后查看最新状态"，刷新后看到 A 编辑后的内容。
13. **评论实时推送**。A、B 同时打开同一事项详情 → A 发送"我下班顺路买"→ B 在 2 秒内看到这条评论出现在"备注对话"区，无需手动刷新。
14. **评论封口**。A 把事项完成 → B 刷新进入详情 → "备注对话"区显示"事项已结束，留言通道已关闭"，输入框不可编辑。
15. **评论不可改不可删**。A 发送评论"明天到" → B 刷新看到这条评论 → 不存在删除/编辑入口（仅追加，不可改写）。
16. **编辑后类型变化首页跟随**。A 编辑事项把 type 从"快没了"改为"待处理" → B 刷新首页 → 事项从"快没了"分组移到"待处理"分组。
17. **空编辑不产生事件**。A 进入编辑页 → 不改任何字段直接保存 → 操作记录里不出现 edit 事件（云端 changedFields 为空时按 R5 兜底不写）。
18. **备注对话里编辑同时进行**。A 进入编辑页修改名称（未保存）→ 此时 B 发送一条评论 → A 的编辑页草稿仍为未保存的标题，详情页"备注对话"区直接出现 B 的评论，标题不被覆盖（验证 watch 不覆盖 detail 其他字段）。

### 5. 自动化与真机的边界

下列场景在本地或 CI 里用 Jest 自动化覆盖：页面结构（testid、关键文案、可见性）、云端纯函数规则（`task-domain`）、状态机（事项状态、操作记录事件流）、严格响应校验（`isTaskSummary` / `isTaskDetail` / `isCompletedTaskItem`）、操作凭证 storage（`pending-task`）。下列场景必须用微信开发者工具或真机验收，不通过自动化伪造通过：真微信环境、两个真实微信账号同时操作、并行点击与超时、云端事务并发与撤销。

发布前在自动化测试报告里确认所有可自动化项都通过，并把真机验收记录（截图或录像链接）附在版本说明里。

## 部署前检查清单（家庭共同流水账）

家庭共同流水账（PRD 008）功能上线前必须按顺序完成以下步骤；任一项未确认前，不要发布新版本小程序或新版本 `ledger` 云函数。

### 1. 云函数部署

- 在云开发控制台上传 `cloudfunctions/ledger` 云函数。
- 等待部署状态变为"部署成功"，记录版本号。
- 确认 `ledger` 云函数内的 `package.json` 已经声明 `wx-server-sdk`。
- `ledger` 云函数当前支持 11 个 action：`initCategories` / `addEntry` / `updateEntry` / `deleteEntry` / `restoreEntry` / `listEntries` / `getEntry` / `addCategory` / `updateCategory` / `removeCategory` / `getStats`。
  - `initCategories`：家庭创建时调用（由 `household.createHousehold` 在事务后链式调用），幂等写入 8 个固定类目；已存在则跳过。
  - `addEntry` / `updateEntry`：金额整数分（`amountCents`），类目必须属于该家庭，付款人必须是家庭成员；`updateEntry` 不允许改 `type` / `payerMemberKey`，只接受创建者本人改自己的账。
  - `deleteEntry` / `restoreEntry`：软删除（写 `deletedAt` + `deletedBy`，30 天后由 `cleanup-deleted-ledger-entries` 物理清理）。任何成员都能软删 / 恢复（不仅是创建者）。
  - `listEntries`：按 household + month + payerMode + categoryIds 过滤；`includeDeleted=true` 时同时返回 `deletedEntries` 用于"已删除"区。
  - `addCategory` / `updateCategory` / `removeCategory`：自定义类目；`removeCategory` 拒绝 `refCount > 0` 的（`LEDGER_CATEGORY_IN_USE`）。
  - `getStats`：按月聚合，输出 `monthExpenseCents` / `monthIncomeCents` / `netCents` / `byCategory` / `byPayer`。
- **请求幂等锁契约**（务必区分清楚，前端按此发请求）：
  - **创建类 action**（`initCategories` / `addEntry` / `addCategory`）：使用 `requestId` 做幂等锁（`creationLockId(householdId, requestId)`），**不要**传 `operationToken`；后端也不校验 `operationToken`。
  - **实体操作类 action**（`updateEntry` / `deleteEntry` / `restoreEntry` / `updateCategory`）：使用 `operationToken` 做幂等锁（`operationId(entryId, operationToken)`），必须传 `operationToken`。
  - `removeCategory` 暂时也要求 `operationToken`（防止误删），但云端不在事务里写幂等记录——如果以后改成幂等锁，需要在事务里加 `addOperation`。
  - 前端类型契约：`AddLedgerEntryRequest` / `AddLedgerCategoryRequest` 不带 `operationToken` 字段；`UpdateLedgerEntryRequest` / `DeleteLedgerEntryRequest` / `RestoreLedgerEntryRequest` / `UpdateLedgerCategoryRequest` 必须带 `operationToken`。
- **新增定时任务** `cloudfunctions/cleanup-deleted-ledger-entries`：每日 03:00 触发，扫 `deletedAt < now - 30d` 的账目物理删除（同时删关联的 `ledgerOperations` + 删云存储 `receipts/{householdId}/{entryId}.jpg`）。
- `household.createHousehold` 流程结束后会自动调 `initCategories`（写在 `household-domain.js` 的 `.then()` 块里），如果类目初始化失败（极罕见），用户进入账本时会兜底再次调。

### 2. 集合与权限

- 在云开发数据库里创建以下集合（不存在则新建）：
  - `ledgerEntries`
  - `ledgerCategories`
  - `ledgerOperations`
- 把上述三个集合的"安全规则"都设为"所有用户不可读写"，由 `ledger` 云函数在事务内统一校验访问资格。
- 验证方式：使用任意一个非云函数客户端尝试读取或写入这三个集合，应返回权限错误而不是空数据。
- 云存储目录 `receipts/` 不允许客户端覆盖；凭证图只能由 `ledger` 云函数在 `addEntry` / `updateEntry` 时返回 fileID 给前端。

### 3. 跨云端家庭模块联动

- `household.createHousehold` 在事务结束后链式调 `initCategories`（写在 `household/household-domain.js` 的 `.then()` 块里），保证新家庭一定有 8 个固定类目。
- 成员移除后（`household.removeOtherMember`），被移除者对账目的访问被 `LEDGER_FORBIDDEN` 拒绝（云端从 `households.memberKeys` 校验）；账目数据保留在原家庭，被移除者自己创建新家庭后看不到。

### 4. 双账号验收（真机 + 微信开发者工具）

下列每一条都必须在测试云环境用两个不同的微信账号走完；任一账号的账目归属、操作记录、可见状态与预期不符时，立即停止发布并定位修复。

19. **记支出（A 创建）**。A 在记账页输入金额 50 → 选"餐饮"类目 → 付款人默认 A → 保存 → A 账本首页顶部出现"今天 · 餐饮 -¥50.00"；B 刷新也看到这条。
20. **记收入（B 创建）**。B 在记账页切到"收入"tab → 输入 1000 → 选"其他"类目 → 付款人 B → 保存 → B 账本首页出现"今天 · 其他 +¥1000.00"；A 刷新也看到。
21. **按成员筛选**。A 在首页切"我付的" → 列表只剩 A 记的账；切"对方付的"只剩 B 记的；切"全部"两条都在。
22. **拍照记账**。A 记账时点凭证图 → 拍照 → 上传 → 列表该账目右侧出现缩略图；详情页可点放大查看原图。
23. **编辑自己**。A 打开 A 记的账详情 → 点"编辑" → 改金额 50→80 → 保存 → A 列表金额变 80；B 刷新也变 80（实时推送由首页 onShow 重拉实现）。
24. **不能编辑对方**。B 打开 A 记的账详情 → 不显示"编辑"按钮（只有"只有记账人可以编辑或删除"灰字）。
25. **删除自己 + 实时**。A 打开 A 记的账详情 → 点"删除" → 二次确认 → 选"继续" → A 返回首页看不到这条；B 刷新也看不到。
26. **软删恢复**。A 找一笔已删账（从首页"已删除 (N)"展开区）→ 点"恢复" → 该账回到 active 列表。
27. **自定义类目**。A 在类目管理页点"+ 添加" → 输入"宠物" → 选"tag"图标 + "gray"颜色 → 保存 → 记账页类目 chip 出现"宠物"；B 也能看到。
28. **隐藏类目**。A 在类目管理页隐藏"教育" → A 记账页类目 chip 不再显示"教育"；B 仍能看到（hide 只对自己有效）。
29. **新成员加入看到历史**。A 创建家庭并记 5 笔账 → B 加入 → B 打开账本 → B 看到 5 笔历史账目（按发生时间倒序）。
30. **单成员家庭**。A 单独创建家庭（不邀请 B）→ 账本可正常使用 → 记账页"切换付款人"按钮**不显示**（没有"对方"选项）；统计页只显示 A 一列。
31. **凭证图超限**。A 选 6 MB 图片 → 提示"图片过大，请重新选择"；不允许上传。
32. **凭证图上传失败**。A 模拟弱网 → 提示"上传失败，可稍后重试"；账目可先保存不附图（receiptMediaId 留 null）。
33. **30 天清理**。模拟 31 天前的软删账 → 触发 `cleanup-deleted-ledger-entries` → 账目物理删除 + 关联 ledgerOperations 删除 + 云存储 receipts 删；DB 查 `ledgerEntries` 已找不到该 entry。

### 5. 自动化与真机的边界

下列场景在本地或 CI 里用 Jest 自动化覆盖：账目数据契约（`types/ledger.ts`）、金额 / 备注 / 时间校验（`utils/ledger-validators.ts`）、云端纯函数规则（`ledger-domain`）、软删 / 恢复 / 30 天清理的纯逻辑、类目 CRUD 业务规则、严格响应校验（`isLedgerEntry` / `isLedgerCategory` / `isLedgerStats`）、Pinia store 单飞 + 重算 stats。下列场景必须用微信开发者工具或真机验收：两个真实微信账号同时操作、wording 字段（金额）输入并发、拍照上传凭证图、软删恢复 UI、30 天定时清理（需手动调时间或临时缩短 cron 周期）。

发布前在自动化测试报告里确认所有可自动化项都通过，并把真机验收记录（截图或录像链接）附在版本说明里。
