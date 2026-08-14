declare function require(path: string): any
const { swapHouseholdAvatar, swapProfileAvatar } = require('../../cloudfunctions/household/avatar-swap')

function custom(id: string) { return { kind: 'custom', resourceId: id, digest: 'a'.repeat(64) } }

describe('avatar profile swap transaction', () => {
  it('updates household and marks only the avatar replaced by the committed write', async () => {
    const state: any = { household: { _id: 'home', memberKeys: ['user'], avatar: custom('old') }, replaced: [] }
    const tx = {
      getHousehold: async () => structuredClone(state.household),
      updateHousehold: async (_id: string, data: any) => { state.household = { ...state.household, ...data } },
      markReplacedIfUnreferenced: async (id: string) => { if (state.household.avatar.resourceId !== id) state.replaced.push(id) },
    }
    await swapHouseholdAvatar({ householdId: 'home', identityKey: 'user', data: { name: '家', avatar: custom('new') } }, tx, new Date())
    expect(state.household.avatar.resourceId).toBe('new'); expect(state.replaced).toEqual(['old'])
  })

  it('serializes concurrent household writes without marking the winning avatar replaced', async () => {
    const state: any = { household: { _id: 'home', memberKeys: ['user'], avatar: custom('old') }, replaced: [] }
    let queue = Promise.resolve()
    const run = (id: string) => {
      const result = queue.then(() => swapHouseholdAvatar({ householdId: 'home', identityKey: 'user', data: { avatar: custom(id) } }, {
        getHousehold: async () => structuredClone(state.household),
        updateHousehold: async (_: string, data: any) => { state.household = { ...state.household, ...data } },
        markReplacedIfUnreferenced: async (old: string) => { if (state.household.avatar.resourceId !== old) state.replaced.push(old) },
      }, new Date()))
      queue = result.then(() => undefined); return result
    }
    await Promise.all([run('first'), run('winner')])
    expect(state.household.avatar.resourceId).toBe('winner')
    expect(state.replaced).toEqual(['old', 'first'])
    expect(state.replaced).not.toContain('winner')
  })

  it('updates own profile only while a single household membership exists', async () => {
    const state: any = { user: { avatar: custom('old') }, replaced: [] }
    const tx = { getHousehold: async () => ({ _id: 'home', memberKeys: ['user'] }), getUser: async () => state.user, updateUser: async (_: string, data: any) => { state.user = data }, markReplacedIfUnreferenced: async (id: string) => state.replaced.push(id) }
    await swapProfileAvatar({ householdId: 'home', identityKey: 'user', data: { nickname: '昵称', avatar: custom('new') } }, tx, new Date())
    expect(state.user.avatar.resourceId).toBe('new'); expect(state.replaced).toEqual(['old'])
    await expect(swapProfileAvatar({ householdId: 'home', identityKey: 'other', data: { avatar: custom('x') } }, tx, new Date())).rejects.toMatchObject({ code: 'NO_HOME' })
  })
})
export {}
