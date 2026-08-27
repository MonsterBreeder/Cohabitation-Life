import { describeProfilePickerState, hasProfileChanges } from '../../src/subpackages/household/edit-view'

describe('个人头像选择器状态派生', () => {
  // 保护"哪一格高亮、第 5 格显示什么"这些视觉状态的判定：UI 直接消费该函数。
  it('未选中时所有内置不高亮，第 5 格降级为"+ 上传"', () => {
    expect(describeProfilePickerState(null)).toEqual({
      activeBuiltinId: null,
      isCustomSelected: false,
      hasCustomPreview: false,
      customLabel: '上传',
      customAriaLabel: '上传自定义头像',
    })
  })

  it('内置头像被选中时对应 builtin id 标记为 active', () => {
    const state = describeProfilePickerState({ kind: 'builtin', id: 'person-03' })
    expect(state.activeBuiltinId).toBe('person-03')
    expect(state.isCustomSelected).toBe(false)
  })

  it('custom 头像被选中且有预览 URL 时第 5 格显示缩略图', () => {
    const state = describeProfilePickerState(
      { kind: 'custom', resourceId: 'avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', digest: 'd'.repeat(64) },
      'https://example.com/x.png',
    )
    expect(state.activeBuiltinId).toBeNull()
    expect(state.isCustomSelected).toBe(true)
    expect(state.hasCustomPreview).toBe(true)
    expect(state.customLabel).toBe('我的头像')
    expect(state.customAriaLabel).toBe('我的自定义头像，点击重新上传')
  })

  it('custom 头像被选中但缺预览时第 5 格降级为占位，isCustomSelected 仍为 true', () => {
    const state = describeProfilePickerState(
      { kind: 'custom', resourceId: 'avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', digest: 'd'.repeat(64) },
    )
    expect(state.isCustomSelected).toBe(true)
    expect(state.hasCustomPreview).toBe(false)
    expect(state.customLabel).toBe('我的头像')
  })

  it('空字符串预览 URL 视为缺预览', () => {
    const state = describeProfilePickerState(
      { kind: 'custom', resourceId: 'avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', digest: 'd'.repeat(64) },
      '',
    )
    expect(state.hasCustomPreview).toBe(false)
  })
})

describe('hasProfileChanges 边界', () => {
  const base = { nickname: '小伙伴', avatar: { kind: 'builtin' as const, id: 'person-neutral' as const } }

  it('avatar 切换 builtin id 时识别为已修改', () => {
    expect(hasProfileChanges(base, { ...base, avatar: { kind: 'builtin', id: 'person-01' } })).toBe(true)
  })

  it('avatar 切换到 custom 时识别为已修改', () => {
    expect(hasProfileChanges(base, { ...base, avatar: { kind: 'custom', resourceId: 'avatar_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', digest: 'd'.repeat(64) } })).toBe(true)
  })

  it('完全相同的 draft 不算修改', () => {
    expect(hasProfileChanges(base, { ...base })).toBe(false)
  })
})
