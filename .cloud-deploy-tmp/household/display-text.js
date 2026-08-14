/** 云端与页面采用相同的完整字符规则。 */
function countDisplayCharacters(value) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(value)).length
  }
  const points = Array.from(value)
  let count = 0
  let regionalIndicators = 0
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const code = point.codePointAt(0) || 0
    if (/\p{Mark}/u.test(point) || (code >= 0xfe00 && code <= 0xfe0f) || (code >= 0x1f3fb && code <= 0x1f3ff)) continue
    if (point === '\u200d') { index += 1; continue }
    if (code >= 0x1f1e6 && code <= 0x1f1ff) {
      regionalIndicators += 1
      if (regionalIndicators % 2 === 0) continue
    } else regionalIndicators = 0
    count += 1
  }
  return count
}

function validateDisplayText(value, maxLength) {
  const normalised = typeof value === 'string' ? value.trim() : ''
  if (!normalised || /\r|\n/u.test(normalised) || countDisplayCharacters(normalised) > maxLength) return null
  return normalised
}

module.exports = { countDisplayCharacters, validateDisplayText }
