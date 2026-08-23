export type DisplayTextValidation =
  | { valid: true; value: string; count: number }
  | { valid: false; value: string; count: number; reason: 'empty' | 'multiline' | 'too_long' }

export const PROFILE_NAME_MAX_LENGTH = 10

/** 去掉首尾空白，保留名称中间由用户输入的空格。 */
export function normaliseDisplayText(value: string): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** 使用基础字符范围合并常见表情修饰符、连接符和组合字符。 */
function countWithFallback(value: string): number {
  const codePoints = Array.from(value)
  let count = 0
  let regionalIndicators = 0

  for (let index = 0; index < codePoints.length; index += 1) {
    const point = codePoints[index]
    const code = point.codePointAt(0) || 0
    const isMark = (code >= 0x0300 && code <= 0x036f)
      || (code >= 0x1ab0 && code <= 0x1aff)
      || (code >= 0x1dc0 && code <= 0x1dff)
      || (code >= 0x20d0 && code <= 0x20ff)
      || (code >= 0xfe20 && code <= 0xfe2f)
    const isVariation = code >= 0xfe00 && code <= 0xfe0f
    const isSkinTone = code >= 0x1f3fb && code <= 0x1f3ff
    const isRegional = code >= 0x1f1e6 && code <= 0x1f1ff

    if (isMark || isVariation || isSkinTone) continue
    if (point === '\u200d') {
      index += 1
      continue
    }
    if (isRegional) {
      regionalIndicators += 1
      if (regionalIndicators % 2 === 0) continue
    } else {
      regionalIndicators = 0
    }
    count += 1
  }
  return count
}

/** 按用户看到的完整字符计数，而不是按 UTF-16 长度计数。 */
export function countDisplayCharacters(value: string): number {
  // 所有端统一使用基础字符范围计数，避免不同手机的能力差异再次中断页面。
  return countWithFallback(value)
}

export function validateDisplayText(value: string, maxLength: number): DisplayTextValidation {
  const normalised = normaliseDisplayText(value)
  const count = countDisplayCharacters(normalised)
  if (!normalised) return { valid: false, value: normalised, count, reason: 'empty' }
  if (/\r|\n/u.test(normalised)) return { valid: false, value: normalised, count, reason: 'multiline' }
  if (count > maxLength) return { valid: false, value: normalised, count, reason: 'too_long' }
  return { valid: true, value: normalised, count }
}
