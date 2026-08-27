---
title: 自定义个人头像 + 清理快捷选择 - Plan
type: feat
status: active
date: 2026-08-27
origin: docs/brainstorms/2026-08-27-custom-profile-avatar.md
---

# 自定义个人头像 + 清理快捷选择

## Overview

把 `subpackages/household/edit-profile/index.vue` 改造成：删除"快捷选择（小帅/小美/随机形象）"整块和"稍后开放"占位提示；在"内置形象"网格里增加一个"+"格子作为自定义头像入口；上传成功时"+"格子变身用户头像缩略图。同步把"是否自定义"这件事从 `profilePreset` 字段下沉到 `avatar.kind`，彻底删除 `profilePreset` 字段（前端的类型/服务/UI、云函数的读写/校验、所有相关 fixture）。

## Problem Frame

- "快捷选择"三个按钮和下方的 4 个内置形象在功能上完全重叠（点"小帅"就是选 `person-01`），留下只会让用户多理解一层"快捷选择 vs 内置形象"的区别。
- "自定义头像"后端链路（`crop-avatar` 页、`uploadAvatar` service、云函数 `prepareAvatar` / `checkAvatar` / `getAvatarUrl`、本地 `validateLocalAvatar`）已经全部就绪，只差 `edit-profile` 把入口接出来。
- `profilePreset` 字段当前取值为 `'neutral' | 'xiaoshuai' | 'xiaomei' | 'random' | 'custom'`，其中 4 个值都即将失去用途（"小帅"/"小美"UI 没了，"随机"UI 没了，"custom"只是 `avatar.kind === 'custom'` 的冗余表达）。和 `avatar.kind` 完全重复。

完整问题描述与决策理由见 origin 文档。

## Requirements Trace

- R1. 删"快捷选择"区块（Unit 3）
- R2. Picker 增加"+"格子（Unit 2）
- R3. "+"格子跳转 crop-avatar 并变身缩略图（Unit 2 + Unit 3）
- R4. eventChannel `avatarApproved` 监听（Unit 3）
- R5. 打开页面时主动调 `getAvatarTemporaryUrl`，失败回退到"+"（Unit 3）
- R6. 自定义头像可被替换或放弃（Unit 3）
- R7. 未保存的自定义头像不持久化（Unit 3）
- R8. 删除"自定义头像和微信资料稍后开放"提示（Unit 3）
- R9. 微信资料同步仍不在本期（保留在 scope boundaries）
- R10–R14. 字段 `profilePreset` 全栈删除（Unit 1）
- R15. 老数据不主动迁移（Unit 1 通过云函数静默跳过实现）
- R16. 已有 fixture 改字段（Unit 4）
- R17. 新增页面级测试（Unit 4）

Success Criteria SC1–SC4 在 Unit 1–4 全部完成时自然达成。

## Scope Boundaries

- 不在本期：
  - 微信头像 / 微信资料同步
  - `edit-household` 页面（家庭资料页）的自定义头像入口；本期只接通 `edit-profile`
  - 多张自定义头像、历史头像切换、裁剪参数自定义
  - 老数据 `profilePreset: 'xiaoshuai' | 'xiaomei'` 主动迁移
  - 头像 URL 跨页面/跨次会话缓存（依赖云函数临时链接 + 浏览器缓存即可）

### Deferred to Separate Tasks

- 在 `edit-household` 复用 `crop-avatar`：单独任务，依赖 `edit-household` 视觉是否需要家庭头像自定义。

## Context & Research

### Relevant Code and Patterns

- 现状入口：`subpackages/household/edit-profile/index.vue`（仅 1 个 vue 文件，独占分包私有组件）
- 自定义头像子组件：`subpackages/household/components/ProfileAvatarPicker.vue`（4 列网格，目前只接受 `BuiltinProfileAvatarId`）
- 自定义头像上传链路（已存在，仅需在 `edit-profile` 接入）：
  - 裁剪页 `subpackages/household/crop-avatar/index.vue`：选图 + `wd-img-cropper` 1:1 PNG → `uploadAvatar` → 通过 `eventChannel.emit('avatarApproved', { avatar, previewPath })` 通知上一页
  - 服务 `src/services/avatar-media.ts`：`uploadAvatar`（prepareAvatar + 上传 + checkAvatar）、`getAvatarTemporaryUrl`
  - 工具 `src/utils/image-selection.ts`：`validateLocalAvatar`（5MB / JPG/PNG/WebP 校验）
- 状态：`src/store/modules/household.ts` 的 `saveProfile(input: UpdateProfileRequest)`（只接受 nickname + avatar，目前额外接受 profilePreset）
- 云函数：`cloudfunctions/household/household-domain.js`（`PROFILE_PRESETS` 常量、`normaliseProfile`、`updateProfile`）
- 服务校验：`src/services/household-cloud.ts` 的 `isMemberDisplay` / `isHouseholdResult`、`src/services/invitation-cloud.ts` 的 inviter 校验
- 类型：`src/types/household.ts`（`CurrentProfile` / `UpdateProfileRequest` / `HouseholdMemberDisplay` 三个地方出现 `profilePreset`）
- 相关 fixture 测试：`tests/unit/edit-view.spec.ts`、`household-domain.spec.ts`、`household-cloud.spec.ts`、`household-store.spec.ts`、`invitation-domain.spec.ts`、`auth-store.spec.ts`

### Institutional Learnings

无 `docs/solutions/` 目录。计划不依赖历史 learnings。

### External References

不需要外部研究。`wd-img-cropper` 与 `wd-avatar` 已是项目现有依赖（`edit-view.spec.ts` 不依赖、`crop-avatar/index.vue` 已用 `wd-img-cropper`）；头像上传链路完全在仓库内。

## Key Technical Decisions

- **字段清理分两步走**（Unit 1 先于 Unit 2/3）：先在前端类型/服务 + 云函数删除 `profilePreset`，再改 UI。这样中间任何一次 commit 都能编译通过，代码可单独 review。
- **Picker 的 `modelValue` 新形状**：`{ kind: 'builtin'; id: BuiltinProfileAvatarId } | { kind: 'custom'; resourceId: string; digest: string }`，与 `ProfileAvatar` 类型完全一致。调用方用 `v-model:avatar` 直接绑 `ProfileAvatar`，避免组件内部再次做 union 转换。
- **"+ 格子"作为 Picker 内部状态**：`ProfileAvatarPicker` 内部根据 `modelValue?.kind` 决定"+"还是缩略图；调用方不需要新增 props。
- **"+" 格子位置**：固定放在第 5 个（4 个内置之后）。5 列等宽网格在 375px 视口下每格 ~74px、avatar 108rpx 仍可容纳。
- **打开页面时拉取自定义头像 URL**：调用 `getAvatarTemporaryUrl(profile.avatar.resourceId)`，存为本地 ref；失败回退到"+"。URL 临时性意味着每次进编辑页都重新拉，不跨页面缓存。
- **eventChannel 跨分包**：作物是 `subpackages/household/crop-avatar/index.vue` 的既有模式（`getOpenerEventChannel()` 在 `confirmCrop` 里 emit），与 edit-profile 同属 `subpackages/household` 同级分包，路径解析无问题。
- **老数据兼容**：云函数 `normaliseProfile` 在 Unit 1 删除 `profilePreset` 字段；老记录里的 `profilePreset` 字段在数据库里留着也不会被读/写，不会引发 `INVALID_REQUEST`。
- **"+" 格子 + 缩略图两态切换**：组件内根据 `modelValue?.kind === 'custom'` 决定渲染，调用方传 `null` 或 `undefined` 时显式渲染"+"。

## Open Questions

### Resolved During Planning

- 5 格网格每格尺寸：选择 5 列等宽（与 4 列内置风格一致）。375px 视口下每格约 74px，`108rpx` avatar (≈54px) 容纳无问题。
- 字段清理顺序：先做 Unit 1（数据/服务/类型），再做 Unit 2/3（UI），最后做 Unit 4（测试）。这样每步都能编译通过、可独立 review、可独立 revert。
- 自定义头像 URL 缓存策略：不缓存。每次进入 `edit-profile` 都重新拉临时 URL（`getAvatarTemporaryUrl` 已有超时控制）。
- 自定义头像 URL 拉取失败的处理：`uni.showToast` 提示"自定义头像暂时无法显示，请重新上传"；格子回退为"+"；草稿中的 `avatar` 字段保留 `kind: 'custom'`（不重置），用户可以再点"+" 重新走一遍流程。

### Deferred to Implementation

- 微信小程序环境下 `wd-img-cropper` 导出的本地临时路径是否可直接作为 `wd-avatar` 的 `src`：实现时若发现问题改为先 `uni.getFileInfo` 转换或预热。
- `eventChannel.emit('avatarApproved', { previewPath })` 的路径在 `getCurrentPages().at(-1)` 上解析为 `edit-profile`：当前 `crop-avatar/index.vue` 的 emit 方式已落地，跨分包同目录应当无问题，实现期若发现异常调整 channel 监听位置。
- 云函数在写入新 profile 时清理老 `profilePreset` 字段：使用 `repository.updateUser(identityKey, _.omit(profile, ['profilePreset']))` 之类的方式；具体 `lodash` API 在实现期确认。

## Implementation Units

- [ ] **Unit 1: 全栈删除 `profilePreset` 字段**

**Goal:** 让前端类型、服务、UI 和云函数都不再读写 `profilePreset`。老数据自然容错。

**Requirements:** R10, R11, R12, R13, R14, R15

**Dependencies:** 无（底层字段清理）

**Files:**
- Modify: `src/types/household.ts`
- Modify: `src/services/household-cloud.ts`
- Modify: `src/services/invitation-cloud.ts`
- Modify: `cloudfunctions/household/household-domain.js`
- Test: `tests/unit/household-cloud.spec.ts`
- Test: `tests/unit/household-domain.spec.ts`
- Test: `tests/unit/invitation-domain.spec.ts`
- Test: `tests/unit/household-store.spec.ts`
- Test: `tests/unit/auth-store.spec.ts`
- Test: `tests/unit/edit-view.spec.ts`

**Approach:**
- 1.1 `src/types/household.ts`：删除 `CurrentProfile['profilePreset']`、`HouseholdMemberDisplay.profilePreset`、`UpdateProfileRequest.profilePreset` 三个字段。`CurrentProfile` 简化为 `{ nickname; avatar: ProfileAvatar }`。
- 1.2 `src/services/household-cloud.ts`：`isMemberDisplay` / `isHouseholdResult` 中删除 `profilePreset` 校验；类型 cast 同步清理。
- 1.3 `src/services/invitation-cloud.ts`：inviter 校验里删除 `profilePreset` 字段读取。
- 1.4 `cloudfunctions/household/household-domain.js`：删除 `PROFILE_PRESETS` 常量；`normaliseProfile` 返回值去掉 `profilePreset`；`updateProfile` 不再校验/写 `profilePreset`。**保留** `if (isRenaming && ![DEFAULT_PROFILE_NAME, '小帅', '小美'].includes(nickname) && ...)` 的 `'小帅'` `'小美'` 豁免——这是改昵称时的内容安全跳过名单，与 `profilePreset` 字段无关，删除会导致用户改昵称为"小帅/小美"时误被 `checkText` 拦截。
- 1.5 fixture 测试：所有引用 `profilePreset: 'xiaoshuai' | 'xiaomei' | 'neutral' | 'random' | 'custom'` 的地方改为不带该字段。`updateProfileInCloud({...})` 的 fixture 同步移除 `profilePreset`。
- 1.6 `tests/unit/edit-view.spec.ts`：暂时不直接覆盖（profilePresets 还在 Unit 3 删），但 `hasProfileChanges` 的 fixture profile 去掉 `profilePreset` 字段。

**Patterns to follow:**
- `household-domain.js` 现有的 `safeAvatar` 风格：只保留页面需要的字段，不向外暴露内部细节。
- 前端 `household-cloud.ts` 的 `isMemberDisplay` 风格：白名单校验，不解析任何额外字段。

**Test scenarios:**
- Happy path: 现有 home/profile 返回结果中无 `profilePreset` 字段，被 `isHouseholdResult` 接受。
- Happy path: `updateProfileInCloud` 收到的输入没有 `profilePreset` 字段时，云函数正常处理（通过 mock service + 调用方 fixture 验证）。
- Edge case: 旧数据中残留 `profilePreset: 'xiaoshuai' | 'xiaomei'` 字段（mock 服务侧传入），云函数读 profile 时静默忽略、不抛 `INVALID_REQUEST`。
- Integration: `invitation-domain` 通过 inviter 渲染时不再需要 `profilePreset`。

**Verification:**
- 类型检查 `pnpm typecheck` 通过
- `pnpm test` 全部通过
- 仓库搜索 `profilePreset`、`xiaoshuai`、`xiaomei` 三个关键字，`src/` 与 `cloudfunctions/` 下命中数应为 0
- `tests/` 下命中数应为 0（fixture 已清理）

---

- [ ] **Unit 2: `ProfileAvatarPicker` 扩展支持自定义头像状态**

**Goal:** Picker 接受完整 `ProfileAvatar`（builtin 或 custom）作为 `modelValue`，5 格布局，无自定义时显示"+"格、有自定义时显示缩略图。

**Requirements:** R2, R3 (前半), R6

**Dependencies:** Unit 1（避免 `ProfileAvatar` 类型还在演进时同时改两处）

**Files:**
- Modify: `src/subpackages/household/components/ProfileAvatarPicker.vue`
- Test: `tests/unit/avatar-picker.spec.ts` (新建 — 当前没有 picket 组件测试)

**Approach:**
- 2.1 改 `modelValue` 类型为 `ProfileAvatar | null`（或 `null` 表示"无选中"），emit 类型同步。
- 2.2 模板渲染逻辑：
  - 4 个内置：`<button>` + `wd-avatar`，与现有风格一致。
  - 第 5 格：`<button>`，根据 `modelValue?.kind === 'custom'` 二选一——若是 custom 则渲染 `wd-avatar :src="customPreviewUrl"`（预览 URL 由父组件传入新 prop `customPreview?: string`）；否则渲染占位"+"图标 + "上传自定义"文字。
  - 选中态高亮：根据 `modelValue` 与每项的 id 匹配。
- 2.3 5 列等宽网格：`grid-template-columns: repeat(5, 1fr)`。标签字号略缩（22rpx 改 20rpx）以容纳 5 列。
- 2.4 当 `modelValue?.kind === 'custom'` 时，第 5 格的 `aria-label` 改为"我的自定义头像，点击重新上传"。

**Patterns to follow:**
- 现有 `ProfileAvatarPicker.vue` 的 grid + selected 边框风格。
- `wd-avatar` 已有用法（参考 `edit-profile/index.vue` 里 `customPreview` 那块）。

**Test scenarios:**
- Happy path: `v-model` 绑 `person-01` builtin，对应格子高亮。
- Happy path: `v-model` 绑 custom avatar + 传 `customPreview` 字符串，第 5 格渲染缩略图，aria-label 为"我的自定义头像"。
- Edge case: `v-model` 为 `null`（初始无选中），所有格子不高亮。
- Edge case: 点第 5 格 emit `update:modelValue` 时，若当前已是 custom，传回同样的 custom 对象；若不是，传回 `null`（让父组件决定跳转 crop-avatar）。
- 集成：父组件传 `customPreview` 缺失时，第 5 格降级为占位图（避免 src 为空导致 `wd-avatar` 渲染异常）。

**Verification:**
- 在 375px 视口的微信开发者工具中 5 列等宽且无溢出。
- 选中态在 builtin / custom 之间切换正常。
- 点第 5 格触发 `update:modelValue` 后父组件能识别"用户想上传/重新上传"。

---

- [ ] **Unit 3: `edit-profile` 页面改造 + 头像上传链路集成**

**Goal:** 把"快捷选择"整块删掉、把"稍后开放"提示删掉、把 Picker 接进去、把自定义头像的取/存/替/弃全流程跑通。

**Requirements:** R1, R3 (后半), R4, R5, R6, R7, R8

**Dependencies:** Unit 1 + Unit 2

**Files:**
- Modify: `src/subpackages/household/edit-profile/index.vue`
- Modify: `src/subpackages/household/edit-view.ts`（删 `profilePresets` 常量、改 `hasProfileChanges`）
- Test: `tests/unit/edit-profile.spec.ts` (新建 — 当前无此测试)

**Approach:**
- 3.1 `edit-view.ts`：
  - 删除 `profilePresets` 数组导出。
  - 改 `hasProfileChanges`：去掉 `saved.profilePreset !== draft.profilePreset` 这一项；只比 `nickname` 和 `avatar`。
  - `pickRandomProfileAvatar` 同步删除（不再有 UI 入口）。
- 3.2 `edit-profile/index.vue` 模板：
  - 删除"快捷选择"标题 + 3 个 `wd-button` + `selectPreset` / `selectRandom`。
  - 删除"自定义头像和微信资料稍后开放"灰底提示。
  - 删除"已通过检查的自定义头像"独立预览块（功能下沉到 Picker）。
  - `ProfileAvatarPicker` 改为接受完整 `ProfileAvatar`：`v-model:avatar="draftAvatar"`，并把"+"格点击通过新 prop 暴露出来（参考 `press-target` 模式，但本次用更简单的 `pick-mode` 字符串模式更直接）。
  - 实际接法：监听 `ProfileAvatarPicker` 的"+"点击事件 → 跳转 `crop-avatar?purpose=profile`，并通过 `eventChannel` 监听 `avatarApproved`。`eventChannel` 监听在 `onLoad` / `onShow` 注册。
- 3.3 `edit-profile/index.vue` script：
  - 删 `preset` ref、`selectPreset` / `selectRandom` / `markCustomAvatar` / `markCustomNickname`（保留 `markCustomNickname` 但改为只清错，不改 preset 字段）。
  - `draft` 改为 `{ nickname; avatar: ProfileAvatar }`，移除 `profilePreset`。
  - 新增 `customPreview` 逻辑：
    - 页面加载时若 `profile.avatar.kind === 'custom'`，调 `getAvatarTemporaryUrl(profile.avatar.resourceId)`，成功赋值给 `customPreview`；失败 toast 提示并把 `customPreview` 置空（Picker 第 5 格自动回退为"+"）。
  - 新增 `goToCrop` 逻辑：`uni.navigateTo({ url: '/subpackages/household/crop-avatar/index?purpose=profile' })`；用 `getOpenerEventChannel()` 注册 `avatarApproved` 监听，触发后把 `draftAvatar` 切到 custom、把 `customPreview` 设为 `event.previewPath`、toast 提示"已选择新头像"。
  - 退出页面（`onUnload`）清空 `eventChannel` 监听，避免 stale 回调。
- 3.4 加载态：保留现有 `loading` / `errorMessage` 机制；首次加载时 `customPreview` 为空，Picker 第 5 格显示"+"；待 `profile` 加载完再尝试拉 custom URL，避免空白闪烁。

**Patterns to follow:**
- `crop-avatar/index.vue` 已有的 `getOpenerEventChannel()` + `emit('avatarApproved', {...})` 模式。
- `household-store.ts` 的 `saveProfile` 现有调用方式（去掉 `profilePreset` 参数）。
- `pages/index/index.vue` 里的 `wd-avatar` 用法（看 `customPreview` 是否需要类似处理）。

**Test scenarios:**
- Happy path: 进入编辑页时若 `profile.avatar.kind === 'builtin'`，Picker 显示 4 内置 + 1"+"；第 5 格 aria-label 含"上传"。
- Happy path: 进入编辑页时若 `profile.avatar.kind === 'custom'`，页面调 `getAvatarTemporaryUrl` 一次，Picker 第 5 格显示缩略图。
- Happy path: 模拟 `eventChannel.emit('avatarApproved', { avatar: customAvatar, previewPath: 'wxfile://xxx' })`，`draftAvatar` 切到 custom、`customPreview` 设为该路径。
- Happy path: 已选中 custom 时再点第 5 格，跳 `crop-avatar` 重新上传，成功后替换（不是叠加）。
- Happy path: 选中 custom 后点任一内置头像，draft 切回 builtin，`customPreview` 清空。
- Edge case: `getAvatarTemporaryUrl` 抛错时 toast 提示，Picker 第 5 格降级为"+"，但 `profile.avatar` 仍保留 custom（下次拉取可能恢复）。
- Edge case: 用户进入 → 选"+" → crop-avatar 跳走但用户在裁剪页取消，回到编辑页时 `draftAvatar` 不变、未保存的内容不丢。
- Edge case: 用户上传成功但点"取消"放弃保存，自定义头像状态不入 store；下次进入页面读 `profile`（仍为旧值），draft 重新初始化。
- Integration: `save` 调用 `store.saveProfile(draft)`，请求体中**不**包含 `profilePreset` 字段（断言）。

**Verification:**
- 微信开发者工具实测：内置 → custom → 替换 → 放弃 → 保存 → 取消 五条路径都正确。
- 类型检查通过、单元测试通过。
- 视觉上"快捷选择"和"稍后开放"提示已不存在。

---

- [ ] **Unit 4: 测试更新 + 新增页面级测试**

**Goal:** 把 Unit 1–3 涉及的 fixture 全部对齐新契约；为 Picker / edit-profile 新增覆盖主流程的单元测试。

**Requirements:** R16, R17

**Dependencies:** Unit 1, 2, 3

**Files:**
- Modify: `tests/unit/edit-view.spec.ts`
- Create: `tests/unit/avatar-picker.spec.ts`
- Create: `tests/unit/edit-profile.spec.ts`
- (其它 Unit 1 涉及的文件已在 Unit 1 修改)

**Approach:**
- 4.1 `tests/unit/edit-view.spec.ts`：
  - 删除 `profilePresets` 相关引用（若没有则不动）。
  - `hasProfileChanges` 测试：去掉 `profilePreset` 维度，新加"仅 nickname 改 / 仅 avatar 改 / 都改 / 都不改"四条断言。
  - `pickRandomProfileAvatar` 相关测试删除（API 已删）。
- 4.2 `tests/unit/avatar-picker.spec.ts`（新建）：
  - 用 `@vue/test-utils` mount `ProfileAvatarPicker`，传 `modelValue` 与 `customPreview` 各种组合，断言渲染数量、aria-label、emit 行为。
- 4.3 `tests/unit/edit-profile.spec.ts`（新建）：
  - 用 mock store + mock `getAvatarTemporaryUrl` + mock eventChannel 跑 happy path 列表。
  - 覆盖 R4（eventChannel 监听）、R5（拉 URL 失败降级）、R6（custom 替换/放弃）、R7（未保存不持久化）。
  - 断言：调用 `store.saveProfile` 时入参不含 `profilePreset`。

**Patterns to follow:**
- 已有 `auth-store.spec.ts` / `household-store.spec.ts` 的 mock store 模式。
- 已有 `pinia-store.spec.ts` 里的 setActivePinia 写法。
- 已有 `home-view.spec.ts` / `edit-view.spec.ts` 里的 `@vue/test-utils` 组件 mount 风格。

**Test scenarios:**
- 已在 Unit 1/2/3 的 Test scenarios 列出，本单元不重复新增，主要是把分散的断言集中到 `edit-profile.spec.ts` 一个文件。

**Verification:**
- `pnpm test` 全绿。
- 新增的 `avatar-picker.spec.ts` 与 `edit-profile.spec.ts` 文件存在且每文件 ≥ 5 个 `it` 用例。

---

## System-Wide Impact

- **Interaction graph:**
  - `edit-profile` 跳转 `crop-avatar`（同 `subpackages/household`）—— 走 `getOpenerEventChannel` 通信。`crop-avatar` 本期**不变**（已支持 `purpose=profile`，emit `avatarApproved` 已有）。
  - `edit-profile` 调用 `getAvatarTemporaryUrl` —— `src/services/avatar-media.ts` 本期**不变**。
  - `edit-profile` 调用 `store.saveProfile(draft)` —— `household-store.ts` 的 `saveProfile` 签名去除 `profilePreset` 参数，调用方同步。
- **Error propagation:** 自定义头像 URL 拉取失败 → toast + Picker 降级为"+"；上传链路失败由 `crop-avatar` 自己处理（toast 后让用户重试或返回编辑页）。
- **State lifecycle risks:**
  - 用户上传成功但未保存退出：草稿不入 store，profile 保持原值；下次进入重新读 profile 初始化。
  - 用户上传成功保存后再次进编辑页：profile.avatar 是 custom，调 `getAvatarTemporaryUrl` 拉缩略图。临时 URL 过期再失败 → 降级为"+"，草稿不丢。
- **API surface parity:** `HouseholdMemberDisplay` 删 `profilePreset`；前端 `isMemberDisplay` / `isHouseholdResult` 校验同步删除。云端返回结构变化需要前后端同步上线，否则老版本前端会拒绝不带 `profilePreset` 的新响应（按当前校验严格度，**这其实没问题**——老前端没有本计划的新逻辑，仍校验 profilePreset 字段；新前端不校验，对老云端返回（带 profilePreset）会忽略多余字段。建议两端同时上线或前端先发版并接受老云端的"多余字段无害"语义）。
- **Integration coverage:** 必须验证的端到端场景：① 内置 → 上传 → 保存 → 跨端看到 custom 头像；② 上传 → 取消 → 不持久化；③ 上传 → 失败 → toast 降级。
- **Unchanged invariants:**
  - `crop-avatar` 的 `purpose=profile` 行为不变。
  - `avatar` 的 `kind: 'builtin' | 'custom'` 模型不变。
  - `getAvatarTemporaryUrl` 接口不变。
  - `saveProfile` 仍由 `household-store.ts` 持有；只是入参去掉 `profilePreset`。
  - 微信资料同步能力仍不在范围内（不引入新代码路径）。

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 前后端 `profilePreset` 字段契约不同步上线，老前端拒绝新云端响应（带 profilePreset）或老云端拒绝新前端请求（不带 profilePreset） | 当前 `isHouseholdResult` 对老云端响应（多带字段）会**忽略**多余字段，不算硬错误；新云端不校验 `profilePreset`，对老前端请求（多带字段）也只是不存。实际是平滑过渡，但建议 commit 顺序：先云端 + types，再前端 UI |
| `getAvatarTemporaryUrl` 临时 URL 过期时间短，二次进入编辑页频繁拉取对云函数压力 | 临时 URL 一般 2h 有效；用户进编辑页频率低，不构成压力。后续如需要可加 `uni.setStorage` 缓存 + 过期时间 |
| `eventChannel` 在分包间传递 `previewPath`（本地 `wxfile://` 路径）跨端渲染失败 | `crop-avatar` 现有实现已用 `previewPath` 作为 `wd-avatar src` 在原页（同分包）工作；`edit-profile` 接收后用同一个 src 应当一致。如发现渲染异常，回退方案是用 `getAvatarTemporaryUrl` 拉云端 URL 替换 |
| 老数据库 `profilePreset: 'xiaoshuai' | 'xiaomei'` 残留，UI 删了 preset 但 DB 还在 | 计划刻意"不主动迁移"；云函数不读不写就不影响。后续如有数据治理需求再清理 |
| `eventChannel` 在 `uni.navigateBack` 后未注销导致 stale 回调 | 在 `onUnload` 显式 `channel.off('avatarApproved')`（如果支持）或通过 `initialized` ref 守门 |

## Documentation / Operational Notes

- 不需要更新 README；本计划是用户可见 UI 优化 + 后端字段清理，对开发者影响写进 commit message 即可。
- 部署建议：先发云端（`cloudfunctions/household`）再发前端；后端先不校验 `profilePreset`、前端后改 UI，两端解耦。
- 监控：暂不新增；既有 `getAvatarTemporaryUrl` 失败通过 toast 反馈到用户即可。

## Sources & References

- **Origin document:** [docs/brainstorms/2026-08-27-custom-profile-avatar.md](../brainstorms/2026-08-27-custom-profile-avatar.md)
- 相关代码：
  - `subpackages/household/edit-profile/index.vue`（要改）
  - `subpackages/household/components/ProfileAvatarPicker.vue`（要改）
  - `subpackages/household/crop-avatar/index.vue`（参考，不动）
  - `subpackages/household/edit-view.ts`（要改）
  - `services/avatar-media.ts`（参考，不动）
  - `services/household-cloud.ts`（要改）
  - `services/invitation-cloud.ts`（要改）
  - `store/modules/household.ts`（小幅：saveProfile 入参）
  - `types/household.ts`（要改）
  - `cloudfunctions/household/household-domain.js`（要改）
- 相关测试：
  - `tests/unit/edit-view.spec.ts`（要改）
  - `tests/unit/household-cloud.spec.ts`（要改）
  - `tests/unit/household-domain.spec.ts`（要改）
  - `tests/unit/household-store.spec.ts`（要改）
  - `tests/unit/invitation-domain.spec.ts`（要改）
  - `tests/unit/auth-store.spec.ts`（要改）
  - `tests/unit/avatar-picker.spec.ts`（新建）
  - `tests/unit/edit-profile.spec.ts`（新建）
