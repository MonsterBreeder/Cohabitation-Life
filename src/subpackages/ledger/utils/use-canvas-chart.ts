// 账本分包的轻量画布调度：负责在异步数据到达后查找 canvas，并在当前组件范围内重绘。
// 不依赖浏览器 DOM 或第三方图表库，保证微信小程序开发者工具和真机使用同一条绘制链路。
import { getCurrentInstance, nextTick, onBeforeUnmount, onMounted, watch, type Ref } from 'vue'

export interface CanvasChartSize {
  width: number
  height: number
}

export type CanvasChartDrawer = (context: any, size: CanvasChartSize) => void

export function useCanvasChart(
  canvasId: string,
  source: Ref<unknown>,
  draw: CanvasChartDrawer,
): void {
  const componentProxy = getCurrentInstance()?.proxy
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retryCount = 0
  let isDrawing = false

  function scheduleDraw(resetRetry = false): void {
    if (resetRetry) retryCount = 0
    void nextTick(() => {
      if (retryTimer) clearTimeout(retryTimer)
      retryTimer = setTimeout(render, 30)
    })
  }

  function render(): void {
    if (isDrawing) return
    isDrawing = true
    // 微信小程序自定义组件存在样式隔离，节点查询必须限定在当前组件实例。
    const baseQuery = uni.createSelectorQuery()
    const query = componentProxy ? baseQuery.in(componentProxy) : baseQuery
    query
      .select(`#${canvasId}`)
      // @ts-expect-error -- 微信小程序运行时允许 fields 只传节点和尺寸配置。
      .fields({ node: true, size: true })
      .exec((result: Array<{ node?: any; width?: number; height?: number }>) => {
        const item = result?.[0]
        if (!item?.node || !item.width || !item.height) {
          isDrawing = false
          // 页面数据异步返回时 canvas 由 v-if 延后创建，仅做有限重试，避免后台空转。
          if (retryCount < 4) {
            retryCount += 1
            retryTimer = setTimeout(render, 80)
          }
          return
        }
        try {
          const pixelRatio = uni.getSystemInfoSync().pixelRatio || 1
          item.node.width = item.width * pixelRatio
          item.node.height = item.height * pixelRatio
          const context = item.node.getContext('2d')
          context.scale(pixelRatio, pixelRatio)
          context.clearRect(0, 0, item.width, item.height)
          draw(context, { width: item.width, height: item.height })
        } catch (error) {
          // 绘制失败不能阻断统计页其他数据；保留明确日志用于真机定位。
          const message = error instanceof Error ? error.message : String(error)
          console.error(`[useCanvasChart] canvas #${canvasId} 绘制失败：${message}`)
        } finally {
          isDrawing = false
        }
      })
  }

  onMounted(() => scheduleDraw(true))

  watch(source, () => scheduleDraw(true), { deep: true })

  onBeforeUnmount(() => {
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
  })
}
