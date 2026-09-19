import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import vue from 'eslint-plugin-vue'
import globals from 'globals'
import typescriptEslint from 'typescript-eslint'

export default typescriptEslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.cloud-deploy-tmp/**',
      'references/**',
      'tmp/**',
      'cloudfunctions/**',
      '**/*.d.ts',
    ],
  },
  eslint.configs.recommended,
  ...typescriptEslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['src/**/*.{ts,tsx,vue}', 'tests/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        uni: 'readonly',
        wx: 'readonly',
        getCurrentPages: 'readonly',
      },
      parserOptions: {
        parser: typescriptEslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      // 项目统一使用 script setup，SFC 顺序由项目规范固定为 template → script → style。
      'vue/component-api-style': ['error', ['script-setup']],
      'vue/block-order': ['error', { order: ['template', 'script', 'style'] }],
      'vue/multi-word-component-names': 'off',
      // 历史代码先建立不阻塞的基线；新文件由类型检查和评审逐步收紧这些存量项。
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-useless-assignment': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'vue/attributes-order': 'off',
      'vue/require-default-prop': 'off',
      'vue/no-deprecated-slot-attribute': 'off',
      'vue/valid-template-root': 'off',
    },
  },
  {
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        program: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // 格式由 Prettier 统一负责，避免 ESLint 与格式化工具互相打架。
  prettier,
)
