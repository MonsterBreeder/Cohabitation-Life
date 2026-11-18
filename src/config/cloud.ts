// 在微信开发者工具创建测试云环境后，将环境编号填入这里。
// 环境编号不是密钥；留空时应用会停在当前页并提示配置未完成。
export const cloudEnvironmentId = 'cloud1-d6gzpujfy221ba36d'
// 手机验收构建连接独立的 Node 20 预览函数。
export const lifeChatPreviewFunctionName = 'life-chat-preview-v20'

/** 判断测试云环境是否已经完成配置。 */
export function hasCloudEnvironment(): boolean {
  return cloudEnvironmentId.trim().length > 0
}
