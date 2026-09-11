// 阶段二：邀请 store 的预览必须绑定到当前凭证，
// 旧请求的迟到响应不能覆盖新邀请，也不应让用户看见历史摘要。
import { createPinia, setActivePinia } from 'pinia'
import { resetInvitationCloudForTesting, setInvitationCloudEnvironmentForTesting, setInvitationCloudRuntimeForTesting } from '../../src/services/invitation-cloud'
import { useInvitationStore } from '../../src/store/modules/invitation'

const callFunction = jest.fn()

beforeEach(() => {
  setActivePinia(createPinia())
  resetInvitationCloudForTesting()
  callFunction.mockReset()
  setInvitationCloudEnvironmentForTesting('test-env')
  setInvitationCloudRuntimeForTesting({ cloud: { init: jest.fn(), callFunction } })
})

afterEach(() => {
  resetInvitationCloudForTesting()
})

const tokenA = 'A'.repeat(32)
const tokenB = 'B'.repeat(32)

function previewFor(token: string) {
  return { status: 'INVITE_PREVIEW', retryable: false,
    household: { name: '我们的小家', avatar: { kind: 'builtin', id: 'household-01' }, memberCount: 1 },
    inviter: { nickname: `邀请人_${token.slice(0, 4)}`, avatar: { kind: 'builtin', id: 'person-01' } },
  }
}

describe('invitation store preview token binding', () => {
  it('接受与当前凭证匹配的预览响应', async () => {
    let resolve!: (value: { result: unknown }) => void
    callFunction.mockImplementation(() => new Promise((r) => { resolve = r }))
    const store = useInvitationStore()

    const pending = store.previewInvite(tokenA)
    resolve({ result: previewFor(tokenA) })
    await pending

    expect(store.preview?.inviter.nickname).toBe(`邀请人_${tokenA.slice(0, 4)}`)
    expect(store.previewToken).toBe(tokenA)
  })

  it('迟到响应不覆盖最新一次预览（同一 token 仍属于旧版本）', async () => {
    let resolveA!: (value: { result: unknown }) => void
    let resolveB!: (value: { result: unknown }) => void
    callFunction.mockImplementationOnce(() => new Promise((r) => { resolveA = r }))
      .mockImplementationOnce(() => new Promise((r) => { resolveB = r }))
    const store = useInvitationStore()

    const first = store.previewInvite(tokenA)
    const second = store.previewInvite(tokenB)

    // 第二个请求先返回
    resolveB({ result: previewFor(tokenB) })
    await second
    expect(store.preview?.inviter.nickname).toBe(`邀请人_${tokenB.slice(0, 4)}`)

    // 第一个请求迟到：版本已被覆盖，丢弃
    resolveA({ result: previewFor(tokenA) })
    await first

    expect(store.preview?.inviter.nickname).toBe(`邀请人_${tokenB.slice(0, 4)}`)
    expect(store.previewToken).toBe(tokenB)
  })

  it('失败响应同样被版本检查拦截', async () => {
    let rejectA!: (reason: unknown) => void
    let resolveB!: (value: { result: unknown }) => void
    callFunction.mockImplementationOnce(() => new Promise((_r, rej) => { rejectA = rej }))
      .mockImplementationOnce(() => new Promise((r) => { resolveB = r }))
    const store = useInvitationStore()

    const first = store.previewInvite(tokenA)
    const second = store.previewInvite(tokenB)
    resolveB({ result: previewFor(tokenB) })
    await second

    rejectA(new Error('offline'))
    await first

    expect(store.errorMessage).toBeUndefined()
    expect(store.phase).toBe('idle')
    expect(store.preview?.inviter.nickname).toBe(`邀请人_${tokenB.slice(0, 4)}`)
  })

  it('clearPreview 让下一次预览的迟到响应也不再写入', async () => {
    let resolveA!: (value: { result: unknown }) => void
    callFunction.mockImplementationOnce(() => new Promise((r) => { resolveA = r }))
    const store = useInvitationStore()

    const first = store.previewInvite(tokenA)
    store.clearPreview()
    resolveA({ result: previewFor(tokenA) })
    await first

    expect(store.preview).toBeUndefined()
    expect(store.previewToken).toBeUndefined()
  })
})

describe('invitation store phase getter', () => {
  it('invitePreviewStatus 把 phase 折叠成 welcome-view 期望的字符串', async () => {
    let resolve!: (value: { result: unknown }) => void
    callFunction.mockImplementation(() => new Promise((r) => { resolve = r }))
    const store = useInvitationStore()

    expect(store.invitePreviewStatus).toBe('idle')

    const pending = store.previewInvite(tokenA)
    expect(store.invitePreviewStatus).toBe('previewing')
    resolve({ result: previewFor(tokenA) })
    await pending

    expect(store.invitePreviewStatus).toBe('idle')

    // 强制把 store 置到 failed 验证映射
    callFunction.mockRejectedValueOnce(new Error('offline'))
    await store.previewInvite(tokenB)
    expect(store.invitePreviewStatus).toBe('failed')
  })
})
