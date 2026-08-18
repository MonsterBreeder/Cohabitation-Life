---
date: 2026-08-17
topic: ledger-ui-design
related-prd: docs/prd/008-shared-ledger-prd.md
related-plan: docs/plans/2026-08-17-002-feat-shared-ledger-plan.md
status: 已确认
---

# PRD 008 记账 UI 设计 Plan

> 本文档基于 `/frontend-design` skill（Module C：Components & Features in Existing Apps），专门定义记账模块 UI 层的视觉、内容、动效与硬约束。
>
> 它**不重复** PRD 008 的业务规则（核心规则、字段、不做清单等），那些在 `docs/prd/008-shared-ledger-prd.md` 锁定。
>
> 它**不重复**实施计划的 7 个 U-unit 拆分，那些在 `docs/plans/2026-08-17-002-feat-shared-ledger-plan.md` 锁定。

## 1. Visual Thesis（视觉论）

**温暖手账感（warm ledger feel）** — 区别于事项模块的"清单列表风"，**强调财务记账的"手写 / 沉稳"质感**：

- 沿用项目品牌"暖米白 + 薄荷绿 + 珊瑚"色板
- 大字号金额居中（system 数字字体，不引入新字体）
- 类目色带与事项模块的"类型色带"一致
- 柔和圆角，**不引入新 border-radius**
- 月度概览作为首页第一屏的视觉锚点

## 2. Content Plan（页面内容结构）

### 2.1 `ledger-home` 账本首页

| 顺序 | 区块 | 内容 | 备注 |
|---|---|---|---|
| ① | 月度概览卡 | 本月支出 / 本月收入 / 净支出 + 类目分布条 | 第一屏视觉锚点 |
| ② | 筛选条 | 成员（全部 / 我）+ 月份切换 + 类目多选 chip | 横向滚动 |
| ③ | 列表 | 按日期分组（今天 / 昨天 / M月D日 / YYYY-MM-DD），倒序 | 用 `formatDateGroupLabel` |
| ④ | 浮动操作按钮（FAB） | "记一笔" | 右下角 |
| ⑤ | 已删除区（可展开） | 30 天内可恢复的账目 | 默认折叠 |

**类目分布条** = 一行多个色块按金额比例横铺（纯 CSS flex 即可，不引第三方图表库）。色块按金额从大到小排序，点击色块进入对应类目的筛选。

### 2.2 `ledger-add` 记一笔

| 顺序 | 区块 | 内容 | 备注 |
|---|---|---|---|
| ① | 支出 / 收入 tab | `wd-tabs` | 顶部切换 |
| ② | 金额输入 | ¥ 大字号（48-56rpx），整数键盘 | 用 `wd-input` 类型 `digit` |
| ③ | 类目选择 | 8 个固定 + 用户自定义 chip + "+ 添加"按钮 | 横向滚动 |
| ④ | 付款人 | 默认 = 自己；可切对方 | 单成员家庭隐藏 |
| ⑤ | 备注 | 0-100 字 | `wd-textarea` |
| ⑥ | 发生时间 | 默认今天，可往前 7/30 天 | `wd-picker` |
| ⑦ | 凭证图（可选） | 点击触发 `uni.chooseImage` | 上传后显示缩略图 |
| ⑧ | 保存按钮 | 主操作 | 底部固定 |

**布局原则**：金额输入是视觉焦点（最大字号），其它都是辅助；类目选择用 chip 形式（不要 dropdown），让用户一眼看到所有选项。

### 2.3 `ledger-detail` 详情页

| 顺序 | 区块 | 内容 | 备注 |
|---|---|---|---|
| ① | 类目 + 金额 | 顶部大字号 | ¥ 红色（支出）/ 绿色（收入） |
| ② | 付款人 | 头像 + 昵称 | 灰态展示"已离开" |
| ③ | 备注 | 仅当有备注时显示 | |
| ④ | 时间信息 | 发生时间 / 创建时间 / 最后修改时间 | 灰字小字号 |
| ⑤ | 凭证图 | 点击放大查看原图 | |
| ⑥ | 操作区 | 编辑 / 删除（仅自己记的账） | 底部按钮 |

### 2.4 `ledger-category-manager` 类目管理

| 顺序 | 区块 | 内容 | 备注 |
|---|---|---|---|
| ① | 系统预设区 | 8 个固定类目 | 可隐藏，不可改名 / 删 |
| ② | 自定义区 | 用户添加的类目 | 可改名 / 隐藏 / 删 |
| ③ | "+ 添加"按钮 | 弹类目编辑弹窗 | 输入名 + 选图标 + 选颜色 |

**类目编辑弹窗**：name（2-8 字）+ iconKey（8 选 1）+ colorKey（8 选 1）。

## 3. Interaction Plan（2-3 个有意图的动效）

### 3.1 月度概览金额入场动画
- 数字 0 → 目标值 tween
- 持续 300ms
- `ease-out` 缓动
- **目的**：把用户视线吸引到"今天花了多少"

### 3.2 列表项分组顺序淡入
- 今日 / 昨日 / 日期分组 依次出现
- 每组 80ms 错开
- **目的**：让用户感知"时间维度"，不要一次性全铺

### 3.3 记一笔 FAB 按下缩放
- 按下 scale(0.96)，松手 scale(1)
- 持续 200ms
- **目的**：触感反馈，确认"我按到了"

### 3.4 二次确认删除（PRD 008 规定的）
- `uni.showModal` 弹窗
- 确认后 `taskStore.deleteEntry` → 成功 `uni.reLaunch('/pages/index/index')`
- **目的**：防误删（参考 PRD 007 详情页删除的二次确认模式）

## 4. Module C 硬约束（沿用现有设计系统）

### 4.1 颜色
- 全部用 `src/uni.scss` 的品牌变量：`$brand-color-primary`（薄荷）/ `$brand-color-action`（深薄荷）/ `$brand-color-accent`（珊瑚）/ `$brand-color-text` / `$brand-color-text-secondary` / `$brand-color-border` / `$brand-color-surface` / `$brand-color-background`
- **不引新颜色**。8 个类目的颜色（amber/blue/mint/coral/red/purple/teal/gray）已写在 `cloudfunctions/ledger/preset-categories.js` 作为 `colorKey` 字面量；UI 渲染时按 colorKey 映射到 Wot UI 的 `tag` 组件 type 之一
- 金额红绿：支出用 `$brand-color-accent`（珊瑚）；收入用 `$brand-color-primary`（薄荷）

### 4.2 圆角
- 卡片：`$brand-radius-card`（24rpx）
- 输入：`$brand-radius-input`（16rpx）
- 按钮：`$brand-radius-button`（999rpx）
- 类目 chip：跟随 `wd-tag` 默认圆角（不自定义）

### 4.3 字体
- **不引新字体**。项目目前没看到自定义 `@font-face`，全部用 system-ui
- 金额用 `font-weight: 700` + `font-size: 48-56rpx`（让 system 数字字体自然加粗）
- 其它用 `font-weight: 400/600`，参考已有页面的字号体系

### 4.4 间距
- 卡片内 padding：30rpx（与项目一致）
- 区块间距：24rpx
- 列表项之间：8rpx 内部间距 + 24rpx 区块间距
- 全部用 `rpx`，不用 px

### 4.5 组件
- **Wot UI v2 优先**：
  - `wd-button`（主操作 / 次操作 / 危险）
  - `wd-tabs`（支出/收入 tab）
  - `wd-input`（金额 / 备注 / 时间）
  - `wd-textarea`（备注）
  - `wd-tag`（类目 chip / 筛选 chip）
  - `wd-cell`（类目列表项）
  - `wd-icon`（类目图标 / FAB 图标）
  - `wd-loading`（列表 loading）
  - `wd-empty`（空态：暂无账目）
  - `wd-message` / `wd-toast`（操作反馈）
- **不引第三方库**

### 4.6 类目图标
- **不创建 PNG 资源**！
- 8 个类目图标直接用 `wd-icon` 的内置 SVG：
  | key | Wot UI 图标名 |
  |---|---|
  | `dining` | `fork-spoon` |
  | `transport` | `car` |
  | `home` | `house` |
  | `entertain` | `gamepad` |
  | `medical` | `first-aid` |
  | `clothing` | `shopping-bag` |
  | `education` | `book` |
  | `other` | `tag` |
- **这让 U7 的 8 个 PNG 资源全部省掉**，主包 + 子包 **+0 KB**（plan 估的 +60KB 全部省掉）

### 4.7 统计图表
- **不引第三方图表库**（uCharts / F2 / wx-charts）
- 饼图：纯 inline SVG 画（按 byCategory 数据画扇形）
- 柱状图：纯 CSS 柱状条（每个 payer 一根柱，宽度 = amountCents / max）

## 5. 资源体积（更新版）

| 项 | plan 估 | 实际 | 差异 |
|---|---|---|---|
| 8 个类目图标 PNG | +60 KB | 0 KB | **-60 KB**（用 Wot UI 内置） |
| `visual-assets-map.json` | < 1 KB | 0 KB | **-1 KB**（不需要映射） |
| ledger 分包 | +40-60 KB | +40-60 KB | 一致 |
| **总增量** | **+100-120 KB** | **+40-60 KB** | **-60 KB** |

**主包影响**：仍是 601 KB（ledger 在子包内）。

## 6. Litmus Check（实现后自查）

- [ ] 首页第一屏能识别"这是账本"（不是事项模块） — 通过"类目色带"和"金额大字号"形成识别
- [ ] 类目色带一眼能看出本月花在哪个类目最多 — 按金额比例横铺，从大到小
- [ ] 数字（金额 / 净额）大字号突出 — 48-56rpx，weight 700
- [ ] 按下"记一笔"立刻看到金额输入区 — tab 切完就焦点在金额
- [ ] 删除账目走"二次确认"而非直接消失 — `uni.showModal`
- [ ] 类目图标用 Wot UI 内置 SVG（不引 PNG） — 全部用 `wd-icon` 的 8 个内置名
- [ ] Wot UI 优先，没有手撸的 button / input / cell 替代品
- [ ] 8 个品牌的色值都用 `src/uni.scss` 变量（不直接写 hex）

## 7. 状态机视觉

账目是简单的"非删除 ↔ 软删除"两态，**没有"已转"或"已结算"概念**（PRD 008 核心规则 R4）：

| 状态 | 视觉表现 |
|---|---|
| active（默认） | 正常显示（金额 + 类目色 + 付款人） |
| soft-deleted（30 天内） | 已删除区里灰态显示 + "恢复"按钮 |
| 30 天后被物理清理 | 不再显示 |

## 8. 边缘场景视觉

| 场景 | 视觉处理 |
|---|---|
| 记一笔但家庭只有自己（单成员） | 隐藏"切换付款人"控件；类目筛选不显示"对方"按钮 |
| 新成员加入有历史 | 列表直接显示全部历史（无加入日遮罩） |
| 删除后 | `uni.reLaunch` 跳回首页，列表无该账目 |
| 凭证图超 5MB | chooseImage 阶段弹 `wd-toast` "图片过大"；不允许上传 |
| 凭证图上传失败 | 缩略图显示 + "重试"按钮；可先保存账目不附图 |
| 时间晚于今天 + 1 天 | `wd-toast` 提示"时间不能晚于明天" |
| 金额 = 0 / 负数 | "保存"按钮禁用；`wd-toast` 提示"金额必须大于 0" |
| 列表为空 | `wd-empty` 空态：插画 + "本月还没有账目" + "记一笔"按钮 |
| 月份切换无数据 | 月度概览归零（¥0.00 / ¥0.00 / ¥0.00）+ 空态 |

## 9. 实施优先级

| 页面 | U-unit | 行数估 | 测试数 |
|---|---|---|---|
| ledger-home | U4 | 700 | 8 |
| ledger-add | U5 | 600 | 9 |
| ledger-detail | U6 | 500 | 5 |
| ledger-category-manager | U6 | 200 | 4 |
| ledger-stats | U7 | 300 | 4 |
| 资源 + 文档 | U7 | 200 | 2 |

**总计**：~2500 行 / 32 测试

## 10. 不在本 plan 范围内

- PRD 008 §"不在 PRD 范围内的明确扩展点"（PRD 008.5 ~ 008.10）
- 引入新字体 / 图表库
- 自定义类目图标（超出 8 选 1）
- 多币种
- 多人家庭（>2 成员）的视觉
- 跟事项模块的视觉联动
