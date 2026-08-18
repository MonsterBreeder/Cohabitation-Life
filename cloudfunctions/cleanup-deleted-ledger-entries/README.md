# cleanup-deleted-ledger-entries

PRD 008：每日 03:00 物理清理 30 天前软删的家庭账目。

## 部署

1. 微信开发者工具 → 云开发 → 上传 `cleanup-deleted-ledger-entries` 云函数
2. 云开发控制台 → 云函数 → `cleanup-deleted-ledger-entries` → 「定时触发器」→ 开启
3. cron 表达式：`0 0 3 * * * *`（每日 03:00）

## 清理范围

- `ledgerEntries`：`deletedAt < now - 30d` 的所有账目
- `ledgerOperations`：上述账目关联的所有操作记录
- 云存储 `receipts/{householdId}/{entryId}.jpg`：上述账目的凭证图

## 错误处理

- 单条账目删除失败不阻塞其他条
- 云存储删除失败不影响整体清理结果（DB 记录已经被物理删除）
- 整体失败时返回 `{ ok: false, error: 'QUERY_FAILED' }`，云开发日志会打印详细堆栈

## 与 cleanup-deleted-tasks 的差异

- `cleanup-deleted-tasks` 清理 `tasks` / `taskOperations`
- `cleanup-deleted-ledger-entries` 清理 `ledgerEntries` / `ledgerOperations` + 云存储凭证图
