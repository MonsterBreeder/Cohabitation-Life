<template />

<script setup lang="ts">
import { onLaunch, onShow } from '@dcloudio/uni-app'
import { useAuthStore } from './store/modules/auth'

// 微信启动参数只保留邀请编号，不接收客户端提供的用户或家庭身份。
interface LaunchOptions {
  query?: Record<string, string | undefined>
}

const auth = useAuthStore()

/** 保存本次启动携带的邀请，供登录完成后再次交给云端核验。 */
function captureInvite(options?: LaunchOptions): void {
  auth.captureInviteToken(options?.query?.inviteToken)
}

/** 回到前台时重新读取微信入口参数，避免分享卡片入口被遗漏。 */
function captureCurrentInvite(): void {
  const runtime = globalThis as typeof globalThis & {
    wx?: { getEnterOptionsSync?: () => LaunchOptions }
  }
  captureInvite(runtime.wx?.getEnterOptionsSync?.())
}

/** 仅在已有登录记录时恢复会话；首次打开不会自动创建用户。 */
function restoreSession(): void {
  void auth.restore()
}

onLaunch((options) => {
  captureInvite(options)
  restoreSession()
})

onShow(() => {
  captureCurrentInvite()
  restoreSession()
})
</script>

<style scoped>
/* 应用级基础颜色和字体，具体页面样式仍由页面自己管理。 */
:global(page) {
  background: #fff9f2;
  color: #29443a;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
</style>
