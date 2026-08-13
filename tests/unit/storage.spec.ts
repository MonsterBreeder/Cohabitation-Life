import { getStringStorage, setStringStorage } from '../../src/utils/storage'

// 保护通用本地存储工具对异常值和平台错误保持安全。
describe('storage utils', () => {
  const runtime = globalThis as typeof globalThis & { uni?: unknown }
  const originalUni = runtime.uni
  const getStorageSync = jest.fn()
  const setStorageSync = jest.fn()
  const removeStorageSync = jest.fn()

  beforeEach(() => {
    getStorageSync.mockReset()
    setStorageSync.mockReset()
    removeStorageSync.mockReset()
    Object.assign(runtime, {
      uni: { getStorageSync, setStorageSync, removeStorageSync },
    })
  })

  afterAll(() => {
    // 恢复测试前的平台对象，避免通用工具测试污染其他模块。
    Object.assign(runtime, { uni: originalUni })
  })

  it('returns only a non-empty string', () => {
    getStorageSync.mockReturnValueOnce('saved-value').mockReturnValueOnce({ invalid: true })

    expect(getStringStorage('first')).toBe('saved-value')
    expect(getStringStorage('second')).toBeUndefined()
  })

  it('writes a string and removes an undefined value', () => {
    setStringStorage('saved', 'value')
    setStringStorage('removed')

    expect(setStorageSync).toHaveBeenCalledWith('saved', 'value')
    expect(removeStorageSync).toHaveBeenCalledWith('removed')
  })

  it('does not throw when the platform storage fails', () => {
    getStorageSync.mockImplementation(() => { throw new Error('storage unavailable') })
    setStorageSync.mockImplementation(() => { throw new Error('storage unavailable') })

    expect(getStringStorage('failed')).toBeUndefined()
    expect(() => setStringStorage('failed', 'value')).not.toThrow()
  })
})
