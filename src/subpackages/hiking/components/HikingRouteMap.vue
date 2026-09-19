<template>
  <view class="hiking-route-map">
    <!-- 地图只消费抽稀后的显示副本，原始路线仍用于距离和海拔计算。 -->
    <map
      v-if="polylines.length"
      class="hiking-route-map__map"
      :latitude="center.latitude"
      :longitude="center.longitude"
      :polyline="polylines"
      :include-points="includePoints"
      :show-location="false"
      @updated="emit('ready')"
      @error="emit('error')"
    />
    <view v-else class="hiking-route-map__empty"><text>路线暂时无法显示</text></view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { HikingRoute } from '../../../types/hiking'
import { routeToMapCoordinates } from '../../../utils/hiking-coordinate'
import { simplifyRouteForDisplay } from '../../../utils/hiking-route'

const props = defineProps<{ route: HikingRoute }>()
const emit = defineEmits<{ ready: []; error: [] }>()
// 坐标转换只发生在显示层，不能回写或上传到规范路线。
const displayRoute = computed(() => routeToMapCoordinates(simplifyRouteForDisplay(props.route)))
const includePoints = computed(() =>
  displayRoute.value.segments.flatMap((segment) =>
    segment.points.map((point) => ({ latitude: point.latitude, longitude: point.longitude })),
  ),
)
const center = computed(() => includePoints.value[0] || { latitude: 23.1291, longitude: 113.2644 })
const polylines = computed(() =>
  displayRoute.value.segments.map((segment) => ({
    points: segment.points,
    color: '#267A5ACC',
    width: 5,
    dottedLine: false,
    arrowLine: true,
  })),
)
</script>

<style lang="scss" scoped>
.hiking-route-map {
  overflow: hidden;
  border: 1rpx solid rgba(38, 122, 90, 0.12);
  border-radius: 26rpx;
  background: #eef6f2;

  // 固定视口避免路线点数量变化时推动页面跳动。
  &__map {
    width: 100%;
    height: 420rpx;
  }
  &__empty {
    display: flex;
    height: 300rpx;
    align-items: center;
    justify-content: center;
    color: $brand-color-text-secondary;
    font-size: 24rpx;
  }
}
</style>
