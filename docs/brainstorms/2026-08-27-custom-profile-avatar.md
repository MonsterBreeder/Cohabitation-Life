---
date: 2026-08-27
topic: custom-profile-avatar
---

# 自定义个人头像 + 清理快捷选择

## Problem Frame

`subpackages/household/edit-profile/index.vue` 是用户在家庭里自定义"自己形象"的入口。当前的状态有两个问题：

1. **三个"快捷选择"按钮（"小帅"/"小美"/"随机形象"）价值很低**——它们和下方的"内置形象"网格在功能上重复，用户点"小帅"得到的也就是内置形象一。`profilePresets` 这个抽象也没带来任何额外能力，反而和 `avatar.kind` 重复，存了一份冗余信息。
2. **"自定义头像"功能被一块"稍后开放"的提示占位**。但后端链路（`crop-avatar` 页面、`uploadAvatar` service、云函数 `prepareAvatar` / `checkAvatar` / `getAvatarUrl`、本地校验 `validateLocalAvatar`）**全部已经存在**。唯一缺的是 `edit-profile` 没把入口接出来。

用户实际想要的是：在 4 个内置形象之外能用自己的照片；不需要先理解"快捷选择"这种二次抽象。

## Requirements

**入口与网格布局**

- R1. 编辑个人资料页删除"快捷选择"区块（"小帅"/"小美"/"随机形象"三个按钮以及对应的 `selectPreset` / `selectRandom` / `markCustomAvatar` 逻辑全部移除）。
- R2. 内置形象网格增加一个"+ 上传自定义头像"格子，作为可选形象之一；位置和"形一/二/三/四"同级、样式一致。被选中的判定与内置形象共用一个 `selected` 视觉。
- R3. 用户点击"+"格子 → 跳转 `subpackages/household/crop-avatar` 分包，传 `purpose=profile`；上传并通过云端检查后，**原"+"格子变成用户头像缩略图**（其它 4 个内置形象保持原样），回到编辑页时该缩略图被标记为已选中。

**上传链路集成**

- R4. 编辑页通过 `eventChannel` 监听 `avatarApproved` 事件。事件载荷包含 `avatar: CustomAvatar`（云端 `resourceId + digest`）和 `previewPath: string`（本地图路径）。`edit-profile` 在收到事件后写入本地草稿，并把选中态切到自定义头像。
- R5. 打开编辑页时，如果当前 profile 的 `avatar.kind === 'custom'`，页面需要**主动调用 `getAvatarTemporaryUrl`** 拿到一张可显示的缩略图，作为"+"格子的初始图。如果云端临时链接获取失败，格子回退为"+"，并 toast 提示"自定义头像暂时无法显示，请重新上传"。
- R6. 用户编辑页已有自定义头像时，再次点击该格子进入 `crop-avatar` 重新走上传流程，**成功后替换**当前自定义头像（不是叠加）。用户也可以通过点选 4 个内置形象中的任意一个来"放弃"自定义头像。
- R7. 退出"编辑个人资料"页时，未保存的自定义头像状态不持久化到 `profile` store；保存成功后通过 `store.saveProfile` 同步到云端。

**移除占位文案**

- R8. 删除当前"自定义头像和微信资料稍后开放 / 云端访问规则完成真实验证后才会开放入口。"整段灰底提示。"自定义头像"已开放，这段文案已经过时。
- R9. 微信资料同步能力**仍不在本次范围内**。如果产品决定保留提示，需把文案改成只覆盖微信资料（例如"微信资料同步稍后开放"），并明确说明这与自定义头像无关。本期默认不保留任何提示。

**字段清理：彻底移除 `profilePreset`**

- R10. 类型 `CurrentProfile['profilePreset']` 从 `src/types/household.ts` 删除，连同 `UpdateProfileRequest.profilePreset` 字段。
- R11. 云函数 `cloudfunctions/household/household-domain.js` 移除 `PROFILE_PRESETS` 常量与 `profilePreset` 字段的写入/读取；`getCurrentHome` / `updateProfile` 不再返回或接受 `profilePreset`。
- R12. `edit-view.ts` 删除 `profilePresets` 常量；`hasProfileChanges` 不再比较 `profilePreset`。
- R13. `subpackages/household/edit-profile/index.vue` 不再维护 `preset` ref，调用 `selectPreset` / `selectRandom` / `markCustomAvatar` 的代码全部删除。`save` 调用 `store.saveProfile` 时只传 `nickname` 和 `avatar`。
- R14. `household-cloud.ts` / 其它前端服务同步清理 `profilePreset` 字段。
- R15. 现有数据库中存有 `profilePreset: 'xiaoshuai' | 'xiaomei'` 的老数据，**不主动迁移**；云函数读取时跳过该字段即可，前端不再展示该字段。`avatar` 仍然原样（这些老用户的 avatar 仍是 `person-01` / `person-02`，视觉无变化）。

**测试与契约**

- R16. 现有 `tests/unit/edit-view.spec.ts`、`household-domain.spec.ts`、`invitation-domain.spec.ts`、`household-store.spec.ts`、`household-cloud.spec.ts`、`auth-store.spec.ts` 中引用 `profilePreset` 的 fixture 改为不带该字段；与 `profilePreset` 相关的断言改为"字段不存在"。
- R17. 新增 edit-profile / crop-avatar 集成测试至少覆盖：① "+"格子触发跳转到 crop-avatar；② crop-avatar 成功返回后，"+"格子变成用户头像且被选中；③ 已存在自定义头像时再点格子走替换流程；④ 保存修改时 `profilePreset` 不再出现在请求体。

## Success Criteria

- SC1. 编辑个人资料页不再有"快捷选择"区块；网格 5 个格子（4 内置 + 1 "+" 或 1 用户头像）布局合理、对齐一致。
- SC2. 用户能完整跑通：选"+" → 选图 → 裁剪 → 云端检查通过 → 返回编辑页看到自己的头像在格子里、且被选中。修改昵称一并保存后，刷新其它端（家庭成员管理、首页成员卡片）能正确展示该头像。
- SC3. 全仓库（前端 `src/` + 云函数 `cloudfunctions/` + 测试 `tests/`）不再有 `profilePreset` 字段、字面量 `xiaoshuai` / `xiaomei`、`profilePresets` 常量、`PROFILE_PRESETS` 常量。
- SC4. 类型检查 `pnpm typecheck` 与所有单元测试 `pnpm test` 通过；至少新增 1 个针对"自定义头像格子变身 + 事件回流"的页面级测试。

## Scope Boundaries

- 不在本期：
  - 微信头像 / 微信资料同步
  - 自定义头像之外的"上传家庭头像"流程（家庭资料页 `edit-household` 不动；如果要复用 `crop-avatar` 是另一个任务）
  - 多张自定义头像、历史头像切换、裁剪参数自定义（只固定 1:1 PNG）
  - 老数据 `profilePreset: 'xiaoshuai' / 'xiaomei'` 主动迁移（云函数跳过即可）
  - 头像缓存策略（依赖云函数临时链接 + 浏览器缓存即可，不做本地持久化）

## Key Decisions

- **入口选"+格子"而不是下方按钮或浮动按钮**：和已有 4 个内置形象视觉对齐，符合"头像就是这 5 选 1"的心智模型。
- **快捷选择全砍**："小帅"/"小美"/"随机形象"和下方 4 个内置形象完全重叠，留着只会让用户多一步判断"快捷选择和内置形象有什么区别"。
- **+ 格子变身缩略图，而不是另起一个"我的自定义"预览区**：避免两块视觉重复；点击自定义头像本身就是"重新上传"的入口。
- **彻底移除 `profilePreset` 字段，不收窄到 `'builtin' | 'custom'`**：`avatar.kind` 已经表达了这件事；保留字段只是给云函数/类型多一份要同步维护的真相。
- **老数据不主动迁移**：服务侧跳过该字段即可，老用户头像的 `kind` 仍然是 `builtin`，视觉无变化，行为无回归。

## Dependencies / Assumptions

- 假设 `crop-avatar` 页面和 `uploadAvatar` service 的现有能力（`validateLocalAvatar` 5MB / JPG/PNG/WebP 校验、`wd-img-cropper` 1:1 裁剪、`prepareAvatar` + `checkAvatar` 云函数）**继续满足**当前需求；本期不重做这些。
- 假设 `getAvatarTemporaryUrl` 返回的临时链接在小程序生命周期内有效；不需要额外的缓存层。
- 假设现有云端 `household.members[*]` 记录中即使有 `profilePreset` 字段，写入新数据时由云函数负责剔除；前端不再发送该字段。

## Outstanding Questions

### Resolve Before Planning
（无）

### Deferred to Planning
- [Affects R3][Technical] "+" 格子变身时，前端是否需要本地缓存 `previewPath` 用于在 `getAvatarTemporaryUrl` 失败时降级显示？目前未持久化，编辑页内仍是 ref。
- [Affects R2][Technical] 5 格网格在 4 列布局下要么变 5×1（每格窄）要么 4+1 跨行；具体行高 / 字号 / 标签换行策略由设计在 plan 阶段拍板。
- [Affects R5][Needs research] 微信小程序环境下 `wd-img-cropper` 导出的本地临时路径，是否可以直接作为 `wd-avatar` 的 `src`，还是必须先 `uni.getFileInfo` / 转 base64？需在 plan 阶段做小实验确认。
- [Affects R4][Technical] `eventChannel` 跨分包传 `previewPath` 时，路径是否在 `getCurrentPages().at(-1)` 上能正确解析到上一页（即 `edit-profile`），需要 plan 阶段验证。
- [Affects R15][Technical] 云函数在写入新 `profile` 时如何剔除 `profilePreset` 字段：`$unset` 还是只 `_.pick` 需要的字段？plan 阶段确认。

## Next Steps

-> /ce:plan 写实施计划（应包含：UI 调整、字段清理、新增测试、云函数同步改动）。
