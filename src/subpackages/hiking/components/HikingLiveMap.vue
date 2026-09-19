<template>
  <view class="hiking-live-map">
    <!-- 原生地图从首个有效点开始居中；一段内达到两个点后才绘制路线，避免伪造未知路径。 -->
    <map
      class="hiking-live-map__map"
      :latitude="model.center.latitude"
      :longitude="model.center.longitude"
      :polyline="model.polylines"
      :include-points="model.includePoints"
      :show-location="true"
      :scale="model.hasLocation ? 17 : 13"
    />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { createLiveMapModel, type HikingLiveRouteSegment } from '../hiking-record/hiking-record-view'

const props = defineProps<{ segments: readonly HikingLiveRouteSegment[] }>()
const model = computed(() => createLiveMapModel(props.segments))
</script>

<style lang="scss" scoped>
.hiking-live-map {
  position: relative;
  overflow: hidden;
  border-radius: 34rpx;
  background: #eaf6f0;

  &__map {
    width: 100%;
    height: 420rpx;
  }
}
</style>
