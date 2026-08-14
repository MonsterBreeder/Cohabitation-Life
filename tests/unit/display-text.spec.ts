import { countDisplayCharacters, normaliseDisplayText, validateDisplayText } from '../../src/utils/display-text'

declare function require(path: string): { countDisplayCharacters(value: string): number }
const cloudDisplayText = require('../../cloudfunctions/household/display-text')

describe('display text', () => {
  it.each([
    ['中文', 2],
    ['👍🏽', 1],
    ['👨‍👩‍👧‍👦', 1],
    ['e\u0301', 1],
  ])('counts %s as %i visible characters', (value, expected) => {
    expect(countDisplayCharacters(value)).toBe(expected)
    expect(cloudDisplayText.countDisplayCharacters(value)).toBe(expected)
  })

  it('trims surrounding spaces without changing inner spaces', () => {
    expect(normaliseDisplayText('  我们 的家  ')).toBe('我们 的家')
  })

  it.each(['', '   ', '第一行\n第二行', '第一行\r第二行'])('rejects empty or multiline text: %p', (value) => {
    expect(validateDisplayText(value, 20).valid).toBe(false)
  })

  it('accepts exact boundaries and rejects one complete character beyond them', () => {
    expect(validateDisplayText('家'.repeat(20), 20)).toMatchObject({ valid: true, count: 20 })
    expect(validateDisplayText('家'.repeat(21), 20)).toMatchObject({ valid: false, reason: 'too_long', count: 21 })
    expect(validateDisplayText('👍🏽'.repeat(12), 12)).toMatchObject({ valid: true, count: 12 })
    expect(validateDisplayText('👍🏽'.repeat(13), 12)).toMatchObject({ valid: false, reason: 'too_long', count: 13 })
  })

  it('在手机没有 Intl 时仍能校验昵称', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Intl')
    Object.defineProperty(globalThis, 'Intl', { configurable: true, writable: true, value: undefined })
    try {
      expect(validateDisplayText('小帅', 12)).toEqual({ valid: true, value: '小帅', count: 2 })
      expect(validateDisplayText('👍🏽', 12)).toMatchObject({ valid: true, count: 1 })
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'Intl', descriptor)
    }
  })
})
