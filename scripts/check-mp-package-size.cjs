// 微信小程序包体积守门脚本：按构建产物的真实文件大小检查主包和每个分包。
const fs = require('node:fs')
const path = require('node:path')

const outputRoot = path.resolve(__dirname, '..', 'dist', 'build', 'mp-weixin')
const warningLimitBytes = 1.5 * 1024 * 1024

if (!fs.existsSync(outputRoot)) {
  console.error('未找到微信小程序构建产物，请先运行 npm run build:mp-weixin。')
  process.exit(1)
}

/** 递归收集目录内文件，避免把文件夹本身计入体积。 */
function collectFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath]
  })
}

/** 把字节转换为便于人工检查的 KB。 */
function formatKilobytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

const packageSizes = new Map([['主包', 0]])

for (const filePath of collectFiles(outputRoot)) {
  const relativePath = path.relative(outputRoot, filePath)
  const parts = relativePath.split(path.sep)
  const packageName = parts[0] === 'subpackages' && parts[1]
    ? `分包-${parts[1]}`
    : '主包'
  packageSizes.set(packageName, (packageSizes.get(packageName) || 0) + fs.statSync(filePath).size)
}

let hasOversizedPackage = false
for (const [packageName, size] of packageSizes) {
  const result = size >= warningLimitBytes ? '超过项目预警线' : '正常'
  console.log(`${packageName}：${formatKilobytes(size)}，${result}`)
  hasOversizedPackage ||= size >= warningLimitBytes
}

if (hasOversizedPackage) {
  console.error('存在达到 1.5 MB 预警线的代码包，请先拆分或压缩再交付。')
  process.exit(1)
}
