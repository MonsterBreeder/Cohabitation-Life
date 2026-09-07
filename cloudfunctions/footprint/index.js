// 足迹云函数入口。客户端只传操作意图，真实身份和当前家庭始终由微信上下文与云端数据确认。
const crypto = require('crypto')
const cloud = require('wx-server-sdk')
const cloudbase = require('@cloudbase/node-sdk')
const cloudbaseStorage = require('@cloudbase/node-sdk/lib/storage')
const { createRepository } = require('./repository-data')
const domain = require('./footprint-domain')
const media = require('./footprint-media')
const { checkImage, checkText } = require('./content-safety')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
let storageApp
// 沿用家庭头像的预约地址解析方式，客户端上传前便能登记待清理文件。
async function resolveFileID(cloudPath) {
  if (!storageApp) storageApp = cloudbase.init({ env: process.env.TCB_ENV || process.env.SCF_NAMESPACE })
  const metadata = await cloudbaseStorage.getUploadMetadata(storageApp, { cloudPath })
  const fileID = metadata?.data?.fileId
  if (typeof fileID !== 'string' || !fileID.startsWith('cloud://') || !fileID.endsWith(`/${cloudPath}`)) throw new Error('照片预约地址不可用')
  return fileID
}

function dependencies(context) {
  const identityKey = `user_${crypto.createHash('sha256').update(`${context.APPID}:${context.OPENID}`).digest('hex')}`
  const repository = createRepository(db)
  return {
    identityKey, openId: context.OPENID, repository, now: () => new Date(),
    ownerHash: crypto.createHash('sha256').update(identityKey).digest('hex').slice(0, 32),
    since: () => new Date(Date.now() - 24 * 60 * 60 * 1000),
    expiry: () => new Date(Date.now() + 2 * 60 * 60 * 1000),
    checkText: (content) => checkText(content, context.OPENID, 2, cloud.openapi),
    checkImage: async (buffer, openId, mime) => (await checkImage(buffer, openId, cloud.openapi, mime)) === 'approved',
    storage: {
      resolveFileID,
      download: (fileID) => cloud.downloadFile({ fileID }),
      upload: (cloudPath, fileContent) => cloud.uploadFile({ cloudPath, fileContent }),
      remove: (fileList) => cloud.deleteFile({ fileList }),
      tempUrls: async (fileList) => {
        const result = await cloud.getTempFileURL({ fileList })
        return Object.fromEntries((result.fileList || []).filter((item) => item.tempFileURL).map((item) => [item.fileID, item.tempFileURL]))
      },
    },
  }
}

const actions = {
  getSummary: domain.getSummary,
  getOverview: domain.getOverview,
  listEntries: domain.listEntries,
  listPlaces: domain.listPlaces,
  getEntry: domain.getEntry,
  createEntry: domain.createEntry,
  updateEntry: domain.updateEntry,
  deleteEntry: domain.deleteEntry,
  acknowledgeHistoryNotice: domain.acknowledgeHistoryNotice,
  preparePhoto: media.preparePhoto,
  reviewPhoto: media.reviewPhoto,
  getPhotoUrls: media.getPhotoUrls,
  abandonPhotos: media.abandonPhotos,
}

function humanise(code) {
  if (code === 'NO_HOME') return '请先创建或加入一个家'
  if (code === 'FOOTPRINT_CONFLICT') return '这条足迹刚刚被更新，请确认最新内容后重试'
  if (code === 'FOOTPRINT_CONTENT_REJECTED') return '地点或回忆中包含暂时无法保存的内容'
  if (code === 'FOOTPRINT_MEDIA_REJECTED') return '照片未通过安全检查，请更换照片'
  if (code === 'FOOTPRINT_RATE_LIMITED') return '今天处理的照片较多，请稍后再试'
  if (code === 'FOOTPRINT_INVALID') return '足迹内容不完整或格式不正确'
  if (code === 'TEMPORARY_FAILURE') return '暂时无法完成足迹操作，请稍后重试'
  if (code === 'FOOTPRINT_MEDIA_INVALID') return '照片已过期或无法使用，请重新选择'
  return '足迹不存在或已不可访问'
}

exports.main = async (event) => {
  try {
    if (!event || Buffer.byteLength(JSON.stringify(event)) > 16000) throw new domain.FootprintDomainError('FOOTPRINT_INVALID')
    const action = Object.hasOwn(actions, event.action) ? actions[event.action] : null
    if (!action) throw new domain.FootprintDomainError('FOOTPRINT_INVALID')
    const context = cloud.getWXContext()
    if (!context.OPENID || !context.APPID) throw new domain.FootprintDomainError('NO_HOME')
    return await action(event, dependencies(context))
  } catch (error) {
    if (error instanceof domain.FootprintDomainError) {
      return { status: error.code, retryable: error.retryable, errorMessage: humanise(error.code) }
    }
    console.error('footprint action failed', { action: event?.action, message: error instanceof Error ? error.message : String(error) })
    return { status: 'TEMPORARY_FAILURE', retryable: true, errorMessage: '暂时无法完成足迹操作，请稍后重试' }
  }
}
