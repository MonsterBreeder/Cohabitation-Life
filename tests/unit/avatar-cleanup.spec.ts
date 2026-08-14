declare function require(path: string): any
const { cleanupExpired } = require('../../cloudfunctions/cleanup-avatar-media/cleanup')
describe('avatar cleanup', () => {
  it('is idempotent, skips referenced media and continues after one failure', async () => {
    const records = [{ _id: 'used', formalPath: 'used' }, { _id: 'bad', stagingPath: 'bad' }, { _id: 'old', stagingPath: 'old' }]
    const removed: string[] = []; const deleted = new Set<string>(); const retried = new Set<string>()
    const deps = { isReferenced: async (id: string) => id === 'used', remove: async ([path]: string[]) => { if (path === 'bad') throw new Error('fail'); removed.push(path) }, markDeleted: async (id: string) => deleted.add(id), markRetry: async (id: string) => retried.add(id) }
    await expect(cleanupExpired(records, deps)).resolves.toEqual({ scanned: 3, deleted: 1, failed: 1 })
    expect(removed).toEqual(['old']); expect(deleted).toEqual(new Set(['old'])); expect(retried).toEqual(new Set(['bad']))
  })
})
export {}
