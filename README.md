# 家里有事

一个面向同居情侣和年轻夫妻的微信小程序，让两个人一起把家里的琐事记下来、认领、完成、放下。

- 两人共享同一个"家"，共同维护家里的待办事项
- 事项按"快没了 / 待处理 / 快到期"分类，按"今天 + 逾期"单独置顶
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
| 工具链 | Vite 5 + vue-tsc + Jest 29 | TS 严格模式、单元测试 27 套件 / 270 用例 |

## 本地运行

1. 在 `src/manifest.json` 的 `mp-weixin.appid` 填入你自己的 AppID（**不要**把 AppID、AppSecret、云环境凭据提交到任何位置）。
2. 安装依赖：`npm install`
3. 启动开发：`npm run dev:mp-weixin`
4. 微信开发者工具 → 导入项目 → 选择**项目根目录**（不要直接选 `dist/dev/mp-weixin`）。`project.config.json` 已经把 `miniprogramRoot` 指向 `dist/build/mp-weixin/`，`cloudfunctionRoot` 指向 `cloudfunctions/`。
5. 微信开发者工具里点"云开发" → 创建/选择测试环境 → 记下环境 ID（用来填 `src/config/cloud.ts`）。

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
| `cleanup-avatar-media` | 1 | 清理被替换/删除的临时头像文件 |

每个云函数都遵循同样的边界：

- 内部身份键（`householdId`、`actorKey`、`ownerKey`、`assigneeKey`、`_id`）**绝不**回给前端
- 前端响应只暴露展示字段；任何携带内部键的响应被前端 service 校验直接拒绝
- 写操作全部走"创建锁 (identityKey + requestId) + 操作凭证 (taskId + operationToken)"两道幂等闸门
- 详情类查询做最终一致性重试（云端 `.doc(id).get()` 写入后存在 ~400ms 窗口，3 次 × 200ms 退避）

详细部署清单见 `cloudfunctions/README.md`，每个模块的部署步骤都列在对应小节。

## 项目结构

```
src/
├── pages/                          # 主包（启动必需）
│   ├── login/                      # 登录入口
│   ├── index/                      # 首页（家庭 + 事项 + 历史入口）
│   └── profile/                    # 我的
├── subpackages/
│   ├── household/                  # 家庭与成员管理
│   │   ├── create-home/            # 创建家庭
│   │   ├── join-home/              # 通过邀请码加入
│   │   ├── member-management/      # 成员管理
│   │   ├── invite-status/          # 邀请状态展示
│   │   ├── edit-household/         # 编辑家庭资料
│   │   ├── edit-profile/           # 编辑个人资料
│   │   └── crop-avatar/            # 头像裁剪
│   └── task/                       # 共同事项
│       ├── add-task/               # 新建事项
│       ├── task-detail/            # 事项详情 / 状态机操作
│       └── completed-tasks/        # 已完成 + 已放弃（按日期分组）
├── components/                     # 全局复用组件
│   ├── AppTabBar.vue
│   ├── home/HomeSummaryCard.vue
│   └── task/                       # TaskList / TaskSummaryCard + 共享 helper
├── store/modules/                  # Pinia 状态
│   ├── auth.ts
│   ├── household.ts
│   └── task.ts
├── services/                       # 与云函数一一对应的前端 service
├── utils/                          # 通用工具
├── types/                          # 跨模块类型契约
├── config/cloud.ts                 # 测试环境 ID
├── uni.scss                        # 品牌变量
└── manifest.json
cloudfunctions/                     # 4 个云函数源码
docs/
├── prd/                            # 5 份产品需求文档
├── plans/                          # 实施计划（按日期 + 模块名）
└── brand/visual-standard.md        # 视觉规范
tests/
├── unit/                           # 28 套件 / 357 用例
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

### 4. 共同事项（PRD 005 / Plan 2026-08-14-003）⭐ 当前焦点
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

## 验证

```powershell
npm run type-check      # vue-tsc --noEmit，0 错
npm run test:unit       # 28 套件 / 357 用例
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
- [ ] 下一个模块：见 `docs/prd/` 最新编号
