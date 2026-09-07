<template>
  <!-- 主包地点卡片和分包详情共用相同行为；通用按钮仍使用 Wot UI。 -->
  <view class="footprint-navigation">
    <wd-button size="small" round variant="plain" :loading="opening" :disabled="opening" @click="navigate">
      {{ place ? '导航去这里' : '选地点导航' }}
    </wd-button>
    <text v-if="errorMessage" class="footprint-navigation__error">{{ errorMessage }}</text>
    <wd-button v-if="permissionDenied" size="small" round variant="text" :loading="opening" :disabled="opening" @click="openSettings">
      打开位置设置
    </wd-button>
  </view>
</template>

<script setup lang="ts">
import { shallowRef } from 'vue'
import type { FootprintPlace } from '../types/footprint'
import { chooseFootprintLocation, openFootprintLocationSetting } from '../utils/footprint-location'
import { openFootprintNavigation } from '../utils/footprint-navigation'

// 有地点时直接打开该地点；不传地点时先选择目的地，绝不借用新增足迹的保存流程。
const props = defineProps<{ place?: FootprintPlace }>()
const opening = shallowRef(false)
const errorMessage = shallowRef('')
const permissionDenied = shallowRef(false)

/** 点击是唯一触发入口；选择及打开地图共用锁，所有退出路径都会释放。 */
async function navigate(): Promise<void> {
  if (opening.value) return
  opening.value = true
  errorMessage.value = ''
  try {
    let destination = props.place
    if (!destination) {
      const selected = await chooseFootprintLocation()
      if (!selected.ok) {
        permissionDenied.value = selected.reason === 'denied'
        errorMessage.value = selected.message || ''
        return
      }
      destination = selected.place
    }
    permissionDenied.value = false
    const result = await openFootprintNavigation(destination)
    if (!result.ok) errorMessage.value = result.message || ''
  } catch {
    // 兼容设备同步抛错；不修改页面数据，也不将打开失败误报成到达成功。
    errorMessage.value = '暂时无法打开导航，请稍后重试'
  } finally {
    opening.value = false
  }
}

/** 用户明确点击后才进入微信设置；开启成功再继续刚才的目的地选择。 */
async function openSettings(): Promise<void> {
  if (opening.value) return
  opening.value = true
  errorMessage.value = ''
  let enabled = false
  try {
    enabled = await openFootprintLocationSetting()
    permissionDenied.value = !enabled
    if (!enabled) errorMessage.value = '位置权限尚未开启，你可以稍后再试'
  } catch {
    errorMessage.value = '暂时无法打开位置设置，请稍后重试'
  } finally {
    opening.value = false
  }
  if (enabled) await navigate()
}
</script>

<style lang="scss" scoped>
.footprint-navigation {
  // 错误在按钮下方换行，窄屏不挤压地点名称或覆盖地图。
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12rpx;
  min-width: 0;

  &__error { color: #ba564b; font-size: 23rpx; line-height: 1.6; }
}
</style>
