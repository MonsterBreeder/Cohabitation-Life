# 实施计划：家庭共同流水账（PRD 008）

> 模块 4 期。家庭共同账本：记录 + 查看 + 统计 + 类目 + 拍照凭证。共 7 个 U-unit。
>
> 与 PRD 005/006/007 的关系：这是继"共同事项"之后的第二个**完整业务模块**，首次涉及"整数分金额"、"凭证图云存储"、"自定义类目"等全新概念，体积和复杂度都大于 PRD 007。

## 背景

PRD 005 ~ 007 把"家里的事"做成了"两个人共同维护的待办池"。下一个被频繁提到的小事是钱：

- 出门买菜 50 元，月底两人对账时谁也记不清
- 想看"本月餐饮 / 交通 / 居家花了多少"得翻支付宝账单
- 两人分开记，最后互相怀疑数字

PRD 008 补一个**家庭共同流水账**：两人共享一本账，每笔都记金额 / 类目 / 谁付的 / 备注 + 可选凭证图，能按月 / 按成员 / 按类目筛选和统计。

**11 个核心产品决策已锁**（见 PRD 008 §"全部决策"），其中最关键的 4 条：
- **单一共同模式**，没有"共同 / 各自"开关，"各自"只是按成员筛选的视图
- **不计算 AA / 不计算谁欠谁** — 纯流水账
- **完全独立于"事项"模块** — 不引用 task，不联动
- **整数分金额** — 数据库存分，显示 ÷100 加 ¥

## 约束与原则

- **金额**：DB 存整数分（`amountCents: number`），前端按"元"输入但保存为分；永远不存浮点
- **类目家庭级共享**：8 个固定 + 用户可自定义（add / hide / rename，**不删**）；hide 只对自己有效
- **双方都能记 / 改 / 删自己记的账**：编辑 / 删除权限绑定 `payerId === self`；对方记的账**不可改不可删**
- **双方都能看全部**（含新加入成员可看历史）
- **软删除 + 30 天清理**（与 PRD 007 完全一致）
- **凭证图云存储**：`receipts/{householdId}/{entryId}.jpg`，30 天物理删除账目时连带删除云存储
- **不做 AA / 不做结算 / 不做转账独立类型 / 不做 OCR**
- **不做实时推送**（"对方记了一笔账不推给我"）— 留给 PRD 009
- **单成员家庭支持**（只能"我付的"，但功能完整）

## 现有代码可复用

- **PRD 005 共同事项**的 `taskStore` / `task-cloud.ts` / `pending-task.ts` 模式：单飞保护 + 双重凭证 + 超时恢复 + watch 合并（账本不需要 watch，但**单飞 / 凭证**模式可直接复用）
- **PRD 005 的 `householdStore` + 成员列表**：账本"付款人选择"直接消费家庭成员，无需新建
- **PRD 007 软删除 + 30 天清理**：`cleanup-deleted-tasks` cron 模式直接照搬给 `cleanup-deleted-ledger-entries`
- **`docs/brand/visual-standard.md`** 配色：8 个固定类目的色卡从这里取
- **`src/utils/format.ts` 已有的 `formatDate` / `formatRelativeTime`**：账本列表 / 详情 / 统计页直接复用
- **`src/components/task/TaskSummaryCard.vue`** 的"按日期分组列表"模式：账本列表也按"今天 / 昨天 / M月D日"分组
- **`src/static/avatars/`**：账本"付款人头像"复用同一套 192×192 头像

## U-unit 拆分

### U1：数据契约与工具（Data contracts + utils）

**目标**：前端类型 + 校验工具 + 金额格式化 + 幂等锁。

**改动文件**：
- `src/types/ledger.ts`（**新文件**）
  - `LedgerEntry` / `LedgerEntrySummary` / `LedgerEntryDetail`
  - `LedgerCategory` / `LedgerCategorySummary`
  - `LedgerEntryType` (`'expense' | 'income'`)
  - `LedgerFilter` (`{ month?: string; payerId?: 'all' | string; categoryIds?: string[] }`)
  - `LedgerStats` (`{ monthExpenseCents; monthIncomeCents; netCents; byCategory: ...; byPayer: ... }`)
  - `AddLedgerEntryRequest` / `AddLedgerEntryResult`
  - `UpdateLedgerEntryRequest` / `UpdateLedgerEntryResult`
  - `DeleteLedgerEntryRequest` / `DeleteLedgerEntryResult` (`{ status: 'DELETED'; entryId; deletedAt }`)
  - `RestoreLedgerEntryRequest` / `RestoreLedgerEntryResult`
  - `ListLedgerEntriesRequest` / `ListLedgerEntriesResult`
  - `AddLedgerCategoryRequest` / `AddLedgerCategoryResult`
  - `UpdateLedgerCategoryRequest` / `UpdateLedgerCategoryResult`
  - `RemoveLedgerCategoryRequest` / `RemoveLedgerCategoryResult`
  - `GetLedgerStatsRequest` / `GetLedgerStatsResult`
  - `InitLedgerCategoriesRequest` / `InitLedgerCategoriesResult`
  - `LedgerPendingKind` (`'add' | 'update' | 'delete' | 'restore' | 'addCategory' | 'updateCategory' | 'removeCategory'`)
- `src/utils/ledger-validators.ts`（**新文件**）
  - `validateAmountCents(input: string | number): number` — 接受 "12.5" 返回 1250；非数字 / 负数 / 0 / > 9999999 抛错
  - `validateLedgerNote(input: string): string` — 0-100 字；trim 前后空白
  - `validateLedgerOccurredAt(input: Date | string): Date` — 不可晚于今天+1 天，不可早于 2020-01-01
  - `validateLedgerCategoryName(input: string): string` — 2-8 个汉字 / 4-16 个字符
- `src/utils/format.ts`（**改**）
  - 加 `formatYuan(amountCents: number, options?: { sign?: boolean }): string` — `1234` → `"¥12.34"`，`sign: true` 时支出加 `-`、收入加 `+`
  - 加 `formatLedgerMonth(input: Date | string): string` — `"2026-08"`
- `src/utils/pending-ledger.ts`（**新文件**）
  - `PendingLedgerKind` 枚举 + `createLedgerPending(kind, identityKey, requestId)` 草稿生成
  - 草稿字段：add 缓存 `{ amountCents, categoryId, type, payerId, note, occurredAt, receiptTempPath }`；update 同 shape + `entryId`；category 加 cache `{ name, iconKey, colorKey }`
- `tests/unit/ledger-validators.spec.ts`（**新**）
  - ≥ 10 个测试：金额边界（0/负数/小数/超限）、note 边界（空/超长/前后空白）、时间边界（未来/过去太久）、类目名边界
- `tests/unit/format.spec.ts`（**改**）
  - 加 ≥ 4 个测试：formatYuan 整数 / 0 / 负数 / sign 选项 / 月份格式
- `tests/unit/pending-ledger.spec.ts`（**新**）
  - ≥ 4 个测试：add 草稿生成 / update 草稿生成 / category 草稿生成 / 重复草稿幂等

**验收**：
- type-check 0 错
- 386 现有测试不破
- 新增 ≥ 18 测试（validators 10 + format 4 + pending 4）

---

### U2：云函数 ledger + 类目初始化 + 30 天清理（Cloud function）

**目标**：11 个 action + 类目初始化（在家庭创建时触发）+ 30 天清理定时任务。

**改动文件**：
- `cloudfunctions/ledger/index.js`（**新文件**）
  - 路由 11 个 action：`initCategories` / `addEntry` / `updateEntry` / `deleteEntry` / `restoreEntry` / `listEntries` / `getEntry` / `addCategory` / `updateCategory` / `removeCategory` / `getStats`
  - 每个 action 走"鉴权 → 参数校验 → 调域函数 → 返回"的统一模板
- `cloudfunctions/ledger/ledger-domain.js`（**新文件**）
  - 11 个域函数（pure function，参数 `(input, dependencies)`，便于单测）
  - `initCategories(input, deps)` — 写入 8 个固定类目；幂等（同 household 已存在则跳过）
  - `addEntry(input, deps)` — 创建账目；校验金额 / 时间 / 类目归属 / 付款人是家庭成员；写 `ledgerEntries`
  - `updateEntry(input, deps)` — 校验 `payerId === self`；只更新 `amountCents` / `categoryId` / `note` / `occurredAt` / `receiptMediaId`；`type` / `payerId` 不可改；`updatedAt += 1`
  - `deleteEntry(input, deps)` — 校验 `payerId === self` 或"30 天内任何成员可删"（R 决定：与 PRD 007 一致，**任何成员都能软删**）；写 `deletedAt` + `deletedBy`
  - `restoreEntry(input, deps)` — 任何成员都能恢复 30 天内的软删
  - `listEntries(input, deps)` — 按 household + 筛选（month / payerId / categoryIds）查 active；返回 summary 列表
  - `getEntry(input, deps)` — 详情；不存在或已软删抛 `LEDGER_NOT_FOUND`
  - `addCategory(input, deps)` — 写入自定义类目；校验 name / iconKey / colorKey 在预设池
  - `updateCategory(input, deps)` — 改 name / `isHiddenBy` 数组（加 / 删自己 key）
  - `removeCategory(input, deps)` — 校验无引用账目；硬删（**不是软删**）
  - `getStats(input, deps)` — 聚合按月 + 按类目 + 按成员的金额；返回 `{ monthExpenseCents, monthIncomeCents, netCents, byCategory: [...], byPayer: [...] }`
  - 错误码：`LEDGER_FORBIDDEN` / `LEDGER_NOT_FOUND` / `LEDGER_CATEGORY_IN_USE` / `LEDGER_AMOUNT_INVALID` / `LEDGER_TIME_INVALID` / `LEDGER_CATEGORY_NOT_FOUND` / `LEDGER_PAYER_NOT_MEMBER`
- `cloudfunctions/ledger/repository-data.js`（**新文件**）
  - `findActiveEntriesByHousehold(householdId, filter)` — 过滤 `deletedAt IS NULL`
  - `findDeletedEntriesByHousehold(householdId)` — 查已软删的（用于"已删除"区 + 30 天清理）
  - `findCategoryById(categoryId)` / `findCategoriesByHousehold(householdId, hiddenByUserKey)`
  - `addLedgerEntry(record)` / `updateLedgerEntry(id, updates)` / `softDeleteLedgerEntry(id, deletedBy)` / `hardDeleteLedgerEntry(id)` / `restoreLedgerEntry(id)`
  - `countEntriesByCategory(categoryId)` — 引用计数（用于 remove 校验）
- `cloudfunctions/ledger/preset-categories.js`（**新文件**）
  - 8 个固定类目的硬编码数组（key / name / iconKey / colorKey / sortOrder）
- `cloudfunctions/cleanup-deleted-ledger-entries/index.js`（**新云函数**）
  - 每日 03:00 跑；扫 `ledgerEntries` `deletedAt < now - 30d`；物理删除账目 + 删云存储 `receipts/{householdId}/{entryId}.jpg`
  - 记日志（云开发日志，不写 `ledgerEntries`）
- `cloudfunctions/cleanup-deleted-ledger-entries/package.json`（**新**）
- `cloudfunctions/cleanup-deleted-ledger-entries/config.json`（**新**）
- `cloudfunctions/household/household-domain.js`（**改**）
  - 在 `createHousehold` 流程末尾调 `initCategories`（**通过 deps 注入，避免直接 import ledger-domain**）
  - 或更简单：在 household 域函数里直接调 cloud function 内部 API（`cloud.callFunction` 不可走内联调用，需要直接调 ledger-domain 函数）
  - 决策：直接在 `household-domain.js` 里 import `initCategories` from `../ledger/ledger-domain.js`（云函数之间可以直接 require 复用代码）
- `tests/unit/ledger-domain.spec.ts`（**新**）
  - ≥ 12 个测试：
    - initCategories 首次写 8 条 / 重复调幂等
    - addEntry happy / 金额非法 / 时间未来 / 类目不属于该家庭 / 付款人不是成员
    - updateEntry 仅创建者可改 / 不可改 type / 不可改 payerId
    - deleteEntry 任一成员可软删 / 幂等（已删返回上次）
    - restoreEntry 任何成员可恢复
    - listEntries 按月 / 按付款人 / 按类目筛选
    - getEntry 已软删返回 LEDGER_NOT_FOUND
    - addCategory 自定义类目 / name 重复拒绝
    - updateCategory 隐藏 / 取消隐藏
    - removeCategory 引用计数 > 0 拒绝
    - getStats 支出 / 收入 / 净额 / 按类目 / 按成员
- `tests/unit/cleanup-deleted-ledger-entries.spec.ts`（**新**）
  - ≥ 3 个测试：扫到 30 天前的删 / 30 天内的不删 / 单条失败不影响其他条

**验收**：
- type-check 0 错
- 386 + 15 测试全过（domain 12 + cron 3）

---

### U3：前端 service + Pinia store（Frontend state）

**目标**：11 个 RPC 客户端 + ledger store（账目列表 / 类目 / 筛选 / 统计 / 软删管理）。

**改动文件**：
- `src/services/ledger-cloud.ts`（**新文件**）
  - `callLedgerAction<TReq, TRes>(action, input): Promise<TRes>` 包装（参考 task-cloud.ts 的 `call`）
  - 11 个高阶函数：`initLedgerCategoriesInCloud` / `addLedgerEntryInCloud` / `updateLedgerEntryInCloud` / `deleteLedgerEntryInCloud` / `restoreLedgerEntryInCloud` / `listLedgerEntriesInCloud` / `getLedgerEntryInCloud` / `addLedgerCategoryInCloud` / `updateLedgerCategoryInCloud` / `removeLedgerCategoryInCloud` / `getLedgerStatsInCloud`
  - 严格响应校验：`isLedgerEntry` / `isLedgerCategory` / `isLedgerStats` / `isLedgerDeletedResult`
  - 错误码 → 文案：`humaniseLedgerError(code): string`
- `src/store/modules/ledger.ts`（**新文件**）
  - state: `entries: LedgerEntrySummary[]` / `deletedEntries: LedgerEntrySummary[]` / `categories: LedgerCategory[]` / `currentFilter: LedgerFilter` / `stats: LedgerStats | null` / `phase: 'idle' | 'loading' | 'adding' | 'updating' | 'deleting' | 'restoring' | 'category-mutating'` / `errorMessage: string | null`
  - getters: `activeCategoriesForView` (过滤掉 `isHiddenBy` 含自己 key 的) / `categoriesMap` (id → category) / `monthEntries` (按 currentFilter 过滤) / `monthExpenseCents` / `monthIncomeCents` / `netCents`
  - actions:
    - `loadEntries(filter)` — 调 listEntries；成功覆盖 entries
    - `loadCategories()` — 调 listEntries 的关联调用；首次进入 ledger 包时必调
    - `addEntry(input)` — 写 pending add → 调 addEntryInCloud → 成功 prepend to entries → 重新算 stats → 清 pending
    - `updateEntry(id, updates)` — 写 pending update → 调 updateEntryInCloud → 成功 replace in entries → 重新算 stats → 清 pending
    - `deleteEntry(id)` — 写 pending delete → 调 deleteEntryInCloud → 成功移出 entries，加进 deletedEntries → 重新算 stats → 清 pending
    - `restoreEntry(id)` — 写 pending restore → 调 restoreEntryInCloud → 成功移回 entries → 重新算 stats → 清 pending
    - `addCategory(input)` / `updateCategory(id, updates)` / `removeCategory(id)` — 类目 CRUD；类目变更后 reloadEntries（不重算 stats，stats 按 entry 重算）
    - `loadStats(month)` — 调 getStats
    - `setFilter(patch)` — 纯本地；trigger 重算
    - `resetLedgerStoreForTesting()`
  - 单飞保护：`addInFlight: Set<string>` / `updateInFlight: Set<string>` / `deleteInFlight: Set<string>` / `categoryInFlight: Set<string>`（key = `identityKey + entryId`）
  - 双重凭证：add 用 `requestId + identityKey`；update / delete / restore 用 `operationToken + entryId`；类目用 `requestId + householdId`
  - 超时恢复：仿 taskStore，3 次 × 200ms 详情重查
- `src/types/ledger.ts` 已 U1 写好；这里只 consume
- `tests/unit/ledger-cloud.spec.ts`（**新**）
  - ≥ 8 个测试：11 个 RPC 函数的 mock + 严格响应校验 + 错误转换
- `tests/unit/ledger-store.spec.ts`（**新**）
  - ≥ 10 个测试：
    - loadEntries 覆盖 entries
    - addEntry 成功 prepend
    - updateEntry 替换 + 重算 stats
    - deleteEntry 移出 entries + 加 deletedEntries
    - restoreEntry 移回
    - addCategory prepend categories
    - removeCategory 引用计数 > 0 → 错误
    - setFilter 触发 monthEntries getter 重算
    - 单飞保护（同时两次 addEntry 只发一次请求）
    - resetLedgerStoreForTesting 清空

**验收**：
- type-check 0 错
- 386 + 18 测试全过（cloud 8 + store 10）

---

### U4：账本首页 + 列表 + 筛选 + 已删除区 + 首页入口卡（Page: home）

**目标**：账本首页（月度概览 + 筛选条 + 列表 + 记一笔 FAB）+ "已删除"区（30 天内可恢复）+ 首页"家庭账本"入口卡。

**改动文件**：
- `src/subpackages/ledger/ledger-home/index.vue`（**新**）
  - 顶部：月度概览卡（月支出 / 月收入 / 净支出 + 类目分布条）
  - 筛选条：成员（全部 / 我 / 对方）+ 月份切换 + 类目多选 chip
  - 列表：按日期分组（今天 / 昨天 / M月D日），每条用 `LedgerEntryItem` 组件
  - 浮动操作按钮 "记一笔"（右下角，点击 → 跳 `ledger-add/index`）
  - 底部"已删除 (N)" 可展开区（30 天内可恢复）
- `src/subpackages/ledger/ledger-home/ledger-home-view.ts`（**新**）
  - 纯函数视图描述器：`describeHomeActions()` / `describeEntryActions(entry, isSelf)` / `describeFilterOptions(currentMonth)`
  - 与 task 的 `task-detail-view.ts` 同模式
- `src/subpackages/ledger/components/LedgerEntryItem.vue`（**新**）
  - 接收 prop `entry: LedgerEntrySummary` + `isSelf: boolean` + `categoriesMap: Record<string, LedgerCategory>`
  - 渲染：付款人头像 + 类目名 + 备注 + 金额（红 / 绿）+ 凭证缩略图
  - 点击 → emit `tap` → 父级跳详情
- `src/subpackages/ledger/components/MemberFilter.vue`（**新**）
  - 接收 `members: HouseholdMember[]` + `currentValue: 'all' | string` + emit `change`
  - 用 `wd-tabs` 或 3 个 chip 切换
- `src/subpackages/ledger/components/CategoryFilterChips.vue`（**新**）
  - 接收 `categories: LedgerCategory[]` + `selectedIds: string[]` + emit `change`
  - 多选 chip（横向滚动）
- `src/subpackages/ledger/components/ReceiptThumb.vue`（**新**）
  - 接收 `mediaId: string` + `size: number`
  - 调 `wx.cloud.getTempFileURL` 拿临时 URL；缓存 5 分钟；显示缩略图
  - 点击 → 触发父级 `previewImage` 全屏查看
- `src/pages/index/index.vue`（**改**）
  - "家庭"+"事项"+"我的"三卡之间加"家庭账本"卡（参考已有 card 样式）
  - 入口卡显示本月支出 / 收入副标题（调 ledgerStore.loadStats(month)）
  - 复用 `home/HomeSummaryCard.vue` 模式
- `src/pages/index/index.json`（**改**）
  - `usingComponents` 加 `ReceiptThumb`（如需）
- `src/subpackages/ledger/ledger-home/components/RestorableEntryItem.vue`（**新**）
  - 接收 prop `entry: LedgerEntrySummary` + emit `restore`
  - 显示 "已删除 · N 天前可恢复" 灰态 + "恢复" 按钮
- `tests/unit/ledger-home-view.spec.ts`（**新**）
  - ≥ 6 个测试：描述器返回的字符串 / 列表按日期分组 / 类目 chip 选中状态 / 成员筛选状态
- `tests/unit/ledger-store.spec.ts`（**改**）— U3 已含 store 测试；这里加 2 个 view 测试
- `src/subpackages/ledger/ledger-home/index.json`（**新**）— subpackage 路由
- `src/pages.json`（**改**）— 注册 ledger subpackage 根

**验收**：
- type-check 0 错
- 386 + 8 测试全过
- 视觉检查（dev tools）：月度概览、筛选切换、列表、记一笔 FAB、已删除区

---

### U5：记一笔 + 凭证拍照 + 类目选择（Page: add）

**目标**："记一笔"页：金额 / 类目 / 付款人 / 备注 / 时间 / 凭证图（可选）+ 保存。

**改动文件**：
- `src/subpackages/ledger/ledger-add/index.vue`（**新**）
  - 顶部 tab：支出 / 收入
  - 金额输入（大字号；¥ 前缀；整数键盘；自动 ÷100 存分）
  - 类目选择（8 个固定 + 用户自定义 chip；点击选；点击"+ 添加"按钮 → 调 ledgerStore.addCategory → 选新增的）
  - 付款人选择（默认 = 自己；单成员家庭隐藏）
  - 备注（可选，0-100 字）
  - 发生时间（默认今天；可往前选 7/30 天；不可选未来）
  - 凭证图（可选；点空框触发 `uni.chooseImage`；选完预览缩略图 + 删除按钮）
  - 底部"保存"按钮（loading 状态）
  - 保存流程：调 ledgerStore.addEntry → 成功返回上一页 + 重新 loadEntries
  - 表单校验（金额必填 + 类目必选）
- `src/subpackages/ledger/ledger-add/ledger-add-view.ts`（**新**）
  - `describeAddActions(filter)` 返回 `{ canSave, saveLabel }` 等
  - `defaultAddDraft()` 返回初始草稿
- `src/subpackages/ledger/components/AmountInput.vue`（**新**）
  - 接收 `modelValue: number` (cents) + emit `update:modelValue`
  - 显示"¥12.34"形式；输入框接 `wd-input` 类型 `digit`（小数点）
  - 内部把"元"转分（×100 + round）；emit 分
- `src/subpackages/ledger/components/CategoryPicker.vue`（**新**）
  - 接收 `categories: LedgerCategory[]` + `selectedId: string | null` + emit `change` + `addCategory`
  - chip 形式；末尾"+ 添加"按钮触发添加（弹 input 弹窗）
- `src/subpackages/ledger/components/ReceiptUploader.vue`（**新**）
  - 接收 `modelValue: string | null` (mediaId) + emit `update:modelValue` + `localPath`
  - 触发 `uni.chooseImage({ count: 1, sizeType: ['compressed'] })`
  - 选完临时显示本地路径（`localPath`）；保存时再上传到云存储拿 mediaId
  - 上传进度显示（`wx.cloud.uploadFile` onProgressUpdate）
  - 上传失败重试按钮
- `src/utils/ledger-cloud-uploader.ts`（**新**）
  - `uploadReceipt(householdId, entryTempId, localPath): Promise<string>` — 调 `wx.cloud.uploadFile({ cloudPath: 'receipts/{householdId}/{entryTempId}.jpg' })`
  - 客户端预压缩（`uni.compressImage` 到 1080p + 80% 质量）
  - 错误转换
- `tests/unit/ledger-add-view.spec.ts`（**新**）
  - ≥ 6 个测试：草稿初始化 / 校验 / 切换支出 / 切换收入 / 类目选中 / 付款人切换
- `tests/unit/ledger-cloud-uploader.spec.ts`（**新**）
  - ≥ 3 个测试：上传 happy / 上传失败 / 客户端预压缩调用
- `src/subpackages/ledger/ledger-add/index.json`（**新**）

**验收**：
- type-check 0 错
- 386 + 9 测试全过
- 视觉检查：金额输入 / 类目切换 / 拍照选择 / 上传进度 / 保存 loading

---

### U6：详情 + 编辑 + 删除 + 恢复 + 类目管理（Pages: detail + category manager）

**目标**：账目详情页（查看 + 编辑 + 删除 + 凭证放大）+ 类目管理页（添加 / 隐藏 / 重命名 / 删除）。

**改动文件**：
- `src/subpackages/ledger/ledger-detail/index.vue`（**新**）
  - 顶部：类目 + 金额（大字号）
  - 中部：付款人头像 + 昵称 + 备注 + 发生时间 + 创建时间 + 最后修改时间 + 凭证图（点击放大）
  - 底部操作区（仅 `isSelf` 时显示）：
    - "编辑"按钮 → 跳 `ledger-add/index?mode=edit&entryId=xxx`（复用 U5 的 add 页）
    - "删除"按钮（plain danger 风格）→ 二次确认 → ledgerStore.deleteEntry → uni.navigateBack
- `src/subpackages/ledger/ledger-detail/ledger-detail-view.ts`（**新**）
  - `describeDetailActions(detail, isSelf)` 返回 `{ canEdit, canDelete, canRestore }`
  - `describeDeleteConfirmMessage(detail)` 返回 "「{note}」删除后无法在产品内恢复，30 天后系统清理。是否继续？"
- `src/subpackages/ledger/ledger-category-manager/index.vue`（**新**）
  - 顶部：8 个固定类目（不可改 name / 不可删，可"隐藏"）
  - 中部：用户自定义类目列表（可重命名 / 隐藏 / 删除）
  - 底部 "+ 添加类目" 按钮 → 弹 input + 图标 + 颜色选择
- `src/subpackages/ledger/ledger-category-manager/ledger-category-manager-view.ts`（**新**）
  - `describeCategoryActions(category, isCustom, refCount)` 返回 `{ canRename, canHide, canRemove }`
- `src/subpackages/ledger/ledger-add/index.vue`（**改**）— 复用 U5 支持 `mode=edit&entryId=xxx`，进入时 prefill 现有账目
- `src/subpackages/ledger/ledger-add/ledger-add-view.ts`（**改**）— 加 `loadEntryForEdit(entryId)` 函数
- `tests/unit/ledger-detail-view.spec.ts`（**新**）
  - ≥ 5 个测试：isSelf true/false / 描述器字段 / 删除确认文案
- `tests/unit/ledger-category-manager-view.spec.ts`（**新**）
  - ≥ 4 个测试：固定类目不可重命名 / 自定义无引用可删 / 自定义有引用不可删 / 隐藏按钮状态
- `src/subpackages/ledger/ledger-detail/index.json`（**新**）
- `src/subpackages/ledger/ledger-category-manager/index.json`（**新**）

**验收**：
- type-check 0 错
- 386 + 9 测试全过
- 视觉检查：详情页布局 / 编辑 prefill / 删除二次确认 / 类目管理各项操作

---

### U7：统计页 + 首页入口 + 资源 + 文档 + 部署（Stats + assets + docs + deployment）

**目标**：统计页（按月 / 按类目 / 按成员）+ 首页入口卡补全（统计副标题）+ 8 个类目图标资源 + 文档 + 双账号真机验证路径。

**改动文件**：
- `src/subpackages/ledger/ledger-stats/index.vue`（**新**）
  - 顶部：月份切换
  - 中部：饼图（按类目金额占比，纯 CSS / inline SVG 画）+ 柱状图（按成员 A / B 付了多少）
  - 底部：本月 vs 上月对比（金额 + 比例变化）
- `src/subpackages/ledger/ledger-stats/ledger-stats-view.ts`（**新**）
  - `computeCategoryShare(stats): { categoryId; cents; percent }[]`
  - `computePayerShare(stats): { payerId; cents; percent }[]`
  - `compareWithPreviousMonth(current, previous): { delta; percent }`
- `src/components/ledger/StatsPieChart.vue`（**新**）
  - 纯 inline SVG 画饼图（不用第三方库）
  - 接收 `slices: { label; cents; color }[]`
- `src/components/ledger/StatsBarChart.vue`（**新**）
  - 纯 CSS 柱状图
  - 接收 `bars: { label; cents; color }[]`
- `src/pages/index/home-view.ts`（**改**）
  - `describeHomeCards()` 加 "家庭账本" 卡的描述
  - `getHomeCards()` 加第 4 个 card object
- `src/pages/index/index.vue`（**改**）— 应用 home-view 的改动
- `src/static/ledger/categories/`（**新目录**）
  - 8 个类目图标 PNG（每 ≤ 8 KB；总 ≤ 60 KB；64×64 起步即可）
  - `dining.png` / `transport.png` / `home.png` / `entertain.png` / `medical.png` / `clothing.png` / `education.png` / `other.png`
  - 用 PowerShell + .NET System.Drawing 缩图（复用 `tmp/compress-static.ps1` 模式）
- `src/static/brand/visual-assets-map.json`（**新**）
  - 8 个类目的 `iconKey` / `colorKey` → 资源文件路径的映射
- `cloudfunctions/README.md`（**改**）
  - 加 `ledger` 云函数（11 个 action）的部署说明
  - 加 `cleanup-deleted-ledger-entries` 定时任务配置（每日 03:00）
  - 加 8 条新双账号验收路径（路径 23-30，沿用 19-22 风格）
- `cloudfunctions/cleanup-deleted-ledger-entries/README.md`（**新**）— 部署说明
- `README.md`（**改**）
  - 加 "PRD 008 家庭共同流水账" 模块段
  - 加 `ledger` + `cleanup-deleted-ledger-entries` 到云函数列表
  - 更新测试数 386 → 416
  - 加 "资源体积" 复检（新增 ledger 分包 ~40-60 KB + 类目图标 ~60 KB → 主包 + 子包总体增量 < 200 KB）
  - 路线图勾掉 "下一个模块" 加 "家庭共同流水账"
- `docs/prd/008-shared-ledger-prd.md`（**改**）
  - frontmatter `status: 草稿（待确认）` → `status: 已确认`
- `docs/prd/README.md`（**改**）
  - PRD 008 行 `草稿待确认` → `已确认`
- `docs/plans/2026-08-17-002-feat-shared-ledger-plan.md`（**新**）— 本文件
- `tests/unit/ledger-stats-view.spec.ts`（**新**）
  - ≥ 4 个测试：饼图切片计算 / 柱状图计算 / 月度对比 / 边界（空数组 / 全 0）
- `tests/unit/visual-assets-map.spec.ts`（**新**）
  - ≥ 2 个测试：8 个类目都有资源 / 文件存在

**验收**：
- type-check 0 错
- 386 + 6 测试全过
- `npm run build:mp-weixin` 成功；主包 ≤ 1.2 MB（优化后 601 KB + ledger 分包 + 资源）
- 双账号真机 16 条验证路径全过（详见 PRD 008 §"双账号真机验证清单"）

---

## 文件改动清单

```
docs/prd/008-shared-ledger-prd.md                              (新) 23 KB
docs/prd/README.md                                            (改) 状态更新
docs/plans/2026-08-17-002-feat-shared-ledger-plan.md           (新) 本文件
README.md                                                     (改) 模块 7 + 资源复检

cloudfunctions/ledger/index.js                                (新) 11 actions 路由
cloudfunctions/ledger/ledger-domain.js                        (新) 11 域函数
cloudfunctions/ledger/repository-data.js                      (新) 数据访问
cloudfunctions/ledger/preset-categories.js                    (新) 8 个固定类目
cloudfunctions/household/household-domain.js                  (改) 创建家庭时调 initCategories
cloudfunctions/cleanup-deleted-ledger-entries/index.js        (新) 30 天清理
cloudfunctions/cleanup-deleted-ledger-entries/package.json    (新)
cloudfunctions/cleanup-deleted-ledger-entries/config.json     (新)
cloudfunctions/cleanup-deleted-ledger-entries/README.md       (新)
cloudfunctions/README.md                                      (改) 部署说明 + 8 条路径

src/types/ledger.ts                                           (新) 11 + 枚举
src/utils/ledger-validators.ts                                (新) 4 个校验
src/utils/format.ts                                           (改) formatYuan + formatLedgerMonth
src/utils/pending-ledger.ts                                   (新) 幂等锁
src/utils/ledger-cloud-uploader.ts                            (新) 凭证图上传

src/services/ledger-cloud.ts                                  (新) 11 RPC + 校验 + 错误
src/store/modules/ledger.ts                                   (新) store + 单飞 + 重算

src/subpackages/ledger/ledger-home/{index.vue, index.json, ledger-home-view.ts}        (新) 首页
src/subpackages/ledger/ledger-home/components/RestorableEntryItem.vue                  (新)
src/subpackages/ledger/ledger-add/{index.vue, index.json, ledger-add-view.ts}          (新) 记一笔
src/subpackages/ledger/ledger-detail/{index.vue, index.json, ledger-detail-view.ts}    (新) 详情
src/subpackages/ledger/ledger-category-manager/{index.vue, index.json, view.ts}        (新) 类目管理
src/subpackages/ledger/ledger-stats/{index.vue, index.json, ledger-stats-view.ts}      (新) 统计
src/subpackages/ledger/components/LedgerEntryItem.vue                                  (新) 列表项
src/subpackages/ledger/components/MemberFilter.vue                                     (新) 成员筛选
src/subpackages/ledger/components/CategoryFilterChips.vue                              (新) 类目筛选
src/subpackages/ledger/components/CategoryPicker.vue                                   (新) 记一笔类目
src/subpackages/ledger/components/ReceiptUploader.vue                                  (新) 凭证上传
src/subpackages/ledger/components/ReceiptThumb.vue                                     (新) 凭证缩略图
src/subpackages/ledger/components/AmountInput.vue                                      (新) 金额输入

src/components/ledger/StatsPieChart.vue                                               (新) 饼图
src/components/ledger/StatsBarChart.vue                                               (新) 柱状图

src/pages/index/index.vue                                          (改) 加入口卡
src/pages/index/home-view.ts                                       (改) 入口卡描述
src/pages.json                                                     (改) 注册 ledger subpackage

src/static/ledger/categories/*.png                                 (新) 8 个类目图标 ≤ 60 KB
src/static/brand/visual-assets-map.json                            (新) iconKey 映射

tests/unit/ledger-validators.spec.ts                               (新) +10
tests/unit/format.spec.ts                                          (改) +4
tests/unit/pending-ledger.spec.ts                                  (新) +4
tests/unit/ledger-domain.spec.ts                                   (新) +12
tests/unit/cleanup-deleted-ledger-entries.spec.ts                  (新) +3
tests/unit/ledger-cloud.spec.ts                                    (新) +8
tests/unit/ledger-store.spec.ts                                    (新) +10
tests/unit/ledger-home-view.spec.ts                                (新) +6
tests/unit/ledger-add-view.spec.ts                                 (新) +6
tests/unit/ledger-cloud-uploader.spec.ts                           (新) +3
tests/unit/ledger-detail-view.spec.ts                              (新) +5
tests/unit/ledger-category-manager-view.spec.ts                    (新) +4
tests/unit/ledger-stats-view.spec.ts                               (新) +4
tests/unit/visual-assets-map.spec.ts                               (新) +2
```

## 测试覆盖

- U1：+18 tests (validators 10 + format 4 + pending 4)
- U2：+15 tests (domain 12 + cron 3)
- U3：+18 tests (cloud 8 + store 10)
- U4：+8 tests (view)
- U5：+9 tests (view 6 + uploader 3)
- U6：+9 tests (detail 5 + category 4)
- U7：+6 tests (stats 4 + assets 2)
- **总计：+83 tests，目标 469 tests** (386 + 83)

> 注：PRD 008 的"目标 ≥ 30 个用例"是 PRD 文档里的初估；细化到 plan 后实际是 83 个。**超出 PRD 估算是因为**：
> - 11 个 RPC 函数每个都加严格响应校验测试
> - 8 个类目 + 多重筛选状态空间更大
> - 凭证上传链路（chooseImage + compressImage + uploadFile）需要单独测

## 资源体积预估

| 新增 | 体积 |
| --- | --- |
| 8 个类目图标（每 ~7 KB） | ~56 KB |
| 凭证图（不在包内，云存储） | 0 KB |
| ledger 分包（4 个页面 + 7 个组件） | ~40-60 KB |
| `visual-assets-map.json` | < 1 KB |
| **总体增量** | **~100-120 KB** |
| **主包影响** | 仍是 601 KB（ledger 在子包内） |

主包不变，子包总 +120 KB。完全在安全范围。

## 风险与边界

- **风险 1**：凭证图云存储成本。**MVP 决策**（R 风险 1）= 不做配额限制，监控用量；后续如需加"每家庭 ≤ 500 张"或"≤ 200 MB"再加新 PRD。
- **风险 2**：OCR 诱惑。**已写进"不做清单 #5"**；用户拍完照仍要手填金额 / 类目 / 时间。
- **风险 3**：类目预设图标视觉统一。8 个图标按 `docs/brand/visual-standard.md` 色板对齐；自定义类目锁在预设池避免设计失控。
- **风险 4**：凭证图上传失败。**PRD 边界已定** = 失败可先保存账目（receiptMediaId = null），不阻塞；UI 提示稍后重试。
- **风险 5**：并发编辑。**MVP 不做 editVersion 乐观锁**（R 边缘场景）；last-write-wins；用户协调。
- **边界**：单成员家庭支持（只显示"我付的"，功能完整）。
- **边界**：新成员加入看到全部历史。
- **边界**：类目删除仅当无引用账目。
- **不在范围**：AA / 分摊 / 结算 / 已转 / 转账 / 预算 / 定期账 / OCR / 多币种 / 多人家庭 / 事项联动 / 私密账目 / 乐观锁 / Webhook / 推送 / 导出 / 搜索 / 年报（PRD 末尾"不在 PRD 范围内的明确扩展点"已逐条列）

## 实施顺序

1. **U1**（数据契约 + 工具）— 立即可验证：type-check + Jest
2. **U2**（云函数 + 类目初始化 + 30 天清理）— 立即可验证：Jest 单元测试 + type-check；需手动部署云函数才能真机验证
3. **U3**（service + store）— 立即可验证：Jest
4. **U4**（账本首页 + 列表 + 筛选 + 已删除区 + 首页入口卡）— 视觉检查（dev tools）
5. **U5**（记一笔 + 凭证拍照）— 视觉检查 + 拍照权限真机测试
6. **U6**（详情 + 编辑 + 删除 + 恢复 + 类目管理）— 视觉检查 + 删除二次确认
7. **U7**（统计 + 资源 + 文档 + 部署）— 需要手动部署云函数 + 定时任务 + 16 条真机路径

## 不在 Plan 范围内

按 PRD 008 §"不在 PRD 范围内的明确扩展点"：
- PRD 008.5：AA 记账
- PRD 008.6：凭证 OCR
- PRD 008.7：定期账 + 提醒
- PRD 008.8：多人家庭（3+ 成员）
- PRD 008.9：导出 / 备份
- PRD 008.10：年度报告

每一个都是独立决策；本 plan 故意不预判。
