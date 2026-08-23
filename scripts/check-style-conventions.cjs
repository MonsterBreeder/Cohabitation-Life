// Vue 样式规范守门脚本：防止平铺选择器、宽泛类名和非 BEM 命名重新进入项目。
const fs = require('node:fs')
const path = require('node:path')

const sourceRoot = path.resolve(__dirname, '..', 'src')
const bemClassPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?(?:--[a-z][a-z0-9]*(?:-[a-z0-9]+)*)?$/
const forbiddenGenericClasses = new Set(['page', 'state', 'title', 'content', 'item'])
const allowedExternalClasses = new Set(['is-disabled'])

function collectVueFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectVueFiles(entryPath)
    return entryPath.endsWith('.vue') ? [entryPath] : []
  })
}

/** 只读取样式最外层的规则头，用来阻止元素和状态选择器继续平铺。 */
function topLevelHeaders(styleText) {
  const headers = []
  let depth = 0
  let start = 0
  let quote = ''
  let inComment = false

  for (let index = 0; index < styleText.length; index += 1) {
    const current = styleText[index]
    const next = styleText[index + 1]

    if (inComment) {
      if (current === '*' && next === '/') {
        inComment = false
        index += 1
        if (depth === 0) start = index + 1
      }
      continue
    }
    if (!quote && current === '/' && next === '*') {
      inComment = true
      index += 1
      continue
    }
    if (quote) {
      if (current === quote && styleText[index - 1] !== '\\') quote = ''
      continue
    }
    if (current === '"' || current === "'") {
      quote = current
      continue
    }
    if (current === '{') {
      if (depth === 0) headers.push(styleText.slice(start, index).trim())
      depth += 1
      continue
    }
    if (current === '}') {
      depth -= 1
      if (depth === 0) start = index + 1
    }
  }
  return headers.filter(Boolean)
}

const failures = []

for (const filePath of collectVueFiles(sourceRoot)) {
  const relativePath = path.relative(path.resolve(__dirname, '..'), filePath)
  const source = fs.readFileSync(filePath, 'utf8')
  const isAppFile = path.basename(filePath) === 'App.vue'
  const styleMatch = source.match(/<style([^>]*)>([\s\S]*?)<\/style>/)

  if (!styleMatch) {
    failures.push(`${relativePath}：缺少样式区块`)
    continue
  }
  if (!isAppFile && styleMatch[1].trim() !== 'lang="scss" scoped') {
    failures.push(`${relativePath}：必须使用 <style lang="scss" scoped>`)
  }
  if (isAppFile) continue

  const styleText = styleMatch[2]
  if (/&[^\s,{]*&/.test(styleText)) {
    failures.push(`${relativePath}：同一组合选择器不能连续使用多个 &`)
  }
  for (const header of topLevelHeaders(styleText)) {
    if (!/^\.[a-z][a-z0-9-]*$/.test(header)) {
      failures.push(`${relativePath}：样式最外层必须是单一 BEM 区块，发现 ${header}`)
    }
  }

  const classNames = [...styleText.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((match) => match[1])
  for (const className of new Set(classNames)) {
    if (forbiddenGenericClasses.has(className)) {
      failures.push(`${relativePath}：禁止使用宽泛类名 .${className}`)
    } else if (!bemClassPattern.test(className) && !allowedExternalClasses.has(className)) {
      failures.push(`${relativePath}：类名 .${className} 不符合 BEM 和短横线命名`)
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('样式规范检查通过：全部 Vue 文件已使用 SCSS 嵌套和 BEM 命名。')
