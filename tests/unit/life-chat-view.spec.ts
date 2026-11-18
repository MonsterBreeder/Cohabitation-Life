// 文件用途：核对当前页面同意、取消、迟到响应与原操作查回。
import { useLifeChat } from '../../src/subpackages/ledger/life-chat/use-life-chat'
import { createLifeChatClient, type LifeChatResult } from '../../src/services/life-chat-cloud'

test('首次输入等待用户同意，取消等待后迟到结果不恢复', async () => {
  let finish!: (result: LifeChatResult) => void
  const later = new Promise<LifeChatResult>((resolve) => {
    finish = resolve
  })
  const client = jest.fn(async (action: string): Promise<LifeChatResult> => {
    if (action === 'status') return { kind: 'ready', version: 1 }
    if (action === 'open') return { kind: 'opened', sessionId: 'local-session' }
    if (action === 'ask') return later
    return { kind: 'cancelled' }
  })
  const view = useLifeChat(client, () => 'task')
  await view.initialize()
  view.text.value = '记一下交电费'
  await view.send()
  expect(view.consenting.value).toBe(true)
  expect(client).toHaveBeenCalledTimes(1)
  const active = view.send(true)
  await Promise.resolve()
  view.cancelWait()
  finish({ kind: 'confirm', credential: 'late-card' })
  await active
  expect(view.activeCard.value).toBe('')
  expect(view.messages.value.at(-1)?.result?.kind).toBe('cancelled')
  expect(client.mock.calls.map(([action]) => action)).toEqual(['status', 'open', 'ask', 'cancel_request'])
})

test('保存结果未知时只查询原操作，点击查回后恢复输入', async () => {
  const pending = { kind: 'confirm', credential: 'current-card', operationId: 'same-operation' }
  const actions: string[] = []
  const client = async (action: string, payload?: Record<string, unknown>): Promise<LifeChatResult> => {
    actions.push(action)
    if (action === 'status') return { kind: 'ready', version: 1 }
    if (action === 'open') return { kind: 'opened', sessionId: 'local-session' }
    if (action === 'ask') return pending
    if (action === 'confirm') return { kind: 'unknown' }
    expect(payload?.operationId).toBe('same-operation')
    return { kind: 'saved', domain: 'ledger', action: 'update', id: 'record' }
  }
  const view = useLifeChat(client, () => 'ledger')
  await view.initialize()
  view.text.value = '把打车改成32元'
  await view.send(true)
  await view.card('confirm', pending)
  expect(view.canSend.value).toBe(false)
  await view.recover()
  expect(view.canSend.value).toBe(true)
  expect(actions).toEqual(['status', 'open', 'ask', 'confirm', 'recover'])
})

test('失败后保留原话，只有原请求仍可能运行时才沿用原编号', async () => {
  const replies = [
    { kind: 'unavailable' },
    new Error('连接已断开'),
    { kind: 'duplicate', state: 'running' },
    { kind: 'duplicate', state: 'interrupted' },
    { kind: 'answer', message: '找到 1 笔账目。', candidates: [] },
  ]
  const requests: string[] = []
  const client = createLifeChatClient('fixture-home', {
    init() {},
    async callFunction({ data }) {
      if (data.action === 'status') return { result: { kind: 'ready', version: 1 } }
      if (data.action === 'open') return { result: { kind: 'opened', sessionId: 'fixture-session' } }
      requests.push(String(data.requestId))
      const reply = replies.shift()
      if (reply instanceof Error) throw reply
      return { result: reply }
    },
  })
  const view = useLifeChat(client, () => 'ledger')
  await view.initialize()
  const phrase = '查一下昨天的打车账'
  view.text.value = phrase
  for (let attempt = 0; attempt < 4; attempt++) {
    await view.send(attempt === 0)
    expect(view.text.value).toBe(phrase)
  }
  await view.send()
  expect(view.text.value).toBe('')
  expect(view.messages.value.filter((message) => message.text).map((message) => message.text)).toEqual([
    phrase,
  ])
  expect(view.messages.value.at(-1)?.result?.kind).toBe('answer')
  expect(requests[0]).not.toBe(requests[1])
  expect(requests.slice(1, 4)).toEqual([requests[1], requests[1], requests[1]])
  expect(new Set(requests).size).toBe(3)
})
