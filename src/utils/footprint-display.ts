/** 首页、时间列表和详情共用日期文案，分包不反向引用主包页面私有文件。 */
export function formatFootprintVisitDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : value
}
