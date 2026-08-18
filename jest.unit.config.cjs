module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit'],
  testMatch: ['**/*.spec.ts'],
  // 排除：node_modules、微信开发者工具部署时生成的临时目录（.cloud-deploy-tmp/）、
  // 仓库自带的本地备份目录（references/、tmp/）。这些目录里可能含同名 package.json，
  // 会触发 jest-haste-map 命名冲突；也不在测试范围内。
  modulePathIgnorePatterns: ['/node_modules/', '/.cloud-deploy-tmp/', '/references/', '/tmp/'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
  },
}
