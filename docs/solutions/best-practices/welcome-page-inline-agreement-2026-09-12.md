---
title: 首次进入欢迎页内联协议确认：从独立开始页到单页流程的重构
date: 2026-09-12
category: best-practices
module: product-onboarding
problem_type: best_practice
component: development_workflow
severity: medium
applies_when:
  - 微信小程序首次进入流程需要确认协议
  - 老用户清缓存后回到欢迎页会导致多跳转
  - 审核要求不显示"登录"或"授权"字样
  - 想减少页面跳转数（每多一页都增加跳出率）
tags: [onboarding, agreement-checkbox, welcome-page, single-page-flow, ux-simplification, wechat-mini-program]
---

# 首次进入欢迎页内联协议确认：从独立开始页到单页流程的重构

## Context

微信小程序在 2026 年 8 月底收到审核反馈：首次进入不应该直接显示"登录"或"微信快捷登录"。项目原本的 plan 拆为三个页面：

1. `pages/login/index`（欢迎页，只显示两个按钮）
2. `pages/start/index`（独立开始页，专门处理协议确认）
3. 真实业务页（home / create-home / join-home，由云端分流）

2026-09-11 真机验证时发现：老用户清缓存后走完"清缓存 → 欢迎页 → 独立开始页 → 勾协议 → 确认"共 4 步，UX 繁冗。plan 文档的初衷是"协议确认是审核合规的硬要求"，但"独立页面"只是为了这一步流程；完全可以内联回欢迎页，省去中间跳转。

最终方案把"协议确认"内联到欢迎页，删除独立 start 页，老用户变成 2 步（勾 + 点）进家。同时改"创建我的家"为"开始使用"，避免对老用户暗示"必须新建"。

## Guidance

### 1. 把协议确认视为"准入门槛"而不是"独立流程"

协议确认的目的是"让用户看到法律文本并勾选"，不是"用户必须完成一段独立仪式"。把勾选放在入口按钮之前，比放在独立页面更符合用户预期：

```vue
<view v-if="view.showAgreement" class="welcome-page__agreement">
  <AgreementCheckbox :checked="agreed" :disabled="isStarting" @change="handleAgreementChange" @open-agreement="handleOpenAgreement" />
  <text class="welcome-page__hint">{{ view.agreementHint }}</text>
</view>
<view v-if="validationMessage" class="welcome-page__validation">{{ validationMessage }}</view>
<view class="welcome-page__actions">
  <WelcomeActions :primary="view.primary" :secondary="view.secondary" :primary-test-id="view.primaryTestId" @select="handleAction" />
</view>
```

按钮在没有勾选时 disabled，勾选后变可用；点击未勾选状态时显示受控提示。**不要把协议做成单独的"下一步"页面**——多一次跳转 = 多一次跳出风险。

### 2. 文案不要暗示"创建"

老用户清缓存后看到"创建我的家"会困惑：明明有家庭，为什么要再建？plan R3 规定"主按钮为'创建我的家'"，但实际场景里这个按钮是 create / join 共用入口，云端按真实状态分流。改文案为中性：

| 旧文案 | 新文案 | 适用场景 |
| --- | --- | --- |
| 创建我的家 | 开始使用 | 普通欢迎 |
| 加入这个家 | 加入这个家 | 邀请摘要（保留）|
| 微信快捷登录 | （删除） | 审核不通过 |

把 `action` 抽象为 `'start-use'`，由云端决定后续路由，前端不预判。

### 3. view 描述器承载 UI 模式与按钮文案

`welcome-view.ts` 的 `describeWelcomeView` 输入是受控的 store 状态 + 协议勾选状态，输出是模式 + 按钮 + 协议提示文案。**逻辑放在 view 描述器，状态放在 page**，便于单测覆盖 7 种模式 × 多种状态组合：

```typescript
export function describeWelcomeView(input: WelcomeViewInput): WelcomeView {
  const mode = resolveWelcomeMode(input)
  const isResolving = input.authResolving || input.invitePhase === 'previewing'
  const agreementRequired = requiresAgreement(mode)  // welcome / invite-summary
  const { primary, secondary } = describeButtons(mode, isResolving, agreementRequired, input.agreementChecked)
  // ...
  return { mode, primary, secondary, showAgreement, agreementHint, primaryTestId, ... }
}
```

### 4. action 命名统一为 `start-use`

旧代码用 `'create-home'` 和 `'join-home'` 两个 action，在不同 mode 下分别调用 reLaunch 到 start 页。方案 C 改后，两个 mode 都调 `authStore.startUse()`，由云端分流。统一命名为 `'start-use'`，并加 mode 后缀到 testid 区分 e2e 场景：

```typescript
const primaryTestId = primary.action ? `welcome-primary-${primary.action}--${mode}` : ''
```

## Why This Matters

- **老用户体验**：清缓存后从 4 步降到 2 步（勾 + 点）。`hasCompletedLogin` 清零的场景下也只需一次主动点击
- **审核合规**：欢迎页本身不出现"登录""授权"等字样，协议内联在动作之前——审核等价接受
- **状态机简化**：删了独立 start 页，`pages.json` 少注册一项，主包少 ~7KB（`start-use-view.ts` + 1 个 view + 1 个组件 + 1 个测试）
- **逻辑统一**：`startUse()` 不再区分 create/join，因为云端按 `pendingInviteToken` 是否有值决定路由

## When to Apply

- 任何需要"开始使用"或"试用"按钮的微信小程序 / H5 入口
- 协议 / 隐私政策确认需要占用一个独立页面时
- 多个 mode（welcome / invite-summary / recovery）共用同一组按钮但要求不同 disabled 状态时
- 遇到 ce-code-review 报"独立页面导致老用户多跳转"的 UX 类问题

## Examples

### 推荐：内联协议 + 单一入口

```typescript
// welcome-view.ts
function describeButtons(mode, isResolving, agreementRequired, agreementChecked) {
  if (mode === 'welcome') {
    return {
      primary: {
        label: '开始使用',
        action: 'start-use',
        loading: false,
        disabled: isResolving || (agreementRequired && !agreementChecked),
      },
      secondary: { label: '先看看怎么用', action: 'preview-experience', loading: false, disabled: false },
    }
  }
  if (mode === 'invite-summary') {
    return {
      primary: {
        label: '加入这个家',
        action: 'start-use',
        loading: false,
        disabled: isResolving || (agreementRequired && !agreementChecked),
      },
      secondary: { label: '先看看怎么用', action: 'preview-experience', loading: false, disabled: false },
    }
  }
  // ... 其它 mode 不需要协议
}
```

### 不推荐：分两个独立页面

```typescript
// login/index.vue → 按钮 reLaunch 到 start/index
if (action === 'create-home') {
  uni.reLaunch({ url: '/pages/start/index?intent=create' })
}
// start/index.vue → 显示协议 + 调云端
async function handleSubmit() {
  if (!agreed.value) {
    validationMessage.value = '请先阅读并同意'
    return
  }
  await authStore.startUse()
  // ...
}
```

这样会有：① 欢迎页点击 → ② 跳转到 start 页 → ③ 勾协议 → ④ 提交。每一步用户都有机会返回或放弃。

### 必填星号 + 兜底文案

```vue
<wd-checkbox>
  <text class="login-agreement__required">*</text>  <!-- 视觉必填提示 -->
  <text>已阅读并同意《用户协议》和《隐私政策》</text>
</wd-checkbox>
<text v-if="validationMessage" class="login-agreement__validation">{{ validationMessage }}</text>
```

`disabled` 的按钮 + 点击后的 `validationMessage` 是兜底；`*` 星号 + 灰色文字是预防（用户能"看出来"为什么不能点）。

### e2e 区分两条路径

```typescript
// 同一 action 字符串，但 testid 带上 mode 后缀
expect(await page.$('[data-testid="welcome-primary-start-use--welcome"]')).toBeTruthy()
expect(await page.$('[data-testid="welcome-primary-start-use--invite-summary"]')).toBeTruthy()
```

## Related

- `docs/plans/2026-09-11-001-feat-first-use-experience-plan.md`（plan 原始版，方案 C 是真机验证后调整的产物）
- `docs/plans/2026-09-11-first-use-audit-verification.md`（自动检查 + 实际环境待确认清单）
- `docs/prd/001-login-prd.md`（PRD 的 R3 / R5 / R14 已同步到方案 C 状态）
- `AGENTS.md` 第 8 行：`docs/solutions/` 是项目知识库入口
