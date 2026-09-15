import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 保护头像上传链路的事件通道接法不被退回去。
// 教训回顾：在发起页（A 页面）调用 getOpenerEventChannel() 拿到的是"打开 A 的那个父页" channel，
// 跟 B 页面（crop-avatar）端的 emit 不互通；正确写法是 navigateTo 的 success 回调里的
// result.eventChannel.on('avatarApproved', handler)。三个共用 crop-avatar 的页面必须保持一致。
describe('crop-avatar 事件通道接法一致性', () => {
  function load(relPath: string): string {
    return readFileSync(resolve(__dirname, `../../${relPath}`), 'utf8')
  }

  it.each([
    'src/subpackages/household/edit-profile/index.vue',
    'src/subpackages/household/create-home/index.vue',
    'src/subpackages/household/edit-household/index.vue',
  ])('%s 通过 navigateTo 的 success 回调拿到 eventChannel 并监听 avatarApproved', (relPath) => {
    const source = load(relPath)
    // 必须存在 navigateTo 调用的 success 回调，并在回调里挂 eventChannel.on('avatarApproved', ...)
    expect(source).toMatch(/uni\.navigateTo\s*\(\s*{[\s\S]*?success\s*:/m)
    expect(source).toMatch(/eventChannel\.on\(\s*['"]avatarApproved['"]/)
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

  it('crop-avatar 端继续通过 getOpenerEventChannel 拿 channel 并 emit avatarApproved', () => {
    const source = load('src/subpackages/household/crop-avatar/index.vue')
    expect(source).toMatch(/[\w$]\??\.getOpenerEventChannel/)
    expect(source).toMatch(/[\w$]+\??\.emit\(\s*['"]avatarApproved['"]/)
  })
})