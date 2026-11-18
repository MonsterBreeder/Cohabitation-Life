// 文件用途：微信扫码验收的聊天和记账共用一次性总额度，跨日和重新部署都沿用原登记。
const { createHash } = require('node:crypto')
const { readDocument } = require('./chat-store')

const previewLimit = 6
const previewStage = 'life-chat-phone-preview-2026-11-17'

// 在发送模型前登记，无法确认登记结果时由调用方停止发送。
async function reservePreviewRequest(db, householdId, identityKey) {
  const id = createHash('sha256').update(`${previewStage}:${householdId}`).digest('hex')
  return db.runTransaction(async (transaction) => {
    const household = await readDocument(transaction.collection('households'), householdId)
    if (!Array.isArray(household?.memberKeys) || !household.memberKeys.includes(identityKey)) return false

    const usage = transaction.collection('ledgerAiDailyUsage')
    const record = await readDocument(usage, id)
    const count = record ? record.count : 0
    if (record && (record.stage !== previewStage || record.householdId !== householdId)) return false
    if (!Number.isSafeInteger(count) || count < 0 || count >= previewLimit) return false

    await usage.doc(id).set({ data: { stage: previewStage, householdId, count: count + 1 } })
    return true
  })
}

module.exports = { reservePreviewRequest }
