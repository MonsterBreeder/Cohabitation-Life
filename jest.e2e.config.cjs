// 文件用途：仅从实际页面检查目录发现用例，避免把部署临时副本当成同名模块。
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/e2e'],
  testMatch: ['<rootDir>/tests/e2e/**/*.spec.js'],
  testTimeout: 30_000,
  transform: {},
}
