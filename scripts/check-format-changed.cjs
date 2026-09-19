// 旧项目采用渐进式格式化：只检查相对 dev 新增或修改的代码，避免一次重写全部历史文件。
const { execFileSync, spawnSync } = require('node:child_process')
const path = require('node:path')

function gitLines(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

const candidates = new Set([
  ...gitLines(['diff', '--name-only', '--diff-filter=ACMR', 'dev']),
  ...gitLines(['ls-files', '--others', '--exclude-standard']),
])

const files = [...candidates].filter(
  (file) => /^(src|tests)\/.+\.(?:vue|ts|tsx|scss|json)$/.test(file) && !file.endsWith('.d.ts'),
)

if (files.length === 0) {
  console.log('没有需要检查格式的新增或修改代码。')
  process.exit(0)
}

const prettier = path.join(process.cwd(), 'node_modules', 'prettier', 'bin', 'prettier.cjs')
const result = spawnSync(process.execPath, [prettier, '--check', ...files], { stdio: 'inherit' })
process.exit(result.status ?? 1)
