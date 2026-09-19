export default {
  printWidth: 110,
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  tabWidth: 2,
  useTabs: false,
  endOfLine: 'lf',
  htmlWhitespaceSensitivity: 'ignore',
  // 属性只在超出行宽时换行；短标签保持完整，避免模板被机械切碎。
  singleAttributePerLine: false,
  overrides: [
    {
      files: '*.json',
      options: { tabWidth: 2, singleAttributePerLine: false },
    },
  ],
}
