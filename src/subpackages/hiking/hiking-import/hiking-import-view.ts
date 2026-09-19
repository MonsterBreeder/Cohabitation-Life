// KML 导入页的错误边界：只向页面暴露可理解文案，不泄露解析器内部结构。
import { HikingKmlError, type HikingKmlParseResult } from '../../../types/hiking'
import { parseHikingKml } from '../../../utils/hiking-kml'

export function parseSelectedKml(
  content: string,
  fileName: string,
  size: number,
): { result: HikingKmlParseResult | null; error: string } {
  try {
    return { result: parseHikingKml(content, { fileName, byteLength: size }), error: '' }
  } catch (error) {
    return {
      result: null,
      error: error instanceof HikingKmlError ? error.message : 'KML 文件暂时无法读取，请重新选择',
    }
  }
}
