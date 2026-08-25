---
title: 账本功能 5 项优化 - Plan
type: feat
date: 2026-08-24
topic: ledger-improvements
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-brainstorm
execution: code
product_contract_preservation: Product Contract unchanged — 22 R-IDs (R1-R22), 5 Key Decisions, 4 F-IDs, 15 AE-IDs preserved from the requirements-only version of this same file. Planning-time additions (Planning Contract, Implementation Units, Verification Contract, Definition of Done) are appended below; no requirement meaning was rewritten.
---

## Goal Capsule

- **Objective:** 把 PRD 008 上线后被频繁反映的 5 项账本体验缺陷合一次交付——付款人筛选扩成"人 × 类型"双维度、月份切换旁加具体日期入口、首页加一张当月支出小卡、收入账目文案改"入账"、头部统计跟筛选条件实时重算。
- **Product authority:** 这 5 项都属于 PRD 008（家庭共同流水账）范围内的优化，延续 PRD 008 的"双方都看全部"、"双成员硬约束"、"只展示不 AA"等核心规则；PRD 008 的 defer 清单（AA / 分摊 / 预算 / 转账独立类型等）仍不在本计划范围。
- **Open blockers:** 无。`### Outstanding Questions` 标记为 `Deferred to Planning` 的项在 plan-write 阶段已落地为 KTD 或 Implementation Unit 的技术选择。

---

## Product Contract

### Summary

把账本筛选从"全/我付的"两 chip 扩成"人 × 类型"双维度、让用户能选具体某一天、让首页一眼看到本月支出、把收入账目的"付款"文案改成"入账"、让头部支出/收入/净额数字跟筛选条件实时同步。一次合并交付，沿用 PRD 008 的现有模型和数据流。

### Problem Frame

PRD 008 上线后用户集中反馈了五处体验缺陷：

1. 列表筛选只有"全部 / 我付的"，想看对方付的账要手动翻——收入账目也筛不掉。
2. 收入账目在列表和详情页都叫"由 X 付款"，读起来别扭。
3. 列表只能按月切，想看"昨天买菜花了多少"得切到当月再翻。
4. 首页跟账本没有任何关联，要看本月支出得先切到账本 tab。
5. 头部"本月支出 / 收入 / 净额"永远是全员数据，跟当前筛选无关——切了"我付的"后数字不变。

这五处都属于"展现层没跟上数据层"——数据已经按成员 / 类型 / 日期存在云端，缺的是把维度暴露给用户和让头部同步。

### Key Decisions

- **双维度 chip 形态**（session-settled: user-directed — chosen over 4 chip 独立 / 3 chip 不分收入支出：双维度可以任意组合筛"我 + 收入"等场景，4 chip 一次只能选一个限制太多）。Governs R1, R2, R5, R20.
- **日历图标挂在月份切换旁**（session-settled: user-directed — chosen over 独立日期行 / 整个替换月份切换：最小破坏现有 UI，选中具体日期后月份切换按钮再变形为"上一天 / 下一天"）。Governs R6, R7, R8, R10.
- **首页月支出用独立小卡**（session-settled: user-directed — chosen over 合并到 HomeSummaryCard / hero 下面一行 / 不展示数字：独立卡能同时承载"数字"和"跳账本"两个语义，不挤占 hero 文案也不跟家庭资料混在一起）。Governs R11, R12, R13, R14, R15.
- **文案"由 X 入账"**（session-settled: user-directed — chosen over 更简短的"X 付 / X 收" / 加图标 / 完整句：保留"由 X 付款"原句式，只在收入时换动词）。Governs R16, R17, R18, R19.
- **头部 stats 跟筛选条件实时重算**（session-settled: user-directed — chosen over 保持写死不跟筛选走：云端 getStats 接受 payerMode / type / date 维度参数，store 在筛选变化时同时打 entries 和 stats）。Governs R20, R21, R22.

### Requirements

#### 付款人筛选（双维度）

- R1. 账本首页筛选条展示两行 chip：第一行选人（全部 / 我 / 对方），第二行选类型（全部 / 支出 / 收入）。
- R2. 两行 chip 任意组合生效（AND 关系），可筛出"我 + 支出"、"对方 + 收入"、"全部 + 收入"等组合。
- R3. 类目筛选（多选 chip，OR 关系）跟双维度筛选是 AND 关系——选了"我 + 餐饮 + 交通"等于"我付的、类目在 {餐饮, 交通} 里的账"。
- R4. 单成员家庭（只有自己）不显示"对方"选项；第一行只显示"全部"和"我"。
- R5. 云端 listEntries / getStats 接收新的 payerMode（"all" / "me" / "other"）和 typeFilter（"all" / "expense" / "income"）维度；旧请求（仅 payerMode 不带 typeFilter）保持当前行为，向后兼容。

#### 具体日期筛选

- R6. 账本首页月份切换行（`‹ 上月 / 2026 年 8 月 / 下月 ›`）的右侧加一个日历图标按钮；点击弹日历组件让用户选某一天。
- R7. 选中某一天后，月份切换行的左右按钮文案变成"上一天 / 下一天"，中间显示"2026 年 8 月 15 日"完整日期；按钮功能切换为按日移动。
- R8. 选中某一天后，日历图标变"清除"按钮；点击清除回到按月查看模式（恢复月份切换）。
- R9. 选中某一天后，列表和头部统计都只看那一天；不再应用月份维度。
- R10. 选中某一天时，"下一天"按钮在当天时禁用（避免切到未来）；按月模式下"下月"按钮在当月时禁用——行为跟当前一致。

#### 首页当月支出

- R11. 首页 `pages/index/index.vue` 在 `HomeSummaryCard` 下面加一张小卡，灰底圆角，跟"看看我们做完的事"链接视觉同款。
- R12. 小卡标题展示"本月支出 ¥X"（X 取自 `ledgerStore.stats.monthExpenseCents`，按全家庭统计，跟当前用户无关）；副标题展示"去看看账本"。
- R13. 小卡可点击，调用 `uni.switchTab` 或 `uni.reLaunch` 跳转到 `/pages/ledger/index`。
- R14. 无家庭时不显示小卡（跟现有 `v-if="household"` 行为一致）。
- R15. ledger store 还在加载时（`phase === 'loading'`）小卡显示"正在加载账本统计"占位；加载失败显示"暂时无法读取"+"重试"按钮。

#### 文案修复

- R16. 账目列表项（`LedgerEntryItem.vue`）的付款人字段：支出展示"由 X 付款"；收入展示"由 X 入账"；X 用 `entry.payer.nickname`，缺省为"成员"。
- R17. 账目详情页（`ledger-detail/index.vue`）的付款人行：支出展示"由 X 付款"；收入展示"由 X 入账"。
- R18. 成员已离开的灰态保留：支出"由 X 付款（已离开）" / 收入"由 X 入账（已离开）"。
- R19. 文案按 `entry.type` 判断（`expense` / `income`），不分"代付 / 自付"等其他维度。

#### 头部统计跟随筛选

- R20. 当筛选条件（payerMode / typeFilter / date / selectedCategoryIds 任一）变化时，`ledgerStore` 同步调用 `loadStats()` 重新拉统计。
- R21. 头部"支出 / 收入 / 净额"三个数字展示按当前 `stats` 计算，**等于**当前筛选下的统计；切筛选时数字立即更新。
- R22. 类目 chip 变化时同样触发 stats 重拉（不只重拉 entries）——类目筛选影响支出分布，头部"支出"数字应该等于"类目筛选下"的支出总额。

### Key Flows

- F1. 切换付款人筛选
  - **Trigger:** 用户在账本首页点"对方"或"收入"chip。
  - **Actors:** 账本用户。
  - **Steps:** 用户点 chip → store 更新 `payerMode` / `typeFilter` → 触发 listEntries + loadStats 并发 → 列表和头部数字同时刷新。
  - **Outcome:** 列表和头部数字按新筛选展示。
  - **Covers:** R1, R2, R3, R5, R20, R21, R22.

- F2. 选具体某一天
  - **Trigger:** 用户在账本首页点日历图标。
  - **Actors:** 账本用户。
  - **Steps:** 点日历图标 → 弹日历组件 → 选某一天 → store 更新 `selectedDate` → 列表 + stats 按那一天查询；月份切换变形为"上一天 / 下一天"。
  - **Outcome:** 列表只显示那天的账目；头部数字为那天的支出/收入/净额。
  - **Covers:** R6, R7, R8, R9, R20, R21.

- F3. 清除具体日期回到按月
  - **Trigger:** 用户在已选日期状态下点日历的"清除"按钮。
  - **Actors:** 账本用户。
  - **Steps:** 点清除 → store 清空 `selectedDate` → 列表 + stats 按当前月份查询；月份切换恢复。
  - **Outcome:** 回到按月查看模式。
  - **Covers:** R8.

- F4. 从首页跳账本
  - **Trigger:** 用户在首页点"本月支出"小卡。
  - **Actors:** 家庭成员。
  - **Steps:** 点小卡 → 跳 `/pages/ledger/index` → 账本页显示当月数据。
  - **Outcome:** 用户进入账本 tab。
  - **Covers:** R11, R12, R13.

### Acceptance Examples

- AE1. 双成员家庭在账本首页点"对方 + 支出"——列表只显示对方付的支出账目；头部支出 = 对方付的支出总额。
  - **Covers:** R1, R2, R5, R20, R21.
- AE2. 双成员家庭在账本首页点"我 + 收入"——列表只显示我收到的收入账目；头部收入 = 我收到的收入总额。
  - **Covers:** R1, R2, R5, R20, R21.
- AE3. 单成员家庭（只有自己）在账本首页——第一行 chip 只显示"全部"和"我"，没有"对方"。
  - **Covers:** R4.
- AE4. 在账本首页点日历图标，选 8 月 15 号——列表只显示 8 月 15 号的所有账目；中间显示"2026 年 8 月 15 日"；左右按钮变成"上一天 / 下一天"。
  - **Covers:** R6, R7, R9.
- AE5. 在已选 8 月 15 号状态下点日历的"清除"——回到按月查看模式，中间显示"2026 年 8 月"，左右按钮恢复"上月 / 下月"。
  - **Covers:** R8.
- AE6. 选了 8 月 15 号——头部"支出 ¥X"等于那天所有账目的支出总额（跟当前月份/全部成员无关）。
  - **Covers:** R9, R20, R21.
- AE7. 双成员家庭选"我 + 支出"——头部"支出"等于我付的所有支出账目总额；切到"全部 + 支出"头部数字立即跳到全员支出总额。
  - **Covers:** R1, R2, R5, R20, R21.
- AE8. 首页"本月支出"小卡显示的数字 = ledger store 的 `stats.monthExpenseCents`（按全家庭、当前月份统计，不受首页任何筛选影响）。
  - **Covers:** R12.
- AE9. 一笔 type=income 的账目在列表项上展示"由 X 入账"。
  - **Covers:** R16, R19.
- AE10. 一笔 type=expense 的账目在列表项上展示"由 X 付款"。
  - **Covers:** R16, R19.
- AE11. 账目详情页的"付款人"行按 type 展示"由 X 付款" / "由 X 入账"。
  - **Covers:** R17.
- AE12. 选了 8 月 15 号——"下一天"按钮在 8 月 15 日当天禁用。
  - **Covers:** R10.
- AE13. 选了 8 月 15 号——点"上一天"切到 8 月 14 号，列表和头部数字同步更新。
  - **Covers:** R7, R9, R20, R21.
- AE14. 类目 chip 勾选"餐饮 + 交通"——头部"支出"数字等于这两个类目下的支出总额（其他类目不计入）。
  - **Covers:** R3, R22.
- AE15. 成员已离开（`payer.hasLeft = true`）的收入账目展示"由 X 入账（已离开）"。
  - **Covers:** R18.

### Scope Boundaries

- **Deferred for later:**
  - AA / 分摊 / 结算（PRD 008 §"不做清单"）
  - 转账独立类型（PRD 008 §R7）
  - 预算 / 提醒（PRD 009 范围）
  - 定期账、OCR、多币种（PRD 008 §"不做清单"）
  - 账目搜索、推送通知
  - 多人家庭（>2 成员）——本计划仍然只覆盖双成员（PRD 008 硬约束）
- **Outside this product's identity:**
  - 不联动事项模块（"买菜事项完成 → 自动生成账目"）——PRD 008 §R11 明确 defer
  - 不开放类目自定义图标 / 颜色（PRD 008 §"不做清单"）
  - 不做账目备注脱敏 / 加密
  - 不做乐观锁（last-write-wins 仍生效）
  - 不改"双方都看全部"语义——筛选只影响"我自己看到的列表"和"头部数字"，双方打开账本还是看到所有账目（只是不同维度的视图）

### Dependencies / Assumptions

- 依赖 PRD 008 现有云函数 `listEntries` / `getStats` 扩展为支持 typeFilter 和 date 维度；扩展保持向后兼容。
- 依赖 Wot UI `wd-calendar` 组件（@wot-ui/ui v2.3.2 已提供 `type='date'` 单日选择模式，v-model 用 13 位时间戳）；`max-date` 锁今天 23:59:59。
- 假设 ledger store 的 `setPayerMode` / `setSelectedCategoryIds` 等 action 已存在；本计划扩展它们触发 stats 重拉，行为是叠加而非替换。
- 假设 PRD 008 的"双方都看全部"语义保持不变——筛选只影响当前用户的视图，不影响双方可见性。
- 假设首页"已完成事项"链接（`home-completed-link`）的样式和交互可复用——本计划的小卡按相同模式实现。

### Outstanding Questions

- **Resolve Before Planning:** 无。
- **Deferred to Planning:** 无（plan-write 阶段已落地为 KTD 或 Implementation Unit 的技术选择）。

### Sources / Research

- `docs/prd/008-shared-ledger-prd.md`——PRD 008 原始定义，确认"双方都看全部"、"双成员硬约束"等核心规则未在本计划中改动
- `src/pages/ledger/index.vue`——账本首页当前实现，承载本计划 4 项改动（双维度筛选、日期入口、头部统计、文案）
- `src/components/ledger/MemberFilter.vue`——当前只有 `all | me` 两种值；本计划扩展为两行 chip
- `src/components/ledger/LedgerEntryItem.vue:42`——"由 X 付款"写死，不分 type；本计划 R16-R19 修复
- `src/pages/ledger/ledger-home-view.ts`——`describePayerFilterOptions` 和 `describeEntryAmount` 等描述器，本计划扩展
- `src/store/modules/ledger.ts`——store 当前 `payerMode: 'all' | 'me'`；本计划扩展类型 + 触发 loadStats
- `cloudfunctions/ledger/ledger-domain.js:563`——`getStats` 当前写死 `payerMode: 'all'`；本计划 R5 让它接收 payerMode + typeFilter
- `src/subpackages/ledger/ledger-add/index.vue:73`——记账页"付款人"字段当前叫"付款人"；本计划不在记账页改文案（仅列表/详情）
- `node_modules/@wot-design-uni` (v2.3.2)——`wd-calendar` 组件可用，`type='date'` 单日选择 + 13 位时间戳 v-model + `max-date` 限制

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Wot UI `wd-calendar` 用于日期入口**（session-settled: user-approved — recommended default; user confirmed）。用 `type='date'` 单日选择，`v-model` 绑定 13 位时间戳（midnight of the day）；`min-date` 锁 `2020-01-01 00:00:00`，`max-date` 锁"今天 23:59:59"避免选未来。Governs R6, R7, R10.
- KTD2. **listEntries / getStats 的 `month` 字段接受 `'all' | 'yyyy-MM' | 'yyyy-MM-dd'` 三种值**。`'all'` 保持当前"全部时间"语义（向后兼容）；`yyyy-MM` 按月查；`yyyy-MM-dd` 按日查（区间为 `[dayStart, dayStart+24h)`）；其他字符串 → 拒绝。Governs R5, R9, R20.
- KTD3. **getStats 200ms 防抖（前端）**（session-settled: user-approved — recommended default; user confirmed）。4 个状态（payer / type / date / selectedMonth）+ selectedCategoryIds 数组任一变化触发 debounced loadStats，200ms 阈值；列表的 `loadEntries` 仍走原有单飞保护。Governs R20, R22.
- KTD4. **store 新增 `typeFilter: 'all' | 'expense' | 'income'` 和 `selectedDate: string` 两个 state 字段**。`typeFilter` 默认 `'all'`，跟 `payerMode` 平行；`selectedDate` 默认 `''`（= 按月，KTD2 兼容），非空时为 `yyyy-MM-dd`。**`selectedDate` 非空时 listEntries 不分页**（pageSize=100，足够一天数据量；hasMore 始终 false），按月模式保留原 20 条/页分页。Governs R1, R2, R5, R6, R9, R20.
- KTD5. **筛选条拆成两个 chip 组件**：`MemberFilter` 升级为"按人筛"（保留当前 all/me/other 三选项），新增 `TypeFilter`（all/expense/income 三选项）。两组件独立 emit，账本首页分别 `v-model` 绑定。Governs R1, R2, R4.
- KTD6. **具体日期模式下"已删除"区折叠**（session-settled: user-approved — recommended default; user confirmed）。store 暴露 `selectedDate` getter 即可让视图层判断；切回按月时"已删除"区恢复显示（保留现有 30 天可恢复列表）。Governs R8, R9.
- KTD7. **描述器 `describePayerLine(type, payer)` 集中文案逻辑**。新增纯函数，输入 `LedgerEntryType` + `LedgerPayerDisplay`，输出 `由 X 付款` / `由 X 入账` / `由 X 付款（已离开）` / `由 X 入账（已离开）`。`LedgerEntryItem` 和 `ledger-detail-view` 都调用同一个函数，避免文案漂移。Governs R16, R17, R18, R19.

### Assumptions

- A1. "下一天"按钮在 8 月 31 → 9 月 1 / 12 月 31 → 1 月 1 这种月/年初切换由 `shiftDay` 工具函数处理（参照 `shiftMonth` 实现）；边界日期用 `Date` 的 setDate + 1 计算本地时间。
- A2. 首页小卡从 `ledgerStore.stats.monthExpenseCents` 读取，跟家庭成员无关；双成员家庭里 A 和 B 看到一样的数字（跟"双方都看全部"对齐），不像事项一样"我做的"。
- A3. 防抖函数不引入 `lodash`，用项目内已有的简单 `setTimeout` + cancellation 实现（参照 task store 的模式；如果不存在则新增 `src/utils/debounce.ts`）。
- A4. 选具体日期时 `selectedCategoryIds` 仍生效（AND 关系）；类目筛选不影响 date 维度的语义。
- A5. `wd-calendar` 在弹窗关闭时（`visible=false` 或点遮罩）不重置 `modelValue`；选完日期不点确定按钮也能保留值（默认行为），本计划不依赖 `beforeConfirm`。
- A6. 云端 `findEntriesByHousehold` 已支持按月查询；扩展 `month` 参数为 `yyyy-MM-dd` 时复用同一套 query 逻辑，差异只在 `occurredAt` 区间是 `[dayStart, dayStart+24h)` 而不是 `[monthStart, monthEnd]`。

### Sequencing

- U1（类型 + store 基础）必须先做，U2/U3/U4 都依赖它的 state 扩展
- U5（首页小卡）独立，可并行
- U6（文案修复）独立，可并行
- U7（云端扩展）独立，但 R9/AE4/AE6 端到端验证要在 U7 部署后
- U8（测试 + 验证）放最后，覆盖前 7 个 unit

---

## Implementation Units

### Unit Index

| U-ID | Title | Files touched | Depends on |
|---|---|---|---|
| U1 | 扩展 store 状态与 view 描述器 | `src/types/ledger.ts`, `src/store/modules/ledger.ts`, `src/utils/debounce.ts` (new), `src/pages/ledger/ledger-home-view.ts`, `src/services/ledger-cloud.ts` | — |
| U2 | MemberFilter + TypeFilter 双行 chip 视图 | `src/components/ledger/MemberFilter.vue`, `src/components/ledger/TypeFilter.vue` (new), `src/pages/ledger/index.vue` | U1 |
| U3 | 日历入口 + 月/日模式切换 | `src/components/ledger/DatePickerButton.vue` (new), `src/pages/ledger/index.vue`, `src/pages/ledger/ledger-home-view.ts` | U1 |
| U4 | 头部 stats 防抖重算接线 | `src/store/modules/ledger.ts`, `src/pages/ledger/index.vue` | U1 |
| U5 | 首页本月支出小卡 | `src/pages/index/index.vue`, `src/components/home/MonthlyExpenseCard.vue` (new) | U1 |
| U6 | 文案修复（列表 + 详情共用描述器） | `src/pages/ledger/ledger-home-view.ts`, `src/components/ledger/LedgerEntryItem.vue`, `src/subpackages/ledger/ledger-detail/ledger-detail-view.ts`, `src/subpackages/ledger/ledger-detail/index.vue` | U1 |
| U7 | 云端 listEntries / getStats 扩展 | `cloudfunctions/ledger/ledger-domain.js`, `cloudfunctions/ledger/repository-data.js`, `src/services/ledger-cloud.ts` (consumer type) | U1 |
| U8 | 单元测试 + 双账号端到端验证 | `tests/unit/ledger-home-view.spec.ts`, `tests/unit/ledger-store.spec.ts`, `tests/unit/ledger-domain.spec.ts` (云端), `tests/unit/ledger-stats-view.spec.ts` | U1-U7 |

### U1. 扩展 store 状态与 view 描述器

- **Goal:** 给 store / types / 描述器加 `typeFilter` / `selectedDate` / 描述器扩展（`describePayerLine` / `shiftDay` / `describeTypeFilterOptions`）；为后续 4 个 UI unit 铺好底层。
- **Requirements:** R1 (state), R5 (type 字段), R6 (selectedDate 字段), R9 (date 区间语义), R20 (stats 触发), R22 (类目 chip 触发), R16 (describePayerLine)
- **Dependencies:** —
- **Files:**
  - `src/types/ledger.ts`——`LedgerFilter` 新增 `typeFilter` / `date` 字段；`ListLedgerEntriesRequest` 同步
  - `src/store/modules/ledger.ts`——`LedgerStateShape` 新增 `typeFilter: 'all' | 'expense' | 'income'` 和 `selectedDate: string`；新增 `setTypeFilter` / `setSelectedDate` actions；`loadStats` 调用点扩展为接收 `typeFilter` + `date`
  - `src/utils/debounce.ts`（新文件）——200ms debounce + cancel，纯函数
  - `src/pages/ledger/ledger-home-view.ts`——新增 `describePayerLine(type, payer)`；新增 `describeTypeFilterOptions()`；新增 `shiftDay(date, delta)`；扩展 `describeMonthLabel` 支持 `yyyy-MM-dd` 输入
  - `src/services/ledger-cloud.ts`——`ListLedgerEntriesRequest` / `GetLedgerStatsRequest` 类型字段对齐 `types/ledger.ts`
- **Approach:** 1) 在 `types/ledger.ts` 改 `LedgerFilter` 接口，新增 `typeFilter` 字段（默认 `'all'`）和 `date` 字段（可选，yyyy-MM-dd 字符串）；同时改 `ListLedgerEntriesRequest` 和 `GetLedgerStatsRequest` 的 `month` 字段为 `string`（允许 `yyyy-MM-dd`）。2) `ledger.ts` store 在 `initialState` 加 `typeFilter: 'all'` 和 `selectedDate: ''`；`setPayerMode` 旁加 `setTypeFilter` 和 `setSelectedDate` 两个 actions（纯 set state）；`loadStats` 接 `(month, typeFilter, date)` 三个参数；`loadEntries` 接 `(month, payerMode, typeFilter, date, categoryIds, ...)` 同步；3) `debounce.ts` 实现 `debounce<T>(fn, ms)` 和 `debounced.cancel()`；4) `ledger-home-view.ts` 三个新描述器；`describeMonthLabel` 接受 `yyyy-MM-dd` 时输出 `2026 年 8 月 15 日`。**Unit-local content only:** 引用 R/KTD 不要复述规则。
- **Patterns to follow:** `setPayerMode` 已有的纯 state set 模式；`describePayerFilterOptions` 已有的 chip options 描述器模式；`shiftMonth` 已有的日期工具函数模式。
- **Test scenarios:**
  - **Happy path:** `describeTypeFilterOptions()` 返回 3 个 chip（全部 / 支出 / 收入）；`describePayerLine('expense', { hasLeft: false, ... })` 返回 `由 X 付款`；`describePayerLine('income', { hasLeft: false, ... })` 返回 `由 X 入账`；`describePayerLine('expense', { hasLeft: true, ... })` 返回 `由 X 付款（已离开）`；`shiftDay('2026-08-15', 1) === '2026-08-16'`；`shiftDay('2026-08-31', 1) === '2026-09-01'`；`shiftDay('2026-12-31', 1) === '2027-01-01'`；`describeMonthLabel('2026-08-15') === '2026 年 8 月 15 日'`。
  - **Edge cases:** `describePayerLine('expense', { hasLeft: false, nickname: '' })` 退化为 `由 成员 付款`；`shiftDay('invalid', 1)` 返回 `''`。
  - **Error / failure paths:** 无（纯函数）。
  - **Store:** `setTypeFilter('expense')` 后 `store.typeFilter === 'expense'`；`setSelectedDate('2026-08-15')` 后 `store.selectedDate === '2026-08-15'`；`debounce(fn, 200)` 200ms 内多次调用只触发一次；`debounced.cancel()` 取消未触发的回调。
- **Verification:** `npm run test:unit` 通过；新描述器在 `tests/unit/ledger-home-view.spec.ts` 至少加 6 个 case。

### U2. MemberFilter + TypeFilter 双行 chip 视图

- **Goal:** 把账本首页筛选条从单行升级为"按人 + 按类型"两行 chip，AND 关系。
- **Requirements:** R1, R2, R3, R4
- **Dependencies:** U1
- **Files:**
  - `src/components/ledger/MemberFilter.vue`——`PayerFilter` 类型扩展为 `'all' | 'me' | 'other'`；选项从 2 个改为 3 个（加"对方"）；`selfMemberKey` prop 用于判断当前用户 key
  - `src/components/ledger/TypeFilter.vue`（新文件）——`TypeFilter` 组件，3 个 chip（全部 / 支出 / 收入），跟 `MemberFilter` 视觉同款
  - `src/pages/ledger/index.vue`——筛选条拆两行；`<MemberFilter v-model="payerMode" :options="payerOptions" :self-member-key="selfMemberKey" :member-count="memberCount" />` + `<TypeFilter v-model="typeFilter" :options="typeOptions" />`
- **Approach:** 1) `MemberFilter` 接收 `selfMemberKey` 和 `memberCount` 两个 prop，单成员时只渲染"全部"和"我"两个 chip；双成员时三个 chip 全显。2) `TypeFilter` 复用 `MemberFilter` 的视觉骨架（chip + active 态 + 圆角），但 chip 内容是支出/收入。3) 账本首页筛选条第一行 `<MemberFilter>` 第二行 `<TypeFilter>`，中间间隔按现有 18rpx gap。
- **Patterns to follow:** `MemberFilter` 现有的 chip 视觉 + 状态管理；`CategoryFilterChips` 的多选 chip 模式（视觉参考）；Wot UI 不用，自己写。
- **Test scenarios:**（项目 jest + ts-jest 无 vue test utils / 快照配置，组件渲染走**手测 + e2e**，不写 jest component test）
  - **手测：** 双成员时 `MemberFilter` 渲染 3 个 chip；单成员时只渲染 2 个 chip（"全部"和"我"，没有"对方"）；`TypeFilter` 始终渲染 3 个 chip。
  - **手测：** 点"对方"chip 后 emit `'update:modelValue'` 携带 `'other'`；点"全部"chip 携带 `'all'`；`TypeFilter` 点"收入"chip 携带 `'income'`。
  - **手测：** 当前 `modelValue === 'me'` 时"我"chip 加 `--active` 样式类。
- **Verification:** `npm run test:unit` 通过；`tests/unit/ledger-home-view.spec.ts` 更新现有 `describePayerFilterOptions` 测试（"returns 2 options" 改为 "returns 3 options including 对方"）；手动跑 `npm run dev:custom` 在双成员/单成员家庭切一次。

### U3. 日历入口 + 月/日模式切换

- **Goal:** 在月份切换旁加日历图标按钮，选中具体日期后月份切换变形为"上一天/下一天"；清除按钮回到按月。
- **Requirements:** R6, R7, R8, R10
- **Dependencies:** U1
- **Files:**
  - `src/components/ledger/DatePickerButton.vue`（新文件）——封装 Wot UI `wd-calendar` + visible 状态；emit `update:date` (yyyy-MM-dd) / `clear`
  - `src/pages/ledger/index.vue`——月份切换行：未选日期时显示"上月 / 月份 / 下月 / 日历图标"；已选日期时显示"上一天 / 日期 / 下一天 / 清除"；点日历图标 → 弹 `DatePickerButton` 弹窗
  - `src/pages/ledger/ledger-home-view.ts`——`describeMonthLabel` 接受 `yyyy-MM-dd` 输出 `2026 年 8 月 15 日`（U1 已加）
- **Approach:** 1) `DatePickerButton` 用 `wd-calendar` `type='date'`，`v-model` 是 13 位时间戳（midnight of selected day），`min-date` 和 `max-date` 都从父组件传入（默认 min=2020-01-01，max=今天 23:59:59）；点"确定"或关闭弹窗都 emit `update:date`；另有一个"清除"按钮（仅当 props.date 非空时显示）emit `clear`。2) 账本首页的 `monthLabel` 改为 `selectedDate ? describeMonthLabel(selectedDate) : describeMonthLabel(currentMonth)`；`onShiftMonth` 改为根据 `selectedDate` 走 `shiftDay` 或 `shiftMonth`；`canGoNextMonth` 改为 `canGoNext`，判断逻辑：按月模式下是 `currentMonth < todayMonth`，按日模式下是 `selectedDate < today`。3) **已删除区在 `selectedDate !== ''` 时用 `v-if="!selectedDate"` 隐藏**（KTD6 折叠）；切回按月模式时恢复显示（保留现有 30 天可恢复列表）。
- **Patterns to follow:** 现有的 `onShiftMonth` 月份切换；Wot UI `wd-calendar` 用法；ledger 弹窗交互（参考 ledger-add 的 `showCategoryDialog`）。
- **Test scenarios:**（项目 jest + ts-jest 无 vue test utils / 快照配置，组件渲染走**手测 + e2e**，不写 jest component test）
  - **手测：** `DatePickerButton` 渲染日历图标按钮；点按钮后 `wd-calendar` 的 `visible` 变 true；选完日期 emit `update:date`；点"清除"按钮 emit `clear`。
  - **手测：** 账本首页 `selectedDate` 为空时显示"上月 / 2026 年 8 月 / 下月 / [📅]"；`selectedDate = '2026-08-15'` 时显示"上一天 / 2026 年 8 月 15 日 / 下一天 / [✕]"。
  - **手测：** `selectedDate = '2026-08-24'`（今天）时"下一天"按钮 disabled；`currentMonth = '2026-08'`（当月）时"下月"按钮 disabled。
- **Verification:** `npm run test:unit` 通过；手动跑 `dev:custom` 试选某一天、切上下一天、清除回月模式。

### U4. 头部 stats 防抖重算接线

- **Goal:** 让头部支出/收入/净额数字在 5 个筛选条件任一变化时实时重算，200ms 防抖。
- **Requirements:** R20, R21, R22
- **Dependencies:** U1
- **Files:**
  - `src/store/modules/ledger.ts`——把现有 `currentMonth` / `payerMode` / `selectedCategoryIds` watch 改成统一通过 `loadStatsDebounced` 触发；`loadStatsDebounced` 用 U1 的 debounce 工具
  - `src/pages/ledger/index.vue`——移除现有 `watch(() => currentMonth, ...)` 中重复调 `loadStats` 的部分；改用 `watch` 触发 store 的统一接口
- **Approach:** 1) store 暴露 `loadStatsDebounced` getter（200ms 防抖版 loadStats），由 4 个 setter（setPayerMode / setTypeFilter / setSelectedDate / setSelectedCategoryIds / setMonth）的**页面层 watcher**触发；现有 `loadEntries` 的 watch 保留原状（不防抖，因 entries 已经有单飞保护）。watcher 放在页面层（跟现有 `watch(() => [payerMode.value, selectedCategoryIds.value], ...)` 模式一致），不放在 store 内置。2) 页面 watch 简化：所有筛选变化只调 `ledgerStore.loadEntries()` + `ledgerStore.loadStatsDebounced()`。3) 防抖函数的 key 用 `${month}|${payerMode}|${typeFilter}|${date}|${selectedCategoryIds.join(',')}` 拼接，确保同筛选只打一次。
- **Patterns to follow:** task store 已有的 debounce 用法（如果有）；ledger store 现有单飞保护。
- **Test scenarios:**
  - **Debounce:** 200ms 内连续调 5 次 `setPayerMode` 不同值，只触发 1 次 `loadStats`。
  - **Concurrent with loadEntries:** `setTypeFilter('expense')` 触发 `loadEntries` + `loadStatsDebounced`；列表先更新，头部数字延迟 200ms 更新。
  - **Cache key:** `setMonth('2026-08')` + 立即 `setMonth('2026-08')` 只触发 1 次（store 内部用同样的 queryKey 判断）。
- **Verification:** `npm run test:unit` 通过；`tests/unit/ledger-store.spec.ts` 加 debounce 行为的 mock 测试；手动测快速连点 5 个 chip 头部的 loading 提示最多出现 1 次。

### U5. 首页本月支出小卡

- **Goal:** 首页 HomeSummaryCard 下面加一张跟"看看我们做完的事"链接视觉同款的小卡，承载本月支出数字和跳账本入口。
- **Requirements:** R11, R12, R13, R14, R15
- **Dependencies:** U1
- **Files:**
  - `src/components/home/MonthlyExpenseCard.vue`（新文件）——props: `expenseCents: number | null`, `loading: boolean`, `errorMessage: string | null`；emit: `press`（点击时）；视觉跟 `home-completed-link` 同款
  - `src/pages/index/index.vue`——在 `HomeSummaryCard` 下面、`<TaskList>` 上面插入 `<MonthlyExpenseCard>`；`onPress` 调 `uni.switchTab({ url: '/pages/ledger/index' })`；store 还在 loading 时 props.loading=true，error 时 props.errorMessage
- **Approach:** 1) `MonthlyExpenseCard` 内部维护：loading 态显示"正在加载账本统计" + 转圈；error 态显示"暂时无法读取" + 重试按钮；success 态显示"本月支出 ¥X / 去看看账本 →"。2) 页面 mount / onShow 时调 `ledgerStore.setHouseholdContext(householdId, '')` + `ledgerStore.loadStats(formatLedgerMonth(new Date()))`，确保 stats 已加载。3) `v-if="household"` 跟现有"已完成事项"链接同条件。
- **Patterns to follow:** `src/pages/index/index.vue:269-317` 的 `.home-completed-link` 样式块；Wot UI `wd-loading` 跟全站统一；ledger store 的 `loadStats` 调用模式。
- **Test scenarios:**（项目 jest + ts-jest 无 vue test utils / 快照配置，组件渲染走**手测 + e2e**，不写 jest component test）
  - **手测：** 加载中渲染转圈 + "正在加载账本统计"；error 渲染 icon + "暂时无法读取" + 重试按钮；成功渲染"本月支出 ¥1,234.56 / 去看看账本 →"。
  - **手测：** 成功状态下点卡片 emit `press`；`uni.switchTab` 被调用，url 为 `/pages/ledger/index`。
  - **手测：** `household` 为空时不渲染。
- **Verification:** `npm run test:unit` 通过（如果是 component test）；手动测：有家庭时小卡显示；无家庭时小卡隐藏；点卡片跳账本。

### U6. 文案修复（列表 + 详情共用描述器）

- **Goal:** 收入账目文案从"付款"改为"入账"，列表和详情页共用同一个描述器函数。
- **Requirements:** R16, R17, R18, R19
- **Dependencies:** U1
- **Files:**
  - `src/pages/ledger/ledger-home-view.ts`——新增 `describePayerLine(type, payer)`（U1 已加），导出供详情页复用
  - `src/components/ledger/LedgerEntryItem.vue`——`payerName` 改用 `describePayerLine(props.entry.type, props.entry.payer)`
  - `src/subpackages/ledger/ledger-detail/ledger-detail-view.ts`——`describePayerLine(detail)` 内部调 `describePayerLine(detail.type, detail.payer)`（重命名旧函数为 `describePayerLineForEntry` 或保留旧签名包新函数）
  - `src/subpackages/ledger/ledger-detail/index.vue`——`payerLine` 改用新的描述器
- **Approach:** 1) 保留 `ledger-detail-view.ts` 的现有 `describePayerLine(detail)` 签名（避免破坏页面调用），但内部实现改为调 `describePayerLine(detail.type, detail.payer)`。2) `LedgerEntryItem.vue:42` 的 `payerName` computed 替换为 `describePayerLine(props.entry.type, props.entry.payer)`。3) 注释说明集中文案来源是 `ledger-home-view.ts:describePayerLine`。
- **Patterns to follow:** `describeEntryAmount` 已有的"输入 type + 数字，输出字符串"模式。
- **Test scenarios:**
  - **describePayerLine:** 同 U1 测试场景。
  - **Component:** 收入账目列表项渲染"由 X 入账"；支出账目列表项渲染"由 X 付款"；详情页"付款人"行同步。
- **Verification:** `npm run test:unit` 通过；`tests/unit/ledger-detail-view.spec.ts` 现有 `describePayerLine` 测试更新。

### U7. 云端 listEntries / getStats 扩展

- **Goal:** 云端 listEntries / getStats 接收 `typeFilter` 和 date（yyyy-MM-dd）维度；保持向后兼容。
- **Requirements:** R5（云端部分）
- **Dependencies:** U1
- **Files:**
  - `cloudfunctions/ledger/ledger-domain.js`——`listEntries` 接收 `typeFilter` 字段加到 `where.type = db.command.in(['expense', 'income'])` 或 `db.command.eq`；`month` 字段兼容 `yyyy-MM-dd`，按日查询时 `where.occurredAt` 用 `[dayStart, dayStart+24h)` 区间；`getStats` 同步接收 `typeFilter` 和 `date`，stats 计算时按 type 过滤
  - `cloudfunctions/ledger/repository-data.js`——`findEntriesByHousehold` 把 `month` 参数从 `yyyy-MM` 扩展为兼容 `yyyy-MM-dd`（按 KTD2 描述）
  - `src/services/ledger-cloud.ts`（consumer type）——同步类型
- **Approach:** 1) `where.type` 拼接：`if (typeFilter === 'expense') where.type = 'expense'`，`'income'` 同理，`'all'` 不加。2) `month` 长度判断：`'all'` (3 字符) → 全部时间（不按月/日过滤）；10 → day level（按日区间查）；7 → month level（按月区间查）；其他抛 `LEDGER_INVALID_REQUEST`。3) `selectedCategoryIds` 非空时 `where.categoryId` 走 `db.command.in(selectedCategoryIds)` 过滤，跟 `typeFilter` 是 AND 关系；`byCategory` / `byPayer` 累加时也按 `type` + `categoryIds` 双重过滤后再累加，确保头部数字（含 R22 / AE14 的"类目筛选下支出总额"）准确。4) 旧请求（只传 payerMode + month='yyyy-MM'）走当前行为，向后兼容。
- **Patterns to follow:** `where.payerMemberKey` 已有的"按 payerMode 拼 query"模式；现有 `findEntriesByHousehold` 的 month 区间计算。
- **Test scenarios:**
  - **Type filter:** `listEntries({ month: '2026-08', payerMode: 'all', typeFilter: 'expense' })` 只返回 type=expense 的账目；`typeFilter: 'income'` 只返回 type=income；`typeFilter: 'all'` 返回全部。
  - **Date:** `listEntries({ month: '2026-08-15', payerMode: 'all' })` 只返回 occurredAt 在 `[2026-08-15 00:00:00, 2026-08-16 00:00:00)` 区间的账目。
  - **Stats:** `getStats({ month: '2026-08-15', payerMode: 'all', typeFilter: 'expense' })` 返回的 stats 等于那一天所有 type=expense 账目的累加。
  - **Back-compat:** 旧请求（无 typeFilter）走当前行为，typeFilter 默认 'all' 等于不过滤。
- **Verification:** `npm run test:unit` 通过（`tests/unit/ledger-domain.spec.ts` 更新 mock 测试）；本地 `cloudfunctions/ledger` 用 `npm run dev:cloud` 跑通；双账号真机部署后做端到端验证。

### U8. 单元测试 + 双账号端到端验证

- **Goal:** 把前 7 个 unit 的测试集中整理，覆盖所有 R-ID 至少一个 AE；并补充双账号真机验证清单。
- **Requirements:** 全部 22 个 R
- **Dependencies:** U1-U7
- **Files:**
  - `tests/unit/ledger-home-view.spec.ts`——更新现有 `describePayerFilterOptions` 测试（3 options），加 `describeTypeFilterOptions` / `describePayerLine` / `shiftDay` / `describeMonthLabel(yyyy-MM-dd)` 测试
  - `tests/unit/ledger-store.spec.ts`——加 `setTypeFilter` / `setSelectedDate` action 测试；加 `loadStatsDebounced` 行为测试（mock 触发顺序）
  - `tests/unit/ledger-stats-view.spec.ts`——保持现有测试
  - `tests/unit/ledger-detail-view.spec.ts`——更新 `describePayerLine(detail)` 测试，覆盖 type=expense / type=income / hasLeft 三种
  - `tests/unit/ledger-domain.spec.ts`（云端）——加 typeFilter / date 参数测试
- **Approach:** 1) 每个 U1-U7 单元产出的纯函数和 store action 至少有一个 spec；2) PRD 008 原有"真机双账号验证清单"追加 8 项新场景（附录 B 编号 17-24：双维度筛选-支出 / 收入、具体日期、清除日期、首页小卡、收入文案、月初/月末边界、跨年边界）到本计划附录。
- **Test scenarios:**
  - 所有 U1-U7 的"Test scenarios"小节作为参考基线
  - 端到端：见附录双账号验证清单
- **Verification:** `npm run verify:mp-weixin` 全部通过；新增 / 更新 ≥ 30 个 case；整体 ≥ 416 套件（386 + 30）。

---

## Verification Contract

- **Type check:** `npx tsc --noEmit`（项目无 `type-check` 脚本，直接调 tsc）—— 必须 0 错误。
- **Unit tests:** `npx jest --config jest.unit.config.cjs` —— 新增 / 更新 ≥ 30 个 case，整体 ≥ 416 套件（386 + 30）。
- **Style conventions:** `npm run check:styles` —— BEM 嵌套 SCSS、首页小卡跟 `home-completed-link` 视觉一致、loading 文案"正在加载账本统计"对齐全站。
- **Lint:** 无 lint 脚本，跳过。
- **Package size:** `npm run check:package-size` —— 主包 ≤ 1.5 MB，新增资源总计 ≤ 20 KB（日历组件 Wot UI 内置，0 新增；首页小卡 CSS 复用现有，0 新增）。
- **Build:** `npm run build:mp-weixin` —— 必须成功。

### Behavioral Skill Evaluation

- `test-browser`（可选，CE 平台）—— 在受影响的页面（`pages/index`、`pages/ledger`）跑浏览器测试，验证 5 项改动的端到端表现。
- `ce-doc-review`（Phase 5.3.8 自动跑）—— markdown plan 必跑，HTML 跳过；本计划是 markdown，doc review 会跑。

### Per-Unit Verification Mapping

- U1 → `tests/unit/ledger-home-view.spec.ts` + `tests/unit/ledger-store.spec.ts`（debounce 测试）
- U2 → `tests/unit/ledger-home-view.spec.ts`（更新 `describePayerFilterOptions` 测试）
- U3 → component snapshot + `tests/unit/ledger-home-view.spec.ts`（`describeMonthLabel` 接受 yyyy-MM-dd）
- U4 → `tests/unit/ledger-store.spec.ts`（debounce 行为）
- U5 → component snapshot（`MonthlyExpenseCard` 三个状态）
- U6 → `tests/unit/ledger-home-view.spec.ts` + `tests/unit/ledger-detail-view.spec.ts`
- U7 → `tests/unit/ledger-domain.spec.ts`（云端）
- U8 → 整合所有

---

## Definition of Done

### Global DoD

- 所有 22 个 R-IDs 至少有一个对应的 Acceptance Example 通过（AE1-AE15 全部通过）
- `npx tsc --noEmit` 0 错误
- `npx jest --config jest.unit.config.cjs` 全部通过，整体 ≥ 416 套件
- `npm run check:styles` 全部通过
- `npm run build:mp-weixin` 成功
- `npm run check:package-size` 主包 ≤ 1.5 MB
- 本计划 `ce-doc-review`（Phase 5.3.8）已跑过
- 已在微信开发者工具双账号真机部署，按附录验证清单跑通
- git history 显示每个 U-ID 至少一次 commit（或一个 commit 涵盖多个 U-ID，按 ce-work 决定）
- 未引入新的生产依赖（依赖 Wot UI `wd-calendar` 已存在）
- 无 PRD 008 核心规则改动

### Per-Unit DoD

- U1: types 字段 + store actions + 描述器 + debounce 工具 + 单元测试
- U2: MemberFilter + TypeFilter 组件 + 账本首页接两行 chip + 单元测试
- U3: DatePickerButton 组件 + 账本首页月份/日模式切换 + 单元测试
- U4: loadStatsDebounced + 账本首页 watch 简化 + 单元测试
- U5: MonthlyExpenseCard 组件 + 首页接线 + 视觉跟 home-completed-link 同款
- U6: describePayerLine 描述器 + LedgerEntryItem + ledger-detail-view 全部走新描述器 + 单元测试
- U7: 云端 listEntries + getStats 扩展 + 类型字段 + 单元测试（云端）
- U8: 整体测试 + 双账号真机端到端

---

## Appendix

### A. PRD 008 现有 16 条双账号验证清单（继承）

PRD 008 §"真机双账号验证清单"中 1-16 条路径（记支出、对方看到、记收入、按成员筛选、拍照记账、编辑、不能编辑对方、删除、软删恢复、自定义类目、隐藏类目、新成员加入、单成员、凭证图超限、凭证失败、30 天清理）保持不变，本计划不修改。

### B. 新增 5 项双账号端到端验证（计划级）

按本计划 5 个改动范畴各加一条：

| 编号 | 场景 | 步骤 | 预期 |
|---|---|---|---|
| 17 | 双维度筛选-支出 | A 记 50 元餐饮支出（付款人 A）+ 100 元红包收入（付款人 B）；A 打开账本点"对方 + 支出" | A 列表只剩 50 元支出；头部支出 = 50 |
| 18 | 双维度筛选-收入 | 同 17 步；A 切"全部 + 收入" | A 列表只剩 100 元收入；头部收入 = 100 |
| 19 | 选具体日期 | A 记 8 月 15 号 50 元支出；A 选 8 月 15 号 | A 列表只显示该笔；头部数字 = 那天的 |
| 20 | 清除具体日期 | 在 19 步基础上点"清除" | 回到 8 月按月查看模式；左右按钮变回"上月/下月" |
| 21 | 首页小卡 | A 打开首页 | 看到"本月支出 ¥50"卡片；点卡片跳账本 |
| 22 | 收入文案 | A 记 100 元红包收入；A 打开账本 | 列表项显示"由 B 入账"；点详情"付款人"行也显示"由 B 入账" |
| 23 | 月初/月末边界 | A 记 8 月 31 号支出；A 选 8 月 31 号点"下一天" | 切到 9 月 1 号；列表/头部同步 |
| 24 | 跨年边界 | A 记 12 月 31 号支出；A 选 12 月 31 号点"下一天" | 切到次年 1 月 1 号 |

### C. 已知风险

- 风险 1：防抖 200ms 在用户快速切筛选时会延迟 200ms 才看到头部数字；属预期，但需在 store 注释里说明"这是 UX 取舍不是 bug"
- 风险 2：选具体日期时 `loadMoreEntries`（分页）会因 date 维度变化失效；KTD4 / U1 已决定 date 模式下不分页（listEntries `pageSize=100`、hasMore 始终 false），分页仅在按月模式生效（保留原 20 条/页）
- 风险 3：`wd-calendar` 的 `before-confirm` 在小程序中可能跟 v-model 行为不一致；U3 依赖默认行为（visible 控制），不依赖 before-confirm；如果实测有问题 U3 可加 `beforeConfirm` 兜底
