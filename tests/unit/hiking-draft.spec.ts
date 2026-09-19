// 保护本机草稿恢复：坏数据不能被当成可继续记录的内容。
import { createHikingDraftStore } from '../../src/utils/hiking-draft'

describe('徒步本机草稿', () => {
  it('保存、恢复和清除最近完整草稿', () => {
    const values = new Map<string, string>()
    const storage = {
      get: (key: string) => values.get(key) ?? null,
      set: (key: string, value: string) => values.set(key, value),
      remove: (key: string) => values.delete(key),
    }
    const store = createHikingDraftStore<{ name: string }>(storage)
    store.save({ name: '周末山路' }, new Date('2026-09-17T08:00:00.000Z'))
    expect(store.load()).toEqual({
      version: 1,
      updatedAt: '2026-09-17T08:00:00.000Z',
      payload: { name: '周末山路' },
    })
    store.clear()
    expect(store.load()).toBeNull()
  })

  it('拒绝损坏和未来版本草稿', () => {
    let raw = '{bad'
    const storage = {
      get: () => raw,
      set: (_key: string, value: string) => {
        raw = value
      },
      remove: () => {
        raw = ''
      },
    }
    const store = createHikingDraftStore(storage)
    expect(store.load()).toBeNull()
    raw = JSON.stringify({ version: 2, updatedAt: 'later', payload: {} })
    expect(store.load()).toBeNull()
  })
})
