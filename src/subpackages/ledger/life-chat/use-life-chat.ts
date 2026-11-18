// 文件用途：管理当前聊天和最后一次确认，隔离离开页面或取消后迟到的回复。
import { computed, shallowRef } from 'vue'
import type { createLifeChatClient, LifeChatResult } from '../../../services/life-chat-cloud'
import type { LifeChatScope } from '../../../utils/life-chat-entry'
import { draftRequestId } from '../ledger-smart-add/use-ledger-draft'

export interface LifeChatMessage {
  id: number
  text?: string
  result?: LifeChatResult
}

const resultMessages: Record<string, string> = {
  busy: '上一条还在处理，请稍等。',
  duplicate: '没有收到上次的回复，可以再发送这句话。',
  connection_interrupted: '连接中断，这句话已留在输入框。',
  expired: '本次聊天或卡片已过期，请重新开始。',
  out_of_scope: '这句话涉及其他栏目，请从右下角的聊天入口进入。',
  invalid_request: '请检查要处理的内容后再试。',
  invalid_suggestion: '还没能核对这句话，请再说具体一些。',
  unsupported: '可以查账、记事项或记录去过的地方。',
  forbidden: '你没有操作这条记录的权限。',
  terminal: '这件事项已经结束，可以在原页面查看。',
  record_changed: '这条记录已经变了，请重新查找和确认。',
  narrow_scope: '范围有点大，请补充日期或更具体的名称。',
  content_rejected: '内容未能通过检查，请修改后再试。',
  content_check_unavailable: '内容检查暂时不可用，请稍后再试。',
  question_limit: '今天问账次数已用完。',
  daily_limit: '今天的聊天助手次数已用完。',
  preview_limit: '本轮聊天预览的 6 次测试额度已用完。',
  disabled: '聊天助手暂时不可用，可以返回原页面手动操作。',
  unavailable: '这条消息没处理完，可以再试一次。',
  cancelled: '已取消。',
  unknown: '还不能确定保存结果，请先查回。',
  not_saved: '这次未完成的保存已停止。',
}

/** 页面只展示已登记的失败提示，上层不直接输出未知异常。 */
export function resultNotice(result: LifeChatResult): string {
  return result.question || result.message || resultMessages[result.kind] || ''
}

/** 状态由本页持有，外部只提交用户点击或输入。 */
export function useLifeChat(call: ReturnType<typeof createLifeChatClient>, readScope: () => LifeChatScope) {
  const ready = shallowRef(false)
  const booting = shallowRef(true)
  const busy = shallowRef(false)
  const consenting = shallowRef(false)
  const text = shallowRef('')
  const error = shallowRef('')
  const status = shallowRef('')
  const messages = shallowRef<LifeChatMessage[]>([])
  const activeCard = shallowRef('')
  const remainingActions = shallowRef<LifeChatResult['remainingActions']>()
  const pendingOperation = shallowRef('')
  const draftInput = shallowRef('')
  let sessionId = ''
  let messageId = 0
  let generation = 0
  let activeRequest = ''
  let closed = false
  let retry: { text: string; id?: string } | undefined

  const canSend = computed(() => ready.value && !busy.value && !consenting.value && !pendingOperation.value)

  /** 每次展示新卡都撤下上一张的操作按钮。 */
  function append(result: LifeChatResult) {
    if (result.credential) activeCard.value = result.credential
    messages.value = [...messages.value, { id: ++messageId, result }]
  }

  /** 普通回复和卡片选择共用同一个接收入口，续办也能进入记账草稿。 */
  function showResult(result: LifeChatResult) {
    if (result.remainingActions) remainingActions.value = result.remainingActions
    if (result.kind === 'ledger_draft' && result.text) draftInput.value = result.text
    else append(result)
  }

  /** 单次检测不发送任何原话。 */
  async function initialize() {
    booting.value = true
    const result = await call('status')
    if (closed) return
    booting.value = false
    ready.value = result.kind === 'ready' && result.version === 1
    error.value = ready.value ? '' : resultNotice(result)
  }

  /** 同意前只在页面内保留输入。重复提交沿用同一请求编号。 */
  async function send(accepted = false) {
    const input = text.value.trim()
    if (closed || !ready.value || busy.value || pendingOperation.value || !input || input.length > 2000)
      return
    if (!sessionId && !accepted) {
      consenting.value = true
      return
    }
    const stamp = ++generation
    busy.value = true
    consenting.value = false
    error.value = ''
    status.value = '正在处理这条消息…'
    if (!sessionId) {
      const opened = await call('open', { scope: readScope(), consent: 1 })
      if (closed || generation !== stamp) {
        if (opened.sessionId) void call('close', { sessionId: opened.sessionId })
        return
      }
      if (opened.kind !== 'opened' || !opened.sessionId) {
        busy.value = false
        status.value = ''
        error.value = resultNotice(opened)
        return
      }
      sessionId = opened.sessionId
    }
    const sameRequest = retry?.text === input
    const requestId = (sameRequest && retry?.id) || draftRequestId()
    const latest = [...messages.value].reverse().find((item) => item.result)?.result
    const context =
      latest?.kind === 'clarify'
        ? messages.value
            .filter((item) => item.text)
            .slice(sameRequest ? -4 : -3)
            .filter((item, index, items) => !sameRequest || index !== items.length - 1)
            .map((item) => item.text!.slice(0, 600))
        : []
    if (!sameRequest) messages.value = [...messages.value, { id: ++messageId, text: input }]
    activeRequest = requestId
    text.value = ''
    const shortConfirm =
      /^(?:可以|好(?:的)?|确认(?:修改|新增|删除|保存|记账)?|删吧|改吧|保存|记吧)[。！! ]*$/.test(input)
    if (!shortConfirm) activeCard.value = ''
    const result = await call('ask', { sessionId, requestId, text: input, context })
    if (closed || generation !== stamp) return
    activeRequest = ''
    status.value = ''
    busy.value = false
    const waitingForReply =
      result.kind === 'connection_interrupted' || (result.kind === 'duplicate' && result.state === 'running')
    const retainInput = waitingForReply || ['unavailable', 'busy', 'duplicate'].includes(result.kind)
    retry = retainInput ? { text: input, id: waitingForReply ? requestId : undefined } : undefined
    if (retry) {
      text.value = input
      error.value =
        result.kind === 'duplicate' && waitingForReply ? resultMessages.busy : resultNotice(result)
      return
    }
    if (result.kind === 'expired') {
      sessionId = ''
      remainingActions.value = undefined
    }
    showResult(result)
  }

  /** 完成、取消或核对当前操作后，再取出同一句话里的余项，不重新理解原话。 */
  async function resumeActions() {
    if (closed || busy.value || activeCard.value || pendingOperation.value || !remainingActions.value) return
    const stamp = ++generation
    busy.value = true
    status.value = '正在取回剩余操作…'
    const result = await call('resume_actions', { sessionId, credential: remainingActions.value.credential })
    if (closed || generation !== stamp) return
    busy.value = false
    status.value = ''
    if (result.kind === 'choose_action' || result.kind === 'expired') remainingActions.value = undefined
    showResult(result)
  }

  /** 点卡片才允许打开下一步，整个过程共用页面和当前会话的编号。 */
  async function card(
    action: 'choose' | 'pick_place' | 'confirm' | 'cancel',
    item: LifeChatResult,
    input: Record<string, unknown> = {},
  ) {
    if (closed || busy.value || !item.credential || item.credential !== activeCard.value) return
    const stamp = ++generation
    busy.value = true
    error.value = ''
    status.value = action === 'confirm' ? '正在保存…' : '正在核对…'
    if (action === 'confirm') pendingOperation.value = item.operationId ?? ''
    const result = await call(action, { ...input, sessionId, credential: item.credential })
    if (closed || generation !== stamp) return
    status.value = ''
    busy.value = false
    const unknown = action === 'confirm' && ['unknown', 'unavailable'].includes(result.kind)
    if (!unknown) pendingOperation.value = ''
    const keepOptions = action === 'choose' && ['question_limit', 'narrow_scope'].includes(result.kind)
    if (!keepOptions && (result.kind !== 'unavailable' || unknown)) activeCard.value = ''
    showResult(unknown ? { kind: 'unknown' } : result)
    return result
  }

  /** 查回查看确切保存结果，查询失败不重新执行写入。 */
  async function recover(stop = false) {
    if (closed || busy.value || !pendingOperation.value) return
    const stamp = ++generation
    busy.value = true
    status.value = '正在查回保存结果…'
    const result = await call(stop ? 'stop_operation' : 'recover', { operationId: pendingOperation.value })
    if (closed || generation !== stamp) return
    busy.value = false
    status.value = ''
    if (result.kind === 'saved' || result.kind === 'not_saved') pendingOperation.value = ''
    append(result)
  }

  /** 等待取消后只收回展示资格，确认写入和查回不走这里。 */
  function cancelWait() {
    if (!activeRequest) return
    void call('cancel_request', { sessionId, requestId: activeRequest })
    activeRequest = ''
    generation++
    busy.value = false
    status.value = ''
    append({ kind: 'cancelled' })
  }

  /** 离开时清掉对话和确认，仅向当前会话发出关闭。 */
  function dispose() {
    closed = true
    generation++
    if (sessionId) void call('close', { sessionId })
    sessionId = ''
    text.value = ''
    messages.value = []
    activeCard.value = ''
    remainingActions.value = undefined
    draftInput.value = ''
    pendingOperation.value = ''
    ready.value = false
  }

  return {
    ready,
    booting,
    busy,
    status,
    consenting,
    text,
    error,
    messages,
    activeCard,
    remainingActions,
    draftInput,
    pendingOperation,
    canSend,
    initialize,
    send,
    card,
    resumeActions,
    recover,
    cancelWait,
    dispose,
    read: (action: 'source' | 'sources', input: Record<string, unknown>) =>
      call(action, { ...input, sessionId }),
  }
}
