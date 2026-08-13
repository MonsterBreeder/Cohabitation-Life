/**
 * 安全读取字符串类型的本地数据。
 * 本地数据只用于恢复界面状态，不能作为用户权限依据。
 */
export function getStringStorage(key: string): string | undefined {
  try {
    const value = uni.getStorageSync(key)
    return typeof value === 'string' && value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * 保存或删除字符串类型的本地数据。
 * 写入失败时保持静默，调用方仍然以云端结果为准。
 */
export function setStringStorage(key: string, value?: string): void {
  try {
    if (value === undefined) uni.removeStorageSync(key)
    else uni.setStorageSync(key, value)
  } catch {
    // 本地保存失败不改变业务判断，下一次启动会重新获取可信状态。
  }
}
