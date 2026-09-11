---
title: 邀请预览公开契约收紧：自定义头像走短时 https URL + token 版本号作废迟到响应
date: 2026-09-12
category: security-issues
module: invitation-system
problem_type: security_issue
component: authentication
severity: high
symptoms:
  - 公开 `previewInvite` 接口返回的资源 ID 字段可被滥用为长期可访问的存储地址
  - 用户快速切换邀请或并发请求时，旧请求的迟到响应会覆盖新邀请的展示
  - 邀请摘要的日志/错误文案可能意外携带邀请原文或资源标识
root_cause: wrong_api
resolution_type: code_fix
tags: [invitation, token-versioning, race-condition, short-lived-url, information-disclosure, wechat-cloud]
---

# 邀请预览公开契约收紧：自定义头像走短时 https URL + token 版本号作废迟到响应

## Problem

`household` 云函数的 `previewInvite` 是公开接口（不需要用户身份），用于"未开始用户点开分享链接后看到邀请人 + 家庭 + 成员数"。原实现存在三个安全/正确性问题：

1. **自定义头像直接返回 `{ kind: 'custom', resourceId, digest }`**：resourceId 配合云存储可生成长期访问链接，违反"邀请凭证授权的短时访问"语义
2. **没有请求版本控制**：用户连续打开两个邀请、或预览请求被网络重排时，旧请求的迟到响应会覆盖新邀请的展示内容
3. **预览返回字段过宽**：包含内部 family 编号、家庭头像资源、成员列表等不应暴露给非成员的内容

## Symptoms

- `cloudfunctions/household/invitation-domain.js:109-111` 原 `previewInvitation` 直接返回 `safeProfile(user).avatar`，对自定义头像只保留 builtin 判断，自定义时退化为默认；好处是不会泄露，坏处是邀请摘要永远看不到邀请人真实头像
- `src/store/modules/invitation.ts` 原 `previewInvite` action 没有版本号，依赖 store 内的 `preview` ref；并发切换时最后一次写入的预览会覆盖之前的
- `src/services/invitation-cloud.ts` `isResult` 校验 `kind: 'inviter?.avatar'` 只判断 `Boolean(result.inviter.avatar)`，没有白名单 kind

## What Didn't Work

- **直接返回 safeProfile 的 avatar**：自动退化为默认头像，UX 不好但安全 — 决定改为只在云端换取短时 URL，失败时仍退化为默认
- **基于 promise.race 的客户端超时**：太复杂，且不能解决迟到响应问题 — 改用 token + version 双重校验
- **服务端版本号绑定**：单设备多 tab 时仍会有 race；最终用"每次新调用都 bump version + 校验 token 仍匹配"

## Solution

### 1. 云端把自定义头像换短时 https URL

`cloudfunctions/household/invitation-domain.js` 新增 `safePreviewInviter`：

```javascript
async function safePreviewInviter(user, dependencies) {
  const nickname = typeof user?.nickname === 'string' && user.nickname.trim() ? user.nickname.trim() : '小伙伴'
  if (user?.avatar?.kind === 'builtin') {
    return { nickname, avatar: user.avatar }
  }
  if (
    user?.avatar?.kind === 'custom'
    && typeof user.avatar.resourceId === 'string'
    && user.avatar.resourceId.length > 0
    && dependencies
    && typeof dependencies.tempUrl === 'function'
  ) {
    try {
      const result = await dependencies.tempUrl([user.avatar.resourceId])
      const fileList = Array.isArray(result && result.fileList) ? result.fileList : []
      const entry = fileList[0]
      const url = entry && entry.tempFileURL
      if (entry && entry.status === 0 && typeof url === 'string' && url.startsWith('https://') && !url.includes('cloud://') && !url.includes('tcb-qcloud.com')) {
        return { nickname, avatar: { kind: 'temp', url } }
      }
    } catch (error) {
      if (dependencies && typeof dependencies.logTempUrlFailure === 'function') {
        dependencies.logTempUrlFailure(user.avatar.resourceId, error)
      }
    }
  }
  return { nickname, avatar: DEFAULT_PROFILE_AVATAR }
}
```

URL 校验拒绝 `cloud://` 和 `tcb-qcloud.com` 防止误暴露存储路径。失败时返回默认头像，邀请本身仍有效。

`household/index.js` 在主 handler 注入 `tempUrl` 与 `logTempUrlFailure`：

```javascript
const dependencies = {
  identityKey,
  repository,
  now: () => new Date(),
  createHouseholdId: () => `home_${crypto.randomBytes(16).toString('hex')}`,
  checkText: (content) => checkText(content, context.OPENID, 1, cloud.openapi),
  tempUrl: (fileList) => cloud.getTempFileURL({ fileList }),
  logTempUrlFailure: (resourceId, error) => {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('invite preview temp url failed', { resourceId, message })
  },
}
```

### 2. 客户端用 token + version 双重作废

`src/store/modules/invitation.ts`：

```typescript
state: () => ({
  // ...
  preview: undefined as Extract<InvitationResult, { status: 'INVITE_PREVIEW' }> | undefined,
  previewToken: undefined as string | undefined,    // 当前预览绑定的凭证
  previewVersion: 0,                                 // 单调递增，每次新预览 bump
  // ...
}),

async previewInvite(inviteToken: string): Promise<InvitationResult | undefined> {
  if (this.phase !== 'idle' && this.phase !== 'previewing' && this.phase !== 'failed') return undefined
  const version = this.previewVersion + 1
  this.previewVersion = version
  this.previewToken = inviteToken
  this.phase = 'previewing'
  this.errorMessage = undefined
  this.preview = undefined
  try {
    const result = await previewInvitationInCloud(inviteToken)
    if (this.previewVersion !== version) return undefined          // 已被新请求接管
    if (this.previewToken !== inviteToken) return undefined          // token 已被换
    this.result = result
    this.preview = result.status === 'INVITE_PREVIEW' ? result : undefined
    this.phase = 'idle'
    return result
  } catch {
    if (this.previewVersion !== version || this.previewToken !== inviteToken) return undefined
    this.phase = 'failed'
    this.errorMessage = '暂时无法确认这份邀请，请稍后重试'
    return undefined
  }
}
```

### 3. 客户端 `isResult` 拒绝 custom / 不可信 URL

`src/services/invitation-cloud.ts`：

```typescript
function isPreviewAvatar(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const avatar = value as { kind?: unknown; id?: unknown; url?: unknown }
  if (avatar.kind === 'builtin') {
    return typeof avatar.id === 'string' && BUILTIN_PROFILE_AVATAR_IDS.has(avatar.id)
  }
  if (avatar.kind === 'temp') {
    return typeof avatar.url === 'string'
      && avatar.url.startsWith('https://')
      && !avatar.url.includes('cloud://')
      && !avatar.url.includes('tcb-qcloud.com')
  }
  return false
}
```

`isResult` 改为 `isPreviewAvatar(result.inviter?.avatar)`，其它 kind 一律拒绝。

### 4. 公开类型与 `kind` 严格对齐

`src/types/invitation.ts` 新增 `PreviewAvatar = BuiltinAvatar | TempAvatar`（不含 `CustomAvatar`），让前端任何引用都拿不到 custom 形态。

## Why This Works

- **资源不可长期复用**：`cloud.getTempFileURL` 返回的链接带签名 + 过期时间，过期后失效。恶意用户即便拿到 URL 也只能用一段时间
- **无 race**：旧请求即使网络延迟返回，写入前 version + token 双重校验不通过；新请求的 preview 不会被覆盖
- **最小披露**：`PreviewAvatar` 类型只接受 builtin + temp，编译期就排除 custom 泄露
- **失败安全**：tempUrl 失败 → 默认头像；版本不匹配 → 静默丢弃；邀请 token 失效 → 自动清除。任意一环失败都降级，不破坏邀请核心流程

## Prevention

### 测试覆盖（已加 7+2 个）

- `tests/unit/invitation-domain.spec.ts`：3 个新测试覆盖 builtin / custom-ok / custom-fail / cloud-scheme 拒绝
- `tests/unit/invitation-cloud.spec.ts`：6 个拒绝用例（custom / 非白名单 / http / cloud:// / unknown kind / 缺失）+ 2 个接受用例
- `tests/unit/invitation-store.spec.ts`：4 个 store 测试覆盖迟到达 / 失败响应的版本作废

### 单测断言模板

```typescript
// 任何返回 inviter.avatar 的代码路径，都应跑这个断言
const inviter = (result as { inviter: { avatar: Record<string, unknown> } }).inviter.avatar
expect(inviter).not.toHaveProperty('resourceId')
expect(inviter).not.toHaveProperty('digest')
expect(inviter).not.toHaveProperty('kind', 'custom')
```

### 审计清单（review 时必看）

- [ ] 公开接口响应里没有 `resourceId` / `digest` / `householdId` / `userId` / `_id`
- [ ] 所有自定义头像响应只剩 `{ kind: 'temp', url }` 且 url 校验通过
- [ ] 错误文案 / 日志 / 测试夹具里没有邀请原文（32+ 位 base64url 串）
- [ ] 任何 store action 写状态前都校验版本号

### 反例：不要在公开响应里返回 custom resourceId

```javascript
// 错误示范
return {
  status: 'INVITE_PREVIEW',
  household: safeHousehold(home),
  inviter: { nickname, avatar: user.avatar },  // 包含 { kind: 'custom', resourceId }
}

// 正确
return {
  status: 'INVITE_PREVIEW',
  household: safeHousehold(home),
  inviter: await safePreviewInviter(user, dependencies),  // temp url 或默认
}
```

## Related

- `docs/solutions/security-issues/`（同类后续）
- `docs/plans/2026-09-11-001-feat-first-use-experience-plan.md` U2 单元
- `cloudfunctions/household/invitation-domain.js`（主实现位置）
- `src/types/invitation.ts`（`PreviewAvatar` / `TempAvatar` 类型）
- `AGENTS.md` 第 75-79 行（数据与安全原则）
