// KML 只在本机解析；拒绝实体、远程资源和非 LineString 内容，原文不会上传。
import { XMLParser } from 'fast-xml-parser'
import {
  HikingKmlError,
  type HikingKmlParseResult,
  type HikingRoutePoint,
  type HikingRouteSegment,
} from '../types/hiking'
import { calculateHikingMetrics } from './hiking-route'

export const HIKING_KML_MAX_BYTES = 5 * 1024 * 1024
export const HIKING_KML_MAX_POINTS = 20_000
export const HIKING_KML_MAX_SEGMENTS = 100

interface ParseOptions {
  fileName?: string
  byteLength?: number
}

function childValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined
  return (value as Record<string, unknown>)[key]
}

function collectNamedNodes(value: unknown, name: string, output: unknown[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectNamedNodes(item, name, output))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === name) output.push(child)
    collectNamedNodes(child, name, output)
  }
}

function textValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && '#text' in value)
    return String((value as Record<string, unknown>)['#text'])
  return ''
}

function parseCoordinates(raw: string): HikingRoutePoint[] {
  const points = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tuple) => {
      const parts = tuple.split(',')
      if (parts.length < 2 || parts.length > 3)
        throw new HikingKmlError('INVALID_COORDINATE', '路线中存在无法识别的坐标')
      const longitude = Number(parts[0])
      const latitude = Number(parts[1])
      const altitude = parts[2] === undefined || parts[2] === '' ? undefined : Number(parts[2])
      if (
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        (altitude !== undefined && !Number.isFinite(altitude)) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
      )
        throw new HikingKmlError('INVALID_COORDINATE', '路线中存在越界或无效坐标')
      return { latitude, longitude, ...(altitude === undefined ? {} : { altitude }) }
    })
  if (points.length < 2) throw new HikingKmlError('NO_ROUTE', '每段路线至少需要两个有效坐标点')
  return points
}

export function parseHikingKml(xml: string, options: ParseOptions = {}): HikingKmlParseResult {
  if (options.fileName && !options.fileName.toLowerCase().endsWith('.kml'))
    throw new HikingKmlError('FILE_TYPE', '请选择 KML 格式的路线文件')
  const byteLength = options.byteLength ?? new TextEncoder().encode(xml).byteLength
  if (byteLength > HIKING_KML_MAX_BYTES) throw new HikingKmlError('FILE_TOO_LARGE', 'KML 文件不能超过 5 MB')
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new HikingKmlError('UNSAFE_XML', '该文件包含不安全的 XML 声明')
  // KML 命名空间本身是标准网址；只把内容节点里的外部地址视为远程资源。
  if (
    /<(?:\w+:)?(?:NetworkLink|Polygon|Track)\b/i.test(xml) ||
    /<(?:\w+:)?href\b[^>]*>\s*(?:https?|file):\/\//i.test(xml)
  ) {
    throw new HikingKmlError('UNSUPPORTED_CONTENT', '文件包含首版不支持的路线内容')
  }
  let parsed: unknown
  try {
    parsed = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      parseTagValue: false,
      trimValues: true,
    }).parse(xml)
  } catch {
    throw new HikingKmlError('INVALID_XML', 'KML 文件已损坏或格式不完整')
  }
  const lineStrings: unknown[] = []
  collectNamedNodes(parsed, 'LineString', lineStrings)
  if (!lineStrings.length) throw new HikingKmlError('NO_ROUTE', '文件中没有可用的 LineString 路线')
  if (lineStrings.length > HIKING_KML_MAX_SEGMENTS)
    throw new HikingKmlError('TOO_MANY_SEGMENTS', 'KML 路线段不能超过 100 段')
  const segments: HikingRouteSegment[] = lineStrings.map((line) => {
    const coordinates = textValue(childValue(line, 'coordinates'))
    if (!coordinates) throw new HikingKmlError('NO_ROUTE', '路线段缺少有效坐标')
    const altitudeMode =
      textValue(childValue(line, 'altitudeMode')).trim().toLowerCase() === 'absolute'
        ? 'absolute'
        : 'untrusted'
    return { points: parseCoordinates(coordinates), altitudeMode }
  })
  const pointCount = segments.reduce((sum, segment) => sum + segment.points.length, 0)
  if (pointCount > HIKING_KML_MAX_POINTS)
    throw new HikingKmlError('TOO_MANY_POINTS', 'KML 坐标点不能超过 20,000 个')
  const route = { version: 1 as const, source: 'kml' as const, segments }
  return { route, metrics: calculateHikingMetrics(route), pointCount, segmentCount: segments.length }
}
