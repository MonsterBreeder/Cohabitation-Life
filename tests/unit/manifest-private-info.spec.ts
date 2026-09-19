import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('微信小程序隐私接口配置', () => {
  // 保护启动流程：只声明微信允许的定位接口，图片隐私用途继续在公众平台后台维护。
  it('只写入现场记录需要的合法定位接口', () => {
    const manifest = readFileSync(resolve(__dirname, '../../src/manifest.json'), 'utf8')
    const requiredPrivateInfos = manifest.match(/"requiredPrivateInfos"\s*:\s*\[([^\]]*)\]/)?.[1] ?? ''

    expect(requiredPrivateInfos).not.toContain('chooseMedia')
    expect(requiredPrivateInfos).toContain('chooseLocation')
    expect(requiredPrivateInfos).toContain('startLocationUpdate')
    expect(requiredPrivateInfos).toContain('onLocationChange')
  })
})
