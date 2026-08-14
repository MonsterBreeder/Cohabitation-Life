export type JoinMode = 'join' | 'transfer'

/** 根据当前真实家庭数决定确认文案；单人家庭不会被静默替换。 */
export function resolveJoinMode(memberCount?: number): JoinMode {
  return memberCount === 1 ? 'transfer' : 'join'
}

export function joinTitle(mode: JoinMode): string {
  return mode === 'transfer' ? '转入这个家' : '加入这个家'
}
