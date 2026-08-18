import {
  describeCategoryRowActions,
  describeCategorySections,
  describeRemoveDialog,
  describeRenameDialog,
} from '../../src/subpackages/ledger/ledger-category-manager/ledger-category-manager-view'
import type { LedgerCategory } from '../../src/types/ledger'

function makeCategory(overrides: Partial<LedgerCategory> = {}): LedgerCategory {
  return {
    id: 'cat_xxxxxxxxxxxxx_1',
    key: 'dining',
    name: '餐饮',
    iconKey: 'fork-spoon',
    colorKey: 'amber',
    isCustom: false,
    sortOrder: 0,
    ...overrides,
  }
}

describe('describeCategoryRowActions', () => {
  it('preset category: only hide', () => {
    const cat = makeCategory({ isCustom: false })
    const actions = describeCategoryRowActions(cat, false, 5)
    expect(actions.rename).toBe(false)
    expect(actions.hide).toBe(true)
    expect(actions.unhide).toBe(false)
    expect(actions.remove).toBe(false)
  })

  it('custom category: rename + remove when no ref', () => {
    const cat = makeCategory({ isCustom: true })
    const actions = describeCategoryRowActions(cat, false, 0)
    expect(actions.rename).toBe(true)
    expect(actions.remove).toBe(true)
  })

  it('custom category in use: no remove', () => {
    const cat = makeCategory({ isCustom: true })
    const actions = describeCategoryRowActions(cat, false, 3)
    expect(actions.remove).toBe(false)
  })

  it('hiddenByMe: unhide instead of hide', () => {
    const cat = makeCategory({ isCustom: false })
    const actions = describeCategoryRowActions(cat, true, 0)
    expect(actions.hide).toBe(false)
    expect(actions.unhide).toBe(true)
  })
})

describe('describeCategorySections', () => {
  it('splits preset and custom', () => {
    const sections = describeCategorySections(
      [makeCategory({ isCustom: false }), makeCategory({ id: 'cat_xxxxxxxxxxxxx_2', isCustom: false })],
      [makeCategory({ id: 'cat_xxxxxxxxxxxxx_3', isCustom: true })],
    )
    expect(sections).toHaveLength(2)
    expect(sections[0].title).toBe('系统预设')
    expect(sections[0].categories).toHaveLength(2)
    expect(sections[1].title).toBe('我的自定义')
    expect(sections[1].categories).toHaveLength(1)
  })
})

describe('describeRenameDialog / describeRemoveDialog', () => {
  it('rename dialog has initial name', () => {
    const cat = makeCategory({ name: '宠物' })
    const d = describeRenameDialog(cat)
    expect(d.title).toContain('宠物')
    expect(d.initial).toBe('宠物')
  })

  it('rename dialog empty for null', () => {
    expect(describeRenameDialog(null).initial).toBe('')
  })

  it('remove dialog has message', () => {
    const cat = makeCategory({ name: '宠物' })
    const d = describeRemoveDialog(cat)
    expect(d.title).toContain('宠物')
    expect(d.message).toContain('无法恢复')
  })

  it('remove dialog empty for null', () => {
    expect(describeRemoveDialog(null).message).toBe('确定删除？')
  })
})
