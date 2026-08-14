import { resolveEntryRoute } from '../../src/services/entry-router'

// 保护所有有限状态都有唯一且安全的页面去向。
describe('resolveEntryRoute', () => {
  it.each([
    ['NEED_LOGIN', 'login', undefined],
    ['CREATE_HOME', 'create-home', undefined],
    ['JOIN_CONFIRM', 'join-home', undefined],
    ['TRANSFER_CONFIRM', 'join-home', undefined],
    ['HOME', 'home', undefined],
    ['ALREADY_IN_HOME', 'home', 'already_in_home'],
    ['INVITE_INVALID', 'invite-status', 'invite_invalid'],
    ['INVITE_EXPIRED', 'invite-status', 'invite_expired'],
    ['INVITE_USED', 'invite-status', 'invite_used'],
    ['HOME_FULL', 'invite-status', 'home_full'],
    ['REMOVED_FROM_HOME', 'create-home', 'removed_from_home'],
  ])('maps %s to its fixed destination', (status, page, notice) => {
    expect(resolveEntryRoute(status)).toMatchObject({
      type: 'relaunch',
      page,
      ...(notice ? { notice } : {}),
    })
  })

  it('keeps temporary failures on the current page', () => {
    expect(resolveEntryRoute('TEMPORARY_FAILURE')).toEqual({ type: 'none' })
  })

  it.each([undefined, null, '', 'UNKNOWN_STATUS'])('rejects an unknown status: %p', (status) => {
    expect(resolveEntryRoute(status)).toEqual({ type: 'none' })
  })

  it('does not expose extra input fields in the navigation decision', () => {
    const result = resolveEntryRoute({ status: 'HOME', userId: 'forged-user', householdId: 'forged-home' })

    expect(result).toEqual({ type: 'none' })
  })
})
