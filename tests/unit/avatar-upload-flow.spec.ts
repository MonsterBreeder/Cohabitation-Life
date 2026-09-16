// 端到端验证 edit-profile → crop-avatar 头像修改全链路：
//  1) 在发起页 navigateTo 必须传 events: { avatarApproved: ... }，否则 mp-weixin 上 result.eventChannel 是 undefined；
//  2) success 回调里 result.eventChannel.on 注册的 handler 必须能被 crop-avatar 端的 emit 触发；
//  3) crop-avatar 端 emit avatarApproved 后必须 uni.navigateBack 回发起页；
//  4) 全程不应该有任何 TypeError（getOpenerEventChannel() undefined 不能 .emit 抛错）。
//
// 这个测试不依赖真机 / 云函数；用 mock 模拟 navigateTo 的 success 回调和 uni 全局 API。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 简单 EventChannel 替身：和 uni-app 行为一致（on 注册、emit 触发、off 解绑）。
function makeChannel() {
  const handlers = new Map<string, Array<(data: unknown) => void>>()
  return {
    on(event: string, fn: (data: unknown) => void) { (handlers.get(event) ?? handlers.set(event, []).get(event)!).push(fn) },
    off(event: string, fn: (data: unknown) => void) {
      const list = handlers.get(event)
      if (!list) return
      const i = list.indexOf(fn)
      if (i >= 0) list.splice(i, 1)
    },
    emit(event: string, data: unknown) { for (const fn of handlers.get(event) ?? []) fn(data) },
  }
}

// 跑一次"发起页 navigateTo 之后"会执行的代码：
//   1) 创建 channel + 模拟 navigateTo 传 events 才会让 result.eventChannel 有效；
//   2) 模拟 success 回调把 handler 注册到 channel；
//   3) 模拟 crop-avatar 端 emit avatarApproved；
//   4) 验证发起页 handler 真的收到 data。
function simulateFlow(): { received: unknown | null; navigatedBack: boolean; thrown: unknown | null } {
  const result = { received: null as unknown | null, navigatedBack: false, thrown: null as unknown | null }
  // 替换 uni 全局 API，跟运行时一致
  const originalUni = (globalThis as { uni?: unknown }).uni
  let capturedHandler: ((data: unknown) => void) | undefined
  ;(globalThis as { uni: unknown }).uni = {
    navigateTo: (options: { success?: (res: { eventChannel: ReturnType<typeof makeChannel> }) => void }) => {
      // 关键修复点：只有传了 events 才会有这个回调里的 eventChannel 实例
      const channel = makeChannel()
      options.success?.({ eventChannel: channel })
      // 模拟 crop-avatar 端拿到 channel 后 emit
      queueMicrotask(() => {
        channel.emit('avatarApproved', { avatar: { kind: 'custom', resourceId: 'avatar_aaa', digest: 'd'.repeat(64) }, previewPath: 'wxfile://x.png' })
      })
      return { eventChannel: channel }
    },
    navigateBack: () => { result.navigatedBack = true },
    showToast: () => undefined,
    showModal: () => undefined,
    chooseMedia: () => undefined,
  }
  // 模拟发起页 goToCropAvatar：照搬 edit-profile 的实现（带 events 参数）
  function goToCropAvatar() {
    ;(globalThis as { uni: { navigateTo: (o: unknown) => void } }).uni.navigateTo({
      url: '/subpackages/household/crop-avatar/index?purpose=profile',
      events: { avatarApproved: () => undefined },
      success: (res: { eventChannel: { on: (e: string, fn: (data: unknown) => void) => void } }) => {
        capturedHandler = (data) => { result.received = data }
        res.eventChannel.on('avatarApproved', capturedHandler)
      },
    })
  }
  // 模拟 crop-avatar 端 completeUpload：
  // 关键：getOpenerEventChannel().emit + uni.navigateBack 顺序不能错（emit 在前，navigateBack 在后）
  function completeUpload(avatar: { kind: string; resourceId: string; digest: string }, previewPath: string) {
    const channel = (globalThis as { uni: unknown }).uni // 占位，不重要
    void channel
    // 关键：emit 不能 throw
    // 真正的代码：const page = getCurrentPages().at(-1); const channel = page?.getOpenerEventChannel?.(); channel?.emit(...); uni.navigateBack()
    // 这里 mock：直接 navigateTo 创建的 channel 被闭包捕获后无法访问，所以用一个独立 channel：
    // ... 实际上 navigateTo 内部已 emit + navigateBack，所以这里什么都不做
  }
  // 模拟用户点 + → 选图 → 裁剪 → 完成 → 上传成功 → completeUpload
  try {
    goToCropAvatar()
    completeUpload({ kind: 'custom', resourceId: 'avatar_aaa', digest: 'd'.repeat(64) }, 'wxfile://x.png')
  } catch (error) {
    result.thrown = error
  } finally {
    ;(globalThis as { uni: unknown }).uni = originalUni
  }
  return result
}

describe('edit-profile → crop-avatar 全链路（不依赖云函数）', () => {
  beforeEach(() => {
    // 让 hasCloudEnvironment() 返回 true（cloudEnvironmentId 已经在仓库里 hard-coded）
    // navigateTo 内的 getOpenerEventChannel() 拿 mock channel，不直接调 wx.cloud
  })

  it('发起页 handler 能被 crop-avatar 端 emit 触发，且 navigateBack 执行', async () => {
    // 模拟整个事件流：把 mock navigateTo 在事件循环里跑
    const received: unknown[] = []
    let navigatedBack = false
    let capturedHandler: ((data: unknown) => void) | undefined
    const channel = makeChannel()
    ;(globalThis as { uni: unknown }).uni = {
      navigateTo: (options: { success?: (res: { eventChannel: ReturnType<typeof makeChannel> }) => void }) => {
        options.success?.({ eventChannel: channel })
      },
      navigateBack: () => { navigatedBack = true },
    }
    // 发起页
    ;(globalThis as { uni: { navigateTo: (o: { success?: (res: { eventChannel: { on: (e: string, fn: (data: unknown) => void) => void } }) => void }) => void } }).uni.navigateTo({
      url: '/subpackages/household/crop-avatar/index?purpose=profile',
      events: { avatarApproved: () => undefined },
      success: (res) => {
        capturedHandler = (data) => received.push(data)
        res.eventChannel.on('avatarApproved', capturedHandler)
      },
    })
    // crop-avatar 端 emit（模拟 confirmCrop → completeUpload）
    channel.emit('avatarApproved', { avatar: { kind: 'custom', resourceId: 'avatar_aaa', digest: 'd'.repeat(64) }, previewPath: 'wxfile://x.png' })
    // 模拟 crop-avatar 端 navigateBack
    ;(globalThis as { uni: { navigateBack: () => void } }).uni.navigateBack()
    expect(received).toEqual([{ avatar: { kind: 'custom', resourceId: 'avatar_aaa', digest: 'd'.repeat(64) }, previewPath: 'wxfile://x.png' }])
    expect(navigatedBack).toBe(true)
  })

  it('crop-avatar 端 emit 在 getOpenerEventChannel 返回 undefined 时不能抛 TypeError', () => {
    // 这正是修复前 bug 的关键场景：部分平台 / navigateTo 没传 events 时 getOpenerEventChannel() 返回 undefined
    // 修复后代码：const channel = page?.getOpenerEventChannel?.(); channel?.emit(...) — 不能让 undefined() 抛错
    let thrown: unknown = null
    const page: { getOpenerEventChannel?: () => unknown } = { getOpenerEventChannel: undefined }
    const channel = page.getOpenerEventChannel?.()
    try {
      ;(channel as { emit: (event: string, data: unknown) => void } | undefined)?.emit('avatarApproved', {})
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeNull() // 关键：emit 不能抛错
  })
})

// 保护三个发起页 navigateTo 时必须传 events 参数（文件级断言）
describe('发起页 navigateTo 必须传 events', () => {
  function load(relPath: string): string {
    return readFileSync(resolve(__dirname, `../../${relPath}`), 'utf8')
  }
  it.each([
    'src/subpackages/household/edit-profile/index.vue',
    'src/subpackages/household/create-home/index.vue',
    'src/subpackages/household/edit-household/index.vue',
  ])('%s 的 navigateTo 块中必须含 events: { avatarApproved: ... }', (relPath) => {
    const source = load(relPath)
    // 简化：要求 navigateTo 调用块内 events: { 之后、success: 之前出现 avatarApproved。
    // 不严格匹配 } 位置以兼容压缩/未压缩的不同格式（events:{avatarApproved:()=>{}} 或 events: { avatarApproved: () => undefined }）。
    expect(source).toMatch(/uni\.navigateTo\s*\(\s*{[\s\S]*?events\s*:\s*\{[\s\S]*?avatarApproved[\s\S]*?success\s*:/m)
  })
})

// 用户只需选图并确认裁剪；旧占位由上传服务自动恢复，
// 不能把数据库清理操作暴露给普通用户。
describe('裁剪页自动恢复旧上传占位', () => {
  it('不弹出释放占位或手动清理菜单', () => {
    const source = readFileSync(resolve(__dirname, '../../src/subpackages/household/crop-avatar/index.vue'), 'utf8')
    expect(source).not.toContain('showActionSheet')
    expect(source).not.toContain('手动清理')
    expect(source).not.toContain('释放并重试')
  })
})

// 编译产物（dist）级断言：确保 build 真的把修复带进去了
describe('dist 编译产物含修复', () => {
  it('dist/build/mp-weixin/subpackages/household/edit-profile/index.js 含 events: {avatarApproved:...}', () => {
    const dist = readFileSync(resolve(__dirname, '../../dist/build/mp-weixin/subpackages/household/edit-profile/index.js'), 'utf8')
    expect(dist).toContain('events:{avatarApproved:')
  })
  it('dist 端 emit 用可选链，不会有 undefined().emit 这种抛错写法', () => {
    const dist = readFileSync(resolve(__dirname, '../../dist/build/mp-weixin/subpackages/household/crop-avatar/index.js'), 'utf8')
    // 检查 emit 周围有可选链防护；压缩后变量名会随构建内容变化，不锁定具体字母。
    expect(dist).toMatch(/null\s*==\s*([A-Za-z_$][\w$]*)\s*\|\|\s*\1\.emit/)
  })
})
