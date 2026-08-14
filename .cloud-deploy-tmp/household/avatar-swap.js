class AvatarSwapError extends Error { constructor(code) { super(code); this.code = code } }

async function swapHouseholdAvatar(input, transaction, now) {
  const current = await transaction.getHousehold(input.householdId)
  if (!current || !Array.isArray(current.memberKeys) || !current.memberKeys.includes(input.identityKey)) throw new AvatarSwapError('NO_HOME')
  await transaction.updateHousehold(input.householdId, input.data)
  const oldId = current.avatar?.kind === 'custom' ? current.avatar.resourceId : null
  if (oldId && oldId !== input.data.avatar.resourceId) await transaction.markReplacedIfUnreferenced(oldId, now, input.householdId, input.identityKey)
}

async function swapProfileAvatar(input, transaction, now) {
  const home = await transaction.getHousehold(input.householdId)
  if (!home || !Array.isArray(home.memberKeys) || !home.memberKeys.includes(input.identityKey)) throw new AvatarSwapError('NO_HOME')
  const current = await transaction.getUser(input.identityKey)
  await transaction.updateUser(input.identityKey, input.data)
  const oldId = current?.avatar?.kind === 'custom' ? current.avatar.resourceId : null
  if (oldId && oldId !== input.data.avatar.resourceId) await transaction.markReplacedIfUnreferenced(oldId, now, home._id, input.identityKey)
}

module.exports = { swapHouseholdAvatar, swapProfileAvatar, AvatarSwapError }
