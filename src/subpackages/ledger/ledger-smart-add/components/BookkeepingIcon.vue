<!-- 文件用途：展示聊天账单的本地图标，避免依赖微信设备可能缺失的字体字形。 -->
<template>
  <view class="bookkeeping-icon" :class="`bookkeeping-icon--${tone}`">
    <image class="bookkeeping-icon__image" :src="iconSource(name)" mode="aspectFit" />
  </view>
</template>

<script setup lang="ts">
// 浏览器由构建工具解析分包资源，小程序使用分包内的原路径。
// #ifdef H5
const webIcons = import.meta.glob<string>('../../static/bookkeeping/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
})
// #endif

type IconName = 'bowl' | 'car' | 'tag' | 'ticket' | 'check' | 'clock' | 'alert' | 'dash' | 'edit'

/** 图标来源只接受本地固定文件名，分类和状态另有文字说明。 */
defineProps<{
  name: IconName
  tone: 'meal' | 'mint' | 'neutral' | 'ticket' | 'plain'
}>()

/** 按页面运行端选择图标地址。 */
function iconSource(name: IconName): string {
  let source = `/subpackages/ledger/static/bookkeeping/${name}.svg`
  // #ifdef H5
  source = webIcons[`../../static/bookkeeping/${name}.svg`] ?? source
  // #endif
  return source
}
</script>

<style lang="scss" scoped>
/* 图标色块属于小票样式，窄屏保留固定位置。 */
.bookkeeping-icon {
  flex: none;
  width: 68rpx;
  height: 68rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20rpx;
  &--meal {
    background: #fbeadb;
  }
  &--mint,
  &--ticket {
    background: #dceee4;
  }
  &--neutral {
    background: #f1f3ed;
  }
  &--ticket {
    width: 84rpx;
    height: 84rpx;
  }
  &--plain {
    width: 28rpx;
    height: 28rpx;
  }
  &__image {
    width: 58%;
    height: 58%;
  }
  &--plain &__image {
    width: 100%;
    height: 100%;
  }
}
</style>
