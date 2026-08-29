# 睦录

一个面向同居情侣和年轻夫妻的微信小程序，让两个人一起把家里的琐事记下来、认领、完成、放下。

- 两人共享同一个"家"，共同维护家里的待办事项
- 事项按"快到期 / 快没了 / 待处理"分类，按"今天 + 逾期"单独置顶
- 完成或放弃的事项永久保留，事后可以回看
- 不做提醒、不做统计、不做积分

## 技术栈

| 层 | 选型 | 备注 |
| --- | --- | --- |
| 框架 | uni-app 3 + Vue 3 + TypeScript | 微信小程序目标，`pages.json` 用 easycom 注册 Wot UI |
| UI 组件 | Wot UI v2 | 通用界面必须用 Wot UI；只在"项目独有的品牌组合"（如 3 张色带类型卡）才允许自排版 |
| 状态 | Pinia 2.1 | 每个业务域一个 store，对象式 + 单飞保护 + 超时恢复 |
| 样式 | SCSS + 品牌变量 | `src/uni.scss` 集中维护 `$brand-color-*`、`$brand-radius-*` |
| 后端 | 微信云开发（云函数 + 云数据库） | 4 个云函数，见下表 |
| 工具链 | Vite 5 + vue-tsc + Jest 29 | TS 严格模式、单元测试 41 套件 / 626 用例 |

## 本地运行

1. 在 `src/manifest.json` 的 `mp-weixin.appid` 填入你自己的 AppID（**不要**把 AppID、AppSecret、云环境凭据提交到任何位置）。
2. 安装依赖：`npm install`
3. 启动开发：`npm run dev:mp-weixin`
4. 微信开发者工具 → 导入项目 → 选择**项目根目录**（不要直接选 `dist/dev/mp-weixin`）。`project.config.json` 已经把 `miniprogramRoot` 指向 `dist/build/mp-weixin/`，`cloudfunctionRoot` 指向 `cloudfunctions/`。
5. 微信开发者工具里点"云开发" → 创建/选择测试环境 → 记下环境 ID（用来填 `src/config/cloud.ts`）。
6. **隐私协议声明（必做，否则 `chooseMedia` / `chooseImage` 会报 `api scope is not declared in the privacy agreement`）**：登录 https://mp.weixin.qq.com → **设置 → 基本设置 → 服务内容声明 → 用户隐私保护指引**，声明“选中的照片或视频信息”（用于上传个人/家庭头像和记账凭证）；如需拍照，再补充相机相关用途。保存并发布后**重新扫码进模拟器**（不是热重载，隐私协议状态变更要冷启动）。

> 注意：根目录 `project.config.json` 的 `miniprogramRoot` 指向 **`dist/build/mp-weixin/`**（生产构建产物），不是 `dist/dev/mp-weixin/`（dev watch 半成品）。开发时改完代码需要 `npm run build:mp-weixin` 让微信开发者工具拿到最新版本——这是 5f86bd5 修的坑。

## 云环境准备

每个模块的部署步骤都写在该模块的部署清单里，不要把任何密钥写进代码或文档：

| 集合 | 权限 | 备注 |
| --- | --- | --- |
| `users` | 客户端读/写均**拒绝**，仅云函数访问 | 存放用户档案、昵称、头像 |
| `households` | 客户端读/写均**拒绝**，仅云函数访问 | 家庭基本信息、成员键 |
| `invitations` | 客户端读/写均**拒绝**，仅云函数访问 | 邀请码、过期时间、满员状态 |
| `tasks` | 客户端读/写均**拒绝**，仅云函数访问 | 事项本体 + 事件流 + 终止态 |

云函数（在 `cloudfunctions/`）：

| 目录 | 动作数 | 责任 |
| --- | --- | --- |
| `resolve-login` | 1 | 首次登录创建 user / 已登录返回 profile |
| `household` | 13 | 家庭 CRUD、邀请、加入、个人资料、头像、成员管理 |
| `task` | 7 | 事项的创建、认领、完成、放弃、详情、首页列表、已完成分页 |
| `ledger` | 11 | 账目的记、查、改、删、恢复、列表、详情、类目 CRUD、统计 |
| `cleanup-avatar-media` | 1 | 清理被替换/删除的临时头像文件 |
| `cleanup-deleted-tasks` | 0 | 每日 03:00 清理 30 天前软删的事项 |
| `cleanup-deleted-ledger-entries` | 0 | 每日 03:00 清理 30 天前软删的账目 |

每个云函数都遵循同样的边界：

- 内部身份键（`householdId`、`actorKey`、`ownerKey`、`assigneeKey`、`_id`）**绝不**回给前端
- 前端响应只暴露展示字段；任何携带内部键的响应被前端 service 校验直接拒绝
- 写操作全部走"创建锁 (identityKey + requestId) + 操作凭证 (taskId + operationToken)"两道幂等闸门
- 详情类查询做最终一致性重试（云端 `.doc(id).get()` 写入后存在 ~400ms 窗口，3 次 × 200ms 退避）

详细部署清单见 `cloudfunctions/README.md`，每个模块的部署步骤都列在对应小节。

## 项目结构

```
src/
├── pages/                          # 主包（4 个启动必需页面）
│   ├── login/                      # 登录入口
│   ├── index/                      # 首页（家庭 + 事项 + 月度账目入口）
│   ├── profile/                    # 我的
│   └── ledger/                     # 家庭账本首页（月度概览 + 筛选 + 列表 + FAB）
├── subpackages/                    # 按业务域懒加载（3 个子包）
│   ├── household/                  # 家庭与成员管理（7 个页面）
│   │   ├── create-home/            # 创建家庭
│   │   ├── join-home/              # 通过邀请码加入
│   │   ├── member-management/      # 成员管理
│   │   ├── invite-status/          # 邀请状态展示
│   │   ├── edit-household/         # 编辑家庭资料
│   │   ├── edit-profile/           # 编辑个人资料
│   │   └── crop-avatar/            # 头像裁剪
│   ├── task/                       # 共同事项（3 个页面）
│   │   ├── add-task/               # 新建事项
│   │   ├── task-detail/            # 事项详情 / 状态机操作
│   │   └── completed-tasks/        # 已完成 + 已放弃（按日期分组）
│   └── ledger/                     # 家庭账本子包（4 个页面）
│       ├── ledger-add/             # 记一笔（收入 / 支出 + 类目 + 凭证图）
│       ├── ledger-detail/          # 账目详情 / 编辑 / 恢复
│       ├── ledger-category-manager/ # 类目管理（添加 / 改名 / 隐藏 / 删除）
│       └── ledger-stats/           # 账本统计（按月 + 按成员 + 按类目）
├── components/                     # 全局复用组件
│   ├── AppTabBar.vue
│   ├── home/                       # 首页专用
│   │   ├── HomeSummaryCard.vue
│   │   └── MonthlyExpenseCard.vue  # 月度账目卡（支出 + 收入 并排）
│   ├── ledger/                     # 账本专用
│   │   ├── DatePickerButton.vue    # 日历选择器（wd-calendar 包装）
│   │   ├── LedgerEntryItem.vue     # 单条账目渲染
│   │   ├── CategoryFilterChips.vue # 类目多选 chip
│   │   └── ReceiptThumb.vue        # 凭证图缩略图
│   └── task/                       # TaskList / TaskSummaryCard + 共享 helper
├── store/modules/                  # Pinia 状态（5 个）
│   ├── auth.ts
│   ├── household.ts
│   ├── invitation.ts
│   ├── ledger.ts                   # 账本（entry / category / stats / filter / debounce）
│   └── task.ts
├── services/                       # 与云函数一一对应的前端 service
│   ├── auth-cloud.ts               # resolve-login
│   ├── household-cloud.ts          # household
│   ├── invitation-cloud.ts         # household（邀请 / 加入）
│   ├── ledger-cloud.ts             # ledger
│   ├── task-cloud.ts               # task
│   ├── avatar-media.ts             # 云存储（头像 / 凭证图）
│   └── entry-router.ts             # 账目跳转辅助
├── utils/                          # 通用工具
│   ├── format.ts                   # ¥ / 月份 / 日期 格式化
│   ├── ledger-validators.ts        # 账目 / 类目 draft 校验
│   ├── display-text.ts             # 共享中文文案
│   ├── image-selection.ts          # uni.chooseImage 包装
│   ├── storage.ts                  # 本地存储（pending-* 临时态）
│   ├── pending-household.ts
│   ├── pending-invitation.ts
│   ├── pending-ledger.ts
│   └── pending-task.ts
├── types/                          # 跨模块类型契约
├── config/cloud.ts                 # 测试环境 ID
├── uni.scss                        # 品牌变量
└── manifest.json
cloudfunctions/                     # 4 业务云函数 + 3 清理定时任务
docs/
├── prd/                            # 9 份产品需求文档
├── plans/                          # 实施计划（按日期 + 模块名）
├── brainstorms/                    # 头脑风暴输出（ce:brainstorm 落盘）
└── brand/visual-standard.md        # 视觉规范
tests/
├── unit/                           # 41 套件 / 626 用例
└── e2e/                            # 真机自动化（依赖微信开发者工具会话）
```

## 已完成模块

每个模块都按 `ce → brainstorm → plan → work` 跑过，PRDs 在 `docs/prd/`，实施计划在 `docs/plans/`。

### 1. 登录与启动分流（PRD 001 / Plan 2026-08-13-002）
- 首次登录云端建 user，已登录返回 profile
- 登录后根据"是否已有家庭"分流到首页 / 创建家庭 / 加入家庭
- 邀请链接携带 token，登录后直达加入页

### 2. 品牌视觉（PRD 002 / `docs/brand/visual-standard.md`）
- 主色：暖米白底 `#FFF9F2` + 薄荷绿 `#43C89A`（主）/ `#267A5A`（动作）
- 三个事项类型色：暖黄 `#E8B647`（快没了）/ 薄荷 `#5BBE93`（待处理）/ 珊瑚 `#E78A7B`（快到期）
- 圆角：输入 16rpx / 卡片 24rpx / 按钮 999rpx
- Logo 软插画风，纯文字"家里的事" eyebrow 标识 + 6rpx 字距

### 3. 创建与加入家庭（PRD 003 / 004 / Plan 2026-08-14-001 / 2026-08-14-002）
- 创建：名称 + 头像（内置或本地上传裁剪）
- 邀请：6 位短码 + 7 天过期 + 满员保护
- 加入：扫码 / 输码 → 验证 → 落到家庭
- 成员管理：查看 / 移除
- 双账号真机验证通过

### 4. 共同事项（PRD 005 / Plan 2026-08-14-003）
- **状态机**：`pending → claimed → (completed | abandoned)`，终止态不可重开
- **任何成员都能完成/放弃**（避免"等认领人"死锁），但放弃需二次确认
- **首页分组**：今天 + 逾期置顶 + 三个类型分组；类型色带左侧识别
- **已完成页**：按本地日历日分组（今天 / 昨天 / M月D日 / YYYY-MM-DD），倒序；`onReachBottom` 自动加载下一页
- **幂等性**：创建锁（`identityKey + requestId`）+ 操作凭证（`taskId + operationToken`），重复点击不重复创建
- **超时恢复**：超时后先轻量查详情确认是否生效，已生效按成功处理
- **双账号真机验证 10 条路径通过**（详见 `cloudfunctions/README.md` U5 段）

### 5. 事项编辑 + 备注对话（PRD 006 / Plan 2026-08-16-001）
- **编辑字段**：name / type / dueDate / note（不含 assignee）；`editVersion` 乐观锁防止并发覆盖
- **任一成员都能编辑**，但**只能在 `pending` / `claimed` 状态**编辑（终态封口）
- **多人评论**：1-200 字；存 `tasks.comments` 数组，**不可改不可删**；按 at 倒序；新评论实时推送（WeChat Cloud `db.watch`，SSE 通道）
- **编辑不影响评论 watch**：合并逻辑只动 `detail.comments`，保留编辑中的草稿（避免编辑半路被 watch 覆盖）
- **终态封口**：completed / abandoned 后编辑和评论都禁用
- **空编辑兜底**：客户端提交但字段没变，云端不写 edit 事件（R5）
- **幂等性**：编辑 / 评论各用独立的 `operationToken`；同 token 重复提交返回上次结果
- **双账号真机验证 8 条新增路径**（11-18，详见 `cloudfunctions/README.md`）

### 6. 事项删除（PRD 007 / Plan 2026-08-17-001）
- **删除范围**：仅 pending/claimed；completed/abandoned 永久保留
- **软删除**：`deletedAt` + `deletedBy` 字段；30 天后由 `cleanup-deleted-tasks` 定时任务物理清理
- **任一家庭成员都能删**（不限于创建者）
- **删除后 reLaunch 回首页**（不留历史栈）
- **删除也走 watch**：其他家庭成员实时看到事项消失（`onDeleted` 回调 → `applyRemovedFromWatch`）
- **二次确认弹窗**：「「{title}」删除后无法在产品内恢复，30 天后系统清理。是否继续？」
- **无产品级恢复 UI**：30 天软删仅供工程师运维恢复
- **双账号真机验证 4 条新增路径**（19-22，详见 `cloudfunctions/README.md`）

### 7. 家庭共同流水账（PRD 008 / Plan 2026-08-17-002 + UI Plan 008-ledger-ui-design）
- **单一共同模式**：家庭级别只一种模式，"各自"只是按成员筛选的视图（不像 PRD 005 那样有完整/简化两套）
- **不计算 AA / 不计算谁欠谁**：纯流水账，不是 AA 记账软件
- **完全独立于"事项"模块**：不引用 `taskId`，不联动
- **整数分金额**（`amountCents`）：数据库存分，显示 ÷100 加 ¥
- **类目家庭级共享**：8 个固定（餐饮/交通/居家/娱乐/医疗/服饰/教育/其他）+ 用户可自定义（添加 / 改名 / 隐藏 / 删除）
- **双方都能记 / 改 / 删自己记的账**：编辑 / 删除绑定 `payer.memberKey === selfMemberKey`
- **双方都能看全部 + 新成员看到历史**（家庭共同账本的核心语义）
- **支持支出 / 收入两种类型**（无转账独立类型）
- **按成员 / 月份 / 类目筛选**：筛选全部由云端 `listEntries` 完成，前端只做二次过滤
- **凭证图云存储**（`receipts/{householdId}/{entryId}.jpg`）：30 天物理删除账目时连带删
- **软删除 + 30 天清理**（`cleanup-deleted-ledger-entries`）：30 天内任何成员都能恢复
- **纯 inline SVG 饼图 + 纯 CSS 柱状图**（不引第三方图表库）
- **8 个类目图标直接用 Wot UI 内置 SVG**（`fork-spoon` / `car` / `house` / `gamepad` / `first-aid` / `shopping-bag` / `book` / `tag`）— 不创建 PNG 资源，节省 60KB
- **底部 tab 入口**（账本作为第二个 tab：首页 / 账本 / 我的；Wot UI `wd-tabbar` 实现，icon `book` 线稿风——Wot UI 的 `wallet` iconfont 字形缺失，用语义最贴的 `book` 替代）
- **不在 PRD 008 范围**：AA / 分摊 / 结算 / 已转 / 转账独立类型 / 预算 / 定期账 / OCR / 多币种 / 多人家庭（>2 成员）/ 与事项联动 / 私密账目 / 乐观锁 / Webhook / 推送 / 导出 / 搜索 / 年报
- **双账号真机验证 15 条路径**（19-33，详见 `cloudfunctions/README.md`）

### 7.1 账本体验增强（PRD 008 / Plan 2026-08-24-2320）
2026-08-24 ~ 2026-08-25 在 PRD 008 基础上做了一轮体验增强（不引入新数据模型，筛选 / UI / 反馈层）：

- **付款方筛选（人 + 类型 双维度）**：旧版"我付的 / 对方付的"+"支出 / 收入"两行 chip 视觉太重，合并成单按钮"全部人 · 全部类型 ⌄"+ 底部弹层。draft 本地态实现"点开不立即应用、确认才应用"，避免每次点 chip 触发云函数抖动。收入筛选用 `typeFilter` 字段从云端 `listEntries` 透传给 `findEntriesByHousehold`（之前字段被吞了——`LedgerEntryItem` 收入类型仍显示"付款"就是这个 bug）。
- **入账文案**：`LedgerEntryItem` 收入类型显示 **入账** 而非 **付款**（U2，2026-08-25 改）。
- **具体日期筛选**：`DatePickerButton` 包 `wd-calendar` type='date'，min=2020-01-01，max=今天 23:59:59（13位时间戳）。日期模式下 `pageSize=100, hasMore=false`（一天数据量小不分页），已删除区折叠（KTD6），下一天按钮按日期判断。
- **首页月支出卡**：`MonthlyExpenseCard` 显示 **支出 ¥X | 收入 ¥Y** 并排，挂在 `pages/index` hero 下；收入字段从 `ledgerStats.monthIncomeCents` 读取。
- **顶部统计跟着筛选条件走**：`loadStatsDebounced`（200ms 防抖）和 `loadEntries` 共享 `payerMode / typeFilter / categoryIds / selectedDate / currentMonth` 5 个 state，watch deep 触发重算。`getLedgerStats` 云端同样透传这 4 个筛选字段。
- **筛选区重做**（设计稿 C）：去外层白 card 容器（用户反馈"中间双层臃肿"），主体筛选 + 类目筛选两按钮左右并排，类目展开占满整行宽度。
- **日历 / FAB 弹层 z-index**：`wd-calendar` / `wd-popup` z-index 提到 200，超过 FAB 99；`isDatePickerOpen` / `filterSheetOpen` 状态触发 FAB `v-if` 隐藏，避免动画期间被遮。
- **添加类目弹窗重做**：8 个色块（CATEGORY_PRESETS）一行展示 = 一次选择（合并图标 + 颜色），用色块 + 中文首字（餐/交/居/娱/医/服/教/它）替代 Wot UI iconfont 中缺失的 `fork-spoon / car / house / gamepad / first-aid / shopping-bag` 字形。
- **金额输入框高度锁死**：`align-items: center`（was baseline）+ `height: 72rpx / min-height: 72rpx / line-height: 72rpx / padding: 0` 显式锁死，避免 flex 容器内 `<input>` 默认 min-width 太小导致金额被截断。
- **头像加载占位**：`HomeSummaryCard` 新增 `avatarLoading` prop，自定义头像 URL 加载时显示 144rpx 加载圈，避免默认头像闪一下再替换。
- **首页并行加载**：`loadHome` 用 `Promise.all` 并行拉 task 列表 + ledger stats + 自定义头像 URL，不再被最慢的一个串行阻塞。
- **不引入新数据模型**：所有增强都在筛选 / UI / 反馈层；ledger 实体、类目、统计的口径完全没变，旧数据无缝兼容。

### 8. 自定义个人头像 + 清理快捷选择（Plan 2026-08-27-001）
2026-08-27 上线个人资料编辑的自定义头像入口，并把视觉冗余的"快捷选择"按钮去掉：

- **入口形态**：`ProfileAvatarPicker` 改成 5 列等宽网格（4 个内置 + 第 5 格"+ 上传"或自定义缩略图）。"+"格子变身：上传成功后变成用户头像缩略图，被标记为选中；再点可重新上传。
- **裁剪 + 安全检查 + 云端**：复用既有的 `crop-avatar` 子包、`avatar-media` service、云函数 `prepareAvatar` / `checkAvatar` / `getAvatarUrl` 链路；**没有新增云函数动作**（`household` 仍然 13 个动作）。
- **草稿独立**：进入编辑页若 `profile.avatar.kind === 'custom'`，主动调 `getAvatarTemporaryUrl` 拉一次临时 URL 显示；拉取失败降级为"+"占位但草稿不重置（用户可再点"+"重传）。未保存就退出等价于放弃。
- **eventChannel 桥接**：`edit-profile` 跳 `crop-avatar` 时通过 `getOpenerEventChannel` 监听 `avatarApproved` 事件，拿到 `{ avatar: { resourceId, digest }, previewPath }`；`onUnload` 摘除监听避免 stale 回调。
- **`profilePreset` 字段彻底删除**：以前"小帅/小美/随机/custom"5 个值由 `CurrentProfile.profilePreset` 维护，现在 UI 不再需要这些快捷选择、`avatar.kind` 本身已能表达"是否自定义"；同步从 `HouseholdMemberDisplay` / `UpdateProfileRequest` / 前端 services / 云函数 `household-domain.js`（`PROFILE_PRESETS` 常量 + `normaliseProfile` 返回值 + `updateProfile` 读写）/ 6 处 fixture 测试全栈清干净。**老数据 `profilePreset: 'xiaoshuai' | 'xiaomei'` 不主动迁移**——云函数不再读这个字段，留着也不会触发 `INVALID_REQUEST`。
- **保留的内容安全豁免**：云函数 `updateProfile` 里 `['小帅', '小美']` 在改昵称时的内容安全跳过名单**保留**（与 `profilePreset` 字段无关，删了会导致用户改昵称为"小帅/小美"时被 `checkText` 误拒）。
- **隐私协议依赖**：`chooseMedia` 必须在微信小程序后台"用户隐私保护指引"里声明（见上文本地运行第 6 步），否则会报 `chooseMedia:fail api scope is not declared in the privacy agreement`。
- **crop-avatar 错误可观测性增强**：`choose` 函数以前把 `uni.chooseMedia` 的 `fail` 回调静默吞掉（"用户取消"和"权限拒绝"都无声），现在区分 `cancel` 与其他错误，后者用 toast 露出微信原始 `errMsg`，方便排查。
- **小帅/小美的内容安全豁免**为什么没删：云函数 `updateProfile` 里 `if (isRenaming && ![DEFAULT_PROFILE_NAME, '小帅', '小美'].includes(nickname) && ...)` 这条豁免是**改昵称**用的，跟 `profilePreset` 字段没关系。删了会让"用户把昵称改成 小帅/小美"走 `checkText` 误判，所以保留。
- **不在本期范围**：微信资料同步 / 家庭资料自定义头像 / 多张自定义头像 / 历史头像切换 / 裁剪参数自定义 / 老数据主动迁移 / 头像 URL 跨页面缓存。

## 全站交互规范

### Loading 状态

2026-08-18 把全站 loading 收敛到单一模式：

- **统一组件**：Wot UI `wd-loading`（不混用 `wd-skeleton`——之前 home / profile 用骨架屏、其他用转圈，不一致；现已全部转圈）
- **统一文案**："正在加载 [模块][对象]" 模块前缀化：
  - 账本相关 → 正在加载账本 / 账目详情 / 记账页 / 账本类目 / 账本统计
  - 事项相关 → 正在加载事项详情 / 添加事项 / 编辑事项 / 历史事项
  - 家庭相关 → 正在加载创建家庭 / 个人资料 / 家庭资料 / 加入家庭 / 邀请详情
  - 公共 → 正在加载首页 / 我的 / 正在确认登录状态
- **特例保留**：crop-avatar 用"正在检查图片"（动作非加载语义，强行统一会丢精度）
- **省略号**："…"仅用于进行中（如分页"正在加载更早的事项…"），初始加载用句号结尾
- **加新页面**时直接用同样模式（"正在加载 + 模块前缀 + 对象"），不要新造文案

### 家庭卡片点击行为

- `HomeSummaryCard` 组件在 home 页和 profile 页**点击行为一致**：都跳 `subpackages/household/edit-household/index`（编辑家庭资料）
- 这是个一致性约束——同一组件在不同位置应该行为相同；如有差异需求，改组件加 `press-target` prop 而不是各调用方分别实现

### 底部 tab icon

- 3 个 tab 全部用 Wot UI iconfont（线稿风）：home / `book`（账本）/ `user`
- Wot UI 有些 iconfont 名字（`wallet` / `notes` 等）虽然在 CSS 里定义但 iconfont 文件没字形，不能用；改用语义最贴的替代（账本用 `book`）

## 资源 / 体积优化

2026-08-17 做了一次图片资源压缩，把主包从 **1.88 MB（已超 1.5 MB 警告线）** 降到 **601 KB**。

| 资源 | 优化前 | 优化后 | 展示尺寸 |
| --- | --- | --- | --- |
| `src/static/brand/logo.png` | 1254×1254 / 958.6 KB | 256×256 / 62 KB | 124-152rpx |
| `src/static/avatars/households/household-0{1,2,3}.png` | 512×512 / 81-89 KB × 3 | 192×192 / 26-32 KB × 3 | 116rpx |
| `src/static/avatars/people/person-0{1,2,3,4}.png` | 512×512 / 70-84 KB × 4 | 192×192 / 21-22 KB × 4 | 116rpx |

**结论**：`static/` 从 1.52 MB 降到 240 KB（-84%），主包远低于 1.5 MB 警告线（余量 933 KB）。256×256 的 logo 同时是 `LoginBrandHero` / `invite-status` / `completed-tasks` 三处展示的源图，也足以重新提交 WeChat 后台做 app icon（如果以后需要 1254×1254 原图作为高分辨率 app icon 源，从 `references/brand-originals/` 取回即可）。

**重新压缩**：`tmp/compress-static.ps1`（PowerShell + .NET `System.Drawing`，无需任何额外依赖）会自动备份原图到 `references/brand-originals/` 并覆盖缩放。

**约定**：

- 新增图片资源前先评估**实际展示像素 × 2** 作为源图上限；超过 2× 像素视为浪费。
- 头像类资源统一 192×192 起步，logo 类 256×256 起步。更高分辨率只在确实需要 Retina/印刷品时才做。
- 任何 PNG/JPG 改动后跑一次 `npm run build:mp-weixin` 看 `dist/build/mp-weixin/static/` 大小，确保主包不超 1.2 MB。

## 验证

```powershell
npm run type-check      # vue-tsc --noEmit，0 错
npm run test:unit       # 41 套件 / 626 用例
npm run build:mp-weixin # 微信小程序构建
npm run build:h5        # H5 构建
npm run test:e2e        # 依赖微信开发者工具的 automator，会话不通则跳过
```

每次改完代码至少跑前三个。`build:mp-weixin` 是**发布构建**，dev 时不要手动重导 `dist/dev/mp-weixin`，要重导根目录。

真机双账号验证脚本由 `cloudfunctions/README.md` 维护，按"创建 → 双方可见 → 认领 → 完成 → 已完成可见"等路径逐条走完。

## 协作规范

项目协作规则（分支策略、commit 规范、Vue 文件顺序、注释、UI 组件选型、分包体积、隐私安全）都在 `AGENTS.md`，**改任何东西之前先读这一份**。本文档不重复列。

## 路线图

按模块逐个交付，不一次做完一整个 MVP。已落地的写"已完成"，下一步看 PRD / Plan：

- [x] 登录与启动分流
- [x] 品牌视觉
- [x] 创建 / 加入 / 邀请家庭
- [x] 共同事项的增删改查（不含删）
- [x] 事项编辑 + 备注对话（评论实时推送）
- [x] 事项删除（软删 + 30 天物理清理）
- [x] 资源体积优化（主包 1.88 MB → 601 KB）
- [x] 家庭共同流水账（PRD 008）
- [x] 账本体验增强：人×类型双维筛选 + 入账文案 + 日历日期筛选 + 首页月卡 + 顶部统计跟筛选走（Plan 2026-08-24-2320，详见 §7.1）
- [x] 全站 loading 统一：去掉骨架屏 + 文案规范化（"正在加载 [模块][对象]"）
- [x] 自定义个人头像：5 格 Picker 接入 + 裁剪链路接通 + 删 `profilePreset` 全栈字段（Plan 2026-08-27-001，详见 §8）
- [ ] 下一个模块：见 `docs/prd/` 最新编号
