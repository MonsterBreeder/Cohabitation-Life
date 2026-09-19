const { cleanupExpired } = require('../../cloudfunctions/cleanup-footprint-data/cleanup')

describe('cleanup footprint data', () => {
  it('deletes expired entries and media independently', async () => {
    const deleted: string[] = []
    const result = await cleanupExpired(
      { now: '2026-09-02', entryCutoff: '2026-08-03', limit: 200 },
      {
        findExpiredEntries: async () => [{ _id: 'entry-1' }],
        findExpiredMedia: async () => [{ _id: 'media-1' }],
        findExpiredRoutes: async () => [{ _id: 'route-1' }],
        deleteEntry: async (item: any) => {
          deleted.push(item._id)
        },
        deleteMedia: async (item: any) => {
          deleted.push(item._id)
        },
        deleteRoute: async (item: any) => {
          deleted.push(item._id)
        },
      },
    )
    expect(result).toMatchObject({ ok: true, entriesDeleted: 1, mediaDeleted: 1, routesDeleted: 1 })
    expect(deleted).toEqual(['entry-1', 'media-1', 'route-1'])
  })

  it('keeps processing after one item fails', async () => {
    const deleted: string[] = []
    const result = await cleanupExpired(
      { now: '2026-09-02', entryCutoff: '2026-08-03', limit: 200 },
      {
        findExpiredEntries: async () => [{ _id: 'bad' }, { _id: 'good' }],
        findExpiredMedia: async () => [],
        deleteEntry: async (item: any) => {
          if (item._id === 'bad') throw new Error('fail')
          deleted.push(item._id)
        },
        deleteMedia: async () => undefined,
      },
    )
    expect(result.ok).toBe(false)
    expect(deleted).toEqual(['good'])
  })
})
