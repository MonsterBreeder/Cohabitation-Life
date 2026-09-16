import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 保护头像上传链路的事件通道接法不被退回去。
// 教训回顾：在发起页（A 页面）调用 getOpenerEventChannel() 拿到的是"打开 A 的那个父页" channel，
// 跟 B 页面（crop-avatar）端的 emit 不互通；正确写法是 navigateTo 的 success 回调里的
// result.eventChannel.on('avatarApproved', handler)。三个共用 crop-avatar 的页面必须保持一致。
describe('crop-avatar 事件通道接法一致性', () => {

  it('cloudfunctions/household/index.js 必须 require releaseSlots 并路由 releaseAvatarSlots action', () => {
    // 上次漏掉这个 require 路径，部署后 releaseAvatarSlots 抛 ReferenceError 被兜底成 TEMPORARY_FAILURE，
    // 用户点"释放占位并重试"时永远清不掉 slot。必须把这两行都锁住。
    const source = load('cloudfunctions/household/index.js')
    expect(source).toMatch(/require\(['"]\.\/avatar-media['"]\)[\s\S]*?releaseSlots/)
    expect(source).toMatch(/event\.action\s*===\s*['"]releaseAvatarSlots['"][\s\S]*?releaseSlots\s*\(/)
  })
  function load(relPath: string): string {
    return readFileSync(resolve(__dirname, `../../${relPath}`), 'utf8')
  }

  it.each([
    'src/subpackages/household/edit-profile/index.vue',
    'src/subpackages/household/create-home/index.vue',
    'src/subpackages/household/edit-household/index.vue',
  ])('%s 在 navigateTo 时传 events 参数让 eventChannel 有效', (relPath) => {
    const source = load(relPath)
    // 必须存在 navigateTo 调用的 events 参数（哪怕是 events: { avatarApproved: () => undefined }）。
    // 文档明确：未传 events 时 result.eventChannel 在不同平台可能为 undefined，handler 永远注册不到。
    expect(source).toMatch(/uni\.navigateTo\s*\(\s*{[\s\S]*?events\s*:\s*{[\s\S]*?['"]avatarApproved['"]/m)
  })

  it.each([
    'src/subpackages/household/edit-profile/index.vue',
    'src/subpackages/household/create-home/index.vue',
    'src/subpackages/household/edit-household/index.vue',
  ])('%s 不再以方法调用形式出现 getOpenerEventChannel（错拿父页 channel 会导致事件不触发）', (relPath) => {
    const source = load(relPath)
    // 用 [\w$]\??\. 前缀匹配实际的方法调用形式，避免注释里的字符串误命中。
    expect(source).not.toMatch(/[\w$]\??\.getOpenerEventChannel/)
  })

  it.each([
    'src/subpackages/household/edit-profile/index.vue',
    'src/subpackages/household/create-home/index.vue',
    'src/subpackages/household/edit-household/index.vue',
  ])('%s 在 success 回调里通过 result.eventChannel.on 注册 listener', (relPath) => {
    const source = load(relPath)
    expect(source).toMatch(/eventChannel\.on\(\s*['"]avatarApproved['"]/)
  })

  it('crop-avatar 端继续通过 getOpenerEventChannel 拿 channel 并 emit avatarApproved', () => {
    const source = load('src/subpackages/household/crop-avatar/index.vue')
    expect(source).toMatch(/[\w$]\??\.getOpenerEventChannel/)
    expect(source).toMatch(/[\w$]+\??\.emit\(\s*['"]avatarApproved['"]/)
  })
})