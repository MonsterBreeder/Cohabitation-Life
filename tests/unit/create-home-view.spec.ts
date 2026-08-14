import { describeHouseholdName } from '../../src/subpackages/household/create-home/create-home-view'

describe('create home view state', () => {
  it('accepts and trims the default household name', () => {
    expect(describeHouseholdName('  我们的小家  ')).toEqual({
      valid: true,
      value: '我们的小家',
      remaining: 15,
      errorMessage: '',
    })
  })

  it.each([
    ['', '请输入家庭名称'],
    ['第一行\n第二行', '家庭名称不能换行'],
    ['一'.repeat(21), '家庭名称最多 20 个字'],
  ])('rejects invalid name %p', (value, errorMessage) => {
    expect(describeHouseholdName(value)).toMatchObject({ valid: false, errorMessage })
  })

  it('counts a joined emoji as one visible character', () => {
    expect(describeHouseholdName(`👨‍👩‍👧‍👦${'家'.repeat(19)}`)).toMatchObject({ valid: true, remaining: 0 })
  })
})
