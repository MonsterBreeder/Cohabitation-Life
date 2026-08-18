---
date: 2026-08-19
topic: family-summary-notification
status: 草稿（待确认）
---

# PRD 009：家庭账目周报推送

## 问题与目标

PRD 008 家庭共同流水账上线后，下一个被反复提到的小事是**回顾**：

- 两人白天各自记各自的账，到周末没人主动去翻账本，时间一长对家里这个月花了多少钱就模糊了
- 想到"看看"的时候，往往要打开小程序 → 切到底部账本 tab → 翻月份 / 类目，**没人愿意主动做这个动作**——所以积累的"未读账目"越攒越多，最后又变成"算了不看了"
- 现实里大家接受"被动接收"（微信群里别人发的消息、公众号推送）远多于"主动查看"（每天打开账本看）

这期要补的就是**被动触达**：由云端按周期给每个家庭成员推一份"本周家庭账目汇总"，用户不需要主动打开账本就能保持对家庭开销的感知。

> 明确**不做**的事：AA / 月度预算 / 大额实时提醒 / 银行流水自动导入 / OCR 识别 / 跨家庭 / 与"事项"模块的自动联动 / 服务号 / 公众号模板消息。

PRD 005 ~ 008 一步一步把"共同记录"做完整（事项 / 编辑 / 评论 / 删除 / 流水账），PRD 009 把"主动查"变成"被动看"——继续沿着同一条"小步快跑"路线，不一次做太多。本 PRD 末尾的"不做清单"逐条列了暂不做的功能，避免后续被"顺手做了"。

## 核心规则

1. **MVP 范围只做"周报"**：每周日晚 8 点（北京时间 20:00）由云函数定时触发器主动推一份；其他周期（月报 / 大额实时提醒）暂不做。
2. **"周报"是一份结构化文案 + 4 个数据点**：
   - 本周支出总额
   - 本周收入总额
   - 本周 TOP 3 支出类目（含金额）
   - 较上周支出增减百分比（红 / 绿色显示，文字"比上周少 12%" / "比上周多 8%"）
3. **推送给家庭每个成员**：A、B 两位都各收到一份；同一家庭不同成员收到的内容**完全一样**（家庭共享账本，不区分个人），但每份都是各自的推送配额。
4. **必须用户主动订阅才能收**：云端不能"主动塞"消息；用户必须先在小程序里**手动点"订阅家庭周报"按钮**触发 `wx.requestSubscribeMessage`，同意后云端才能对该用户推一条。
5. **一次性订阅（不是长期订阅）**：用户订阅一次，云端可以推一条；下周要再收，**用户需要再点一次订阅**（每次订阅只发一条，限制来自微信平台，不是我们能改的）。MVP 阶段接受这个限制——长期订阅需要单独申请特殊模板，审批周期长，不在 MVP 范围。
6. **用户可以"取消订阅"**：在"我的"页提供"取消订阅家庭周报"按钮（实际只是把本地 `subscribedWeek` 标记清掉，云端并不知道；下次定时触发时如果用户没在订阅状态，就跳过这个用户）。这不是真正的微信"取消"，只是前端本地状态。
7. **不在账目变动时实时推送**：每次 A 记一笔账，**不会**触发给 B 推送"又记了一笔"；避免信息过载。周报节奏已经足够（用户接受"周末看一次"）。
8. **推送失败静默处理**：云端推某用户失败（用户已卸载小程序 / 模板被平台下架 / 配额用尽），不影响其他用户的推送；不弹错误、不写严重日志，只 console.warn 一行。
9. **不在"事件后"推送，不在"行为后"推送**：完全**定时 + 拉取**——云函数在固定时间从数据库读数据、生成文案、推送。每个用户的推送时间一致（都是周日 20:00），不个性化。
10. **触发器与推送函数分离**：
    - **触发器**：`cleanup-*-trigger`（云开发控制台配置）→ 每分钟扫一次，按当前时间判断是否到周日 20:00
    - **推送函数**：`family-notification` 云函数（独立函数）→ 接收 `{ trigger: 'weekly' }` 入参，从数据库读取所有家庭 + 周报数据 + 订阅状态，逐家推送
    - 触发器**只负责**调推送函数，**不写业务逻辑**——这样以后想改成"每两周"或"周三晚 9 点"只需要改触发器配置，不需要改函数

## 概念与字段

### 订阅状态（本地）

用户在小程序里"是否订阅家庭周报"由前端本地标记，不写云数据库。理由：微信订阅消息的状态以微信侧为准，前端不需要独立存一份；本地标记只是"我下次进首页时，要不要显示'订阅周报'按钮"。

| 字段 | 类型 | 存储位置 | 备注 |
| --- | --- | --- | --- |
| `subscribedWeek` | `string \| null` | `uni.setStorage` | 当前已订阅的"周标识"（`YYYY-Www`，如 `2026-W33`）；换周需要重新订阅 |

> 关键设计：**订阅状态**存在本地 storage，**不是**云数据库。云函数不知道哪些用户订阅了——它直接调 `cloud.openapi.subscribeMessage.send` 给"本家庭所有成员"，微信平台会自动拒绝未订阅的用户（不会报错，只是不发送）。

### 推送配额

| 字段 | 限制 | 备注 |
| --- | --- | --- |
| 单次 `wx.requestSubscribeMessage` 可订阅模板数 | ≤ 3 | MVP 只需要 1 个模板（"家庭周报"） |
| 一次性订阅有效期 | 长期 | 但每次订阅只允许发 1 条消息 |
| 单用户单模板推送配额 | 无限（一次性订阅用完即失效） | 用户每次推送后需要重新订阅 |

### 周报文案模板

云端生成文案的固定结构（5 个字段，按顺序渲染）：

```
【家庭周报】2026-08-16 ~ 2026-08-22

支出 ¥234.50 | 收入 ¥0.00

· 餐饮 ¥120.00
· 居家 ¥80.00
· 交通 ¥34.50

比上周少 12%
```

| 字段 | 数据来源 | 备注 |
| --- | --- | --- |
| 日期范围 | 固定：上周日 00:00 ~ 本周日 19:59（北京时间） | 文案固定写死"上周日到本周日"；不显示具体日期，让文案稳定 |
| 支出 / 收入 | `ledgerEntries` 聚合（按 type 分组求和） | 整数分（`amountCents`）÷ 100；空时显示 `¥0.00` |
| TOP 3 类目 | 同聚合，按金额倒序，取前 3 | 类目名查 `ledgerCategories`（按 categoryId 关联）；同金额按类目 sortOrder 升序 |
| 增减百分比 | `本周支出` vs `上周支出` | 计算 `(this - last) / last * 100`；上周为 0 显示"持平"；本周为 0 显示"本周无支出"；last 为 0 时不显示百分比（避免除以 0） |

### 触发器配置

云开发控制台 → 云函数 → `family-notification` → 触发器管理：

| 字段 | 值 | 备注 |
| --- | --- | --- |
| 名称 | `weeklyReport` | |
| 类型 | `timer` | |
| Cron 表达式 | `0 0 20 * * 0 *` | 每周日 20:00（云开发 cron 6 字段格式：秒 分 时 日 月 周） |
| 入参 | `{ "trigger": "weekly" }` | 业务函数根据 trigger 字段判断做什么 |

**为什么用"每分钟扫一次"的 trigger 而不是直接 cron**：
云开发 cron 触发器是按 cron 表达式触发的，但**多个家庭 / 多个用户**在同 1 分钟内集中推送可能触发 WeChat API rate limit。MVP 阶段先简化，**直接 cron 在 20:00 触发**；如果以后发现 rate limit 问题再拆。

### 推送函数接口

**`family-notification` 云函数入参**（由触发器调用）：

```js
{ trigger: 'weekly' }   // 未来扩展为 'monthly' / 'instant' 等
```

**返回**（云函数日志可看，前端不调用）：

```js
{
  status: 'OK',
  trigger: 'weekly',
  householdsProcessed: 12,
  pushAttempts: 24,     // 12 户 × 2 人
  pushSuccesses: 20,    // 微信拒了 4 个（用户未订阅 / 配额用尽）
  pushFailures: 4,
  durationMs: 1830
}
```

### 推送模板（云开发后台申请）

需要在微信公众平台后台申请**一次性订阅消息模板**，字段：

| 模板字段 | 类型 | 必填 | 备注 |
| --- | --- | --- | --- |
| `thing1` | 字符串 | 是 | 日期范围 + 标题（"2026-08-16 ~ 2026-08-22 家庭账目"） |
| `amount2` | 数字 | 是 | 支出金额（带 ¥ 符号） |
| `amount3` | 数字 | 是 | 收入金额（带 ¥ 符号） |
| `thing4` | 字符串 | 是 | TOP 1-3 类目列表（用 / 分隔） |
| `thing5` | 字符串 | 是 | 增减百分比描述 |

> **微信模板字段有强类型限制**：`thing` 限 ≤ 20 字符，`amount` 限 ≤ 6 位有效数字。如果文案超过限制，云端必须做截断或省略号处理（在推送函数里写）。

## 数据流

### 订阅流程（前端发起）

```
[我的页]
  用户点"订阅家庭周报"按钮
     ↓
  uni.setStorage('subscribedWeek', 当前周标识)
     ↓
  wx.requestSubscribeMessage({ tmplIds: ['TEMPLATE_ID'] })
     ↓
  用户同意 → 微信返回 accept
     ↓
  显示 toast "已订阅，本周日晚 8 点推送"
```

### 推送流程（云端触发）

```
每周日 20:00 触发器
     ↓
family-notification({ trigger: 'weekly' })
     ↓
1. 查所有 active 家庭（households 表 memberKeys.length > 0 且未删除）
2. 对每个家庭：
   a. 查本周 / 上周的 ledgerEntries 聚合
   b. 按家庭 ID 查所有成员 openid（从 households.memberKeys + users 集合关联）
   c. 调 cloud.openapi.subscribeMessage.send 给每个成员
   d. 记录成功 / 失败数
3. 汇总结果写日志
```

### 用户取消订阅（前端发起）

```
[我的页]
  用户点"取消订阅"按钮
     ↓
  uni.removeStorage('subscribedWeek')
     ↓
  显示 toast "已取消订阅"
（云端不知道也不需要知道；下次推送时微信会自动跳过该用户）
```

## 核心规则（细化）

### 11. 时间窗定义

- **本周**：`上周日 00:00:00` ~ `本周日 19:59:59`（北京时间，**不含**本周日 20:00 起的部分——这部分留给推送本身）
- **上周**：`上上周日 00:00:00` ~ `上周日 19:59:59`
- **为什么含 20:00 不含 20:00**：让"周报"覆盖的账目范围与触发推送的时间**不重叠**——如果用户周日 20:00 记了一笔账，这笔账在**下周**的周报里，不在**本周**的周报里。这样语义清晰。

### 12. 增减百分比计算

```js
const thisWeek = aggregateThisWeek(entries)
const lastWeek = aggregateLastWeek(entries)

let changeText = '—'
if (lastWeek.expense > 0 && thisWeek.expense > 0) {
  const diff = (thisWeek.expense - lastWeek.expense) / lastWeek.expense
  if (diff > 0) changeText = `比上周多 ${Math.round(Math.abs(diff) * 100)}%`
  else if (diff < 0) changeText = `比上周少 ${Math.round(Math.abs(diff) * 100)}%`
  else changeText = '与上周持平'
} else if (thisWeek.expense === 0) {
  changeText = '本周无支出'
}
// lastWeek.expense === 0 && thisWeek.expense > 0 不显示百分比（避免除以 0）
```

### 13. TOP 类目聚合

```js
const categorySums = entries.reduce((acc, e) => {
  if (e.type !== 'expense') return acc
  acc[e.categoryId] = (acc[e.categoryId] || 0) + e.amountCents
  return acc
}, {})

const sorted = Object.entries(categorySums)
  .sort(([, a], [, b]) => b - a)  // 金额倒序
  .slice(0, 3)
  .map(([categoryId, cents]) => {
    const cat = categoriesById[categoryId]
    return `${cat.name} ¥${(cents / 100).toFixed(2)}`
  })
  .join(' / ')
```

空时显示 `本周无支出`。

### 14. 推送失败处理

```js
try {
  await cloud.openapi.subscribeMessage.send({ ... })
  pushSuccesses++
} catch (err) {
  if (err.errCode === 40003) {
    // user not subscribed — 静默跳过
  } else {
    pushFailures++
    console.warn('subscribeMessage failed', { openid, err })
  }
}
```

**不向用户弹错误**：推送是后台行为，用户感知不到；不弹错误避免误导。

### 15. 模板字段截断

```js
function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

const payload = {
  thing1: truncate(`家庭账目 本周`, 20),
  amount2: truncate(`¥${thisWeek.expense.toFixed(2)}`, 6),
  amount3: truncate(`¥${thisWeek.income.toFixed(2)}`, 6),
  thing4: truncate(topCategories, 20),
  thing5: truncate(changeText, 20),
}
```

## 权限与安全

- **推送函数权限**：`cloud.openapi.subscribeMessage.send` 必须在 `cloud.init({ env }).has` 检查的权限列表中；需要在云开发控制台 → 云函数 → `family-notification` → 权限管理里**手动添加**这个 API。
- **数据范围**：推送函数只读 `ledgerEntries` / `ledgerCategories` / `households` / `users`；不写任何数据（推送是副作用，不留业务记录）。
- **不收集 openid**：推送函数从 `households.memberKeys` 拿 memberKey（内部键），再查 `users` 集合找 `openid`（微信推送必须用 openid）；openid 不会被传到函数返回里。
- **错误日志不写 openid**：失败的 console.warn 只写 memberKey 和 errCode；不写 openid 到日志（避免日志被泄露时 openid 跟着泄露）。

## 边界场景

| 场景 | 行为 |
| --- | --- |
| 用户周日 20:00 之后记了一笔账 | 算入"下周"的周报，不算入"本周" |
| 家庭只有 1 个成员 | 也推送（云端不判断"家庭人数"）；单人家庭推送给自己 |
| 家庭没有 ledgerCategories（initCategories 没跑） | 推送函数的"查类目"返回空对象，TOP 类目显示"无类目数据"；不报错 |
| 家庭有 ledgerCategories 但本周无账目 | 显示"本周无支出"；不显示增减百分比 |
| 家庭 ledgerEntries 超过 1000 条 | 查询时分页，每页 100 条；聚合时合并所有页（不影响统计结果） |
| 用户当前不在"我的"页或"账本"页 | 推送是后台行为，不影响用户在哪个页面；用户切回时本地 `subscribedWeek` 仍然有效 |
| 用户清空微信缓存 / 重新登录 | 微信 openid 会变；新 openid 重新订阅后用新 openid 推送；旧 openid 推送会被静默拒绝（errCode 40003） |
| 用户卸载小程序 | 微信直接拒绝推送（不是错误，是正常情况） |
| 周报文案超过模板字段字数限制 | 截断到 ≤20 字符 + `…`；不抛错 |

## 不做清单（明确边界，避免后续被"顺手做了"）

- ❌ **月度报告**：等周报 MVP 跑稳再加，避免一次做太多
- ❌ **大额账目实时提醒**（单笔 > ¥500 立即推给双方）：与"周报"语义重叠，且容易信息过载
- ❌ **长期性订阅**：需要微信平台单独申请，审批周期长；MVP 用一次性订阅够用
- ❌ **服务号 / 公众号模板消息**：MVP 不引新通道；需要企业主体认证
- ❌ **跨家庭周报**：MVP 每个家庭独立推送；不做"邻里"或"好友"的横向比较
- ❌ **个性化推荐**（"你最近常买咖啡"）：越界（家庭账本是共享数据，不做个人画像）
- ❌ **预算 / 限额提醒**：PRD 008 明确不做；PRD 009 也不做
- ❌ **银行 / 微信支付 / 支付宝账单自动导入**：需要用户授权第三方数据，复杂度高
- ❌ **OCR 识别凭证图**：PRD 008 明确不做；PRD 009 也不做
- ❌ **与"事项"模块联动**（事项完成触发账目、账目触发事项）：保持模块解耦
- ❌ **修改周报文案样式 / 增加图表 / 增加新数据点**：MVP 锁定 4 个数据点（支出/收入/TOP3/增减%）；后续基于用户反馈再加
- ❌ **推送时区定制**（不同时区家庭不同时间推送）：MVP 全用北京时间 20:00
- ❌ **用户主动触发"立即生成"周报**：MVP 只有定时；不提供"现在就看"按钮
- ❌ **服务端存订阅状态**：本地 storage 存，不上云（避免多端同步 / 清理问题）

## 双账号验收路径（15 条）

> MVP 验收需要两个不同微信账号（A 创建家庭 + 邀请 B），跑通下面 15 条。

| # | 路径 | 预期 |
| --- | --- | --- |
| 23 | **订阅周报**。A 在"我的"页点"订阅家庭周报"按钮 → 弹出授权窗 → 同意 → 看到 toast "已订阅，本周日晚 8 点推送" | 微信侧 A 的订阅状态生效（errCode 0） |
| 24 | **未订阅不会被推**。B 没点订阅按钮 → 周日 20:00 触发推送 → B 没收到周报 | 微信侧静默拒绝（errCode 40003） |
| 25 | **周报文案正确（空账周）**。A 订阅了，**本周**没记过任何账目 → 触发时收到"本周无支出" | 文案符合"无支出时降级展示" |
| 26 | **周报文案正确（有账周）**。A 订阅了，本周记了 5 笔账（餐饮 100、交通 50、居家 80、餐饮 60、收入 200）→ 收到支出 ¥290 / 收入 ¥200 / TOP 餐饮 ¥160 / 居家 ¥80 / 交通 ¥50 | 文案四数据点正确 |
| 27 | **TOP 类目截断**。A 一周记 20 笔账、跨 5 个类目 → 周报只显示 TOP 3 金额最高的 3 个 | 不显示第 4 / 第 5 |
| 28 | **双方都收**。A 和 B 都订阅了 → 周日 20:00 → A 收到 + B 收到 | 两条独立推送（不是一条群发） |
| 29 | **金额增减百分比正确**。A 本周支出 ¥100 / 上周支出 ¥50 → 周报显示"比上周多 100%"；本周 ¥50 / 上周 ¥50 → "与上周持平" | 文案与数据匹配 |
| 30 | **本周无支出不显示百分比**。A 本周支出 ¥0 / 上周支出 ¥100 → 周报显示"本周无支出"，不显示百分比 | 文案降级到最少信息 |
| 31 | **模板字段截断**。A TOP 类目名超 20 字符（不会发生因为类目名限 8 字；但推送字段可能因多家合算超长）→ 截断 + `…` | 不超模板字段字数限制 |
| 32 | **推送失败不影响其他用户**。A 在 20:00 后立刻卸载小程序 → B 在 20:01 仍能收到周报 | A 失败静默，B 成功 |
| 33 | **周日 20:00 之后记的账算下周**。A 周日 20:30 记了一笔 ¥50 → 下周日 20:00 的周报里包含这 ¥50 | 时间窗正确（20:00 后的账算下周） |
| 34 | **取消订阅**。A 订阅了 → 点"取消订阅"按钮 → storage 清掉 → 下周日推送时 A 不会被推 | 取消后不收周报 |
| 35 | **重新订阅**。A 取消后再次点"订阅家庭周报" → 重新弹出授权窗（可能需要用户重新同意）→ 下周日能收到 | 取消后能重新订阅 |
| 36 | **周报覆盖家庭无类目场景**。A 删了所有 ledgerCategories（PRD 008 类目删除要求"无账目引用"） → 推送时 TOP 类目为空 → 文案显示"无类目数据"，不报错 | 优雅降级 |
| 37 | **新加入家庭成员第几周能收到**。A 邀请 B → B 加入时**当前周已订阅过** → 当周周报 B 也能收到吗？→ 看 B 加入时是否点了订阅（没点就收不到），与 PRD 009 无关 | 仅验证"加入后第几周订阅"流程 |

## 数据流

### 触发器 → 推送函数

```
[云开发触发器 weeklyReport cron 0 0 20 * * 0 *]
  ↓ 每个周日 20:00
[family-notification({ trigger: 'weekly' })]
  ↓
1. db.collection('households').where({ deletedAt: null, memberCount: gt(0) }).get()
2. for each household:
   - lastWeekEntries = db.collection('ledgerEntries').where({ householdId, type: 'expense', occurredAt: between(lastWeekStart, lastWeekEnd), deletedAt: null }).get()
   - thisWeekEntries = db.collection('ledgerEntries').where({ householdId, type: 'expense', occurredAt: between(thisWeekStart, thisWeekEnd), deletedAt: null }).get()
   - categories = db.collection('ledgerCategories').where({ householdId, deletedAt: null }).get()
   - report = generateReport(thisWeekEntries, lastWeekEntries, categories)
   - for each memberKey in household.memberKeys:
     - openid = db.collection('users').doc(memberKey).openid
     - cloud.openapi.subscribeMessage.send({ touser: openid, templateId, data: report })
3. console.log({ status: 'OK', ...stats })
```

## 核心数据流图（用户视角）

```
[我的页]
  "订阅家庭周报" 按钮
        ↓ 点击
  wx.requestSubscribeMessage({ tmplIds: ['TEMPLATE_ID'] })
        ↓ 弹窗
  用户点"允许" / "取消"
        ↓ 允许
  uni.setStorage('subscribedWeek', '2026-W33')
  toast "已订阅，本周日晚 8 点推送"
        ↓
  [周日 20:00 触发器]
  family-notification({ trigger: 'weekly' })
        ↓ 遍历家庭
  cloud.openapi.subscribeMessage.send(...)
        ↓ 成功
  [微信] 用户在微信"服务通知"看到周报
```

## 验收（自动化）

- 云函数单元测试：
  - 调 `family-notification({ trigger: 'weekly' })` 用 in-memory 仓库
  - 验证对"本周有 / 无 / 部分 / 跨多类目"账目家庭的文案生成
  - 验证对"无类目家庭" / "0 账目家庭" 优雅降级
  - 验证时间窗正确（周日 20:00 后记的账不算本周）
  - 验证模板字段截断（超 20 字符 / 6 数字）
- 前端单元测试：
  - 订阅按钮触发 `wx.requestSubscribeMessage` 调用
  - 订阅成功 / 失败的 toast
  - 取消订阅清 storage
  - "我的"页订阅状态显示（已订阅 / 未订阅）
- e2e 双账号：
  - 15 条验收路径（见上）

## 部署清单

1. **云函数**：
   - 上传 `cloudfunctions/family-notification` 云函数源码
   - 在云开发控制台 → 云函数 → `family-notification` → 触发器管理 → 创建触发器：
     - 名称：`weeklyReport`
     - 类型：`timer`
     - Cron：`0 0 20 * * 0 *`
     - 入参：`{ "trigger": "weekly" }`
   - 在云函数权限管理里手动添加 `subscribeMessage.send`（在 `cloud.openapi` 下）
2. **微信公众平台**：
   - 申请"一次性订阅消息"模板（5 个字段：thing1 / amount2 / amount3 / thing4 / thing5）
   - 审批通过后得到 `templateId`，写进 `cloudfunctions/family-notification/config.json`
3. **前端**：
   - "我的"页新增"订阅家庭周报"按钮 + 订阅状态展示
   - `services/family-notification-cloud.ts` 封装订阅 / 取消订阅的 RPC

## 关联模块

- **PRD 008 家庭共同流水账**：周报数据来源（ledgerEntries / ledgerCategories / households）
- **PRD 005 ~ 007 共同事项**：周报**不**引用 taskIds；保持模块解耦

## 未来扩展（不在 PRD 009 范围）

- 月度报告（月初 1 号 20:00 推送）
- 大额账目实时提醒（单笔 > 某金额 → 立即推送给双方）
- 长期性订阅（需要申请特殊模板）
- 服务号 / 公众号模板消息（跨通道）
- 用户主动触发"现在就看"按钮
- 多家庭 / 跨家庭 / 好友横向比较

## 与其他 PRD 的边界

| 模块 | 边界 |
| --- | --- |
| PRD 008 家庭共同流水账 | PRD 009 **只读** ledgerEntries / ledgerCategories；不写账目数据 |
| PRD 005 ~ 007 共同事项 | PRD 009 **不引用** taskIds；保持模块独立 |
| PRD 004 邀请 | PRD 009 不参与邀请流程；新成员需要自己点"订阅" |
| PRD 001 登录 | PRD 009 推送依赖 openid（用户在 PRD 001 登录后才有） |

## 文档

- 实施计划：`docs/plans/2026-08-19-001-feat-family-summary-notification-plan.md`（待写）
- API 文档：`cloudfunctions/family-notification/README.md`（待写）
- 双账号验收路径：见上文"双账号验收路径"小节
