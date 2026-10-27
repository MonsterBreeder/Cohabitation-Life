/** 文件用途：约定当前页未确认账目、短编号选择和无正文保存结果。 */
/** 当前页的一笔未确认人民币收支，未知必填信息保持空值。 */
export interface DraftEntry {
  /** 本页稳定项目编号。 */
  id: string
  /** 收支类型，未知先补问。 */
  type: 'expense' | 'income' | null
  /** 整数分金额。 */
  amountCents: number | null
  /** 具体日历，不按当前时间补默认。 */
  date: string | null
  /** 可选类目短编号。 */
  categoryKey: string | null
  /** 对应成员短编号。 */
  memberKey: string | null
  /** 用户明确填写的可选备注。 */
  note: string
  /** 仅系统餐饮适用的可选餐段。 */
  mealPeriod: 'breakfast' | 'lunch' | 'dinner' | null
}
/** 当前可选资料，不包含真实微信身份。 */
export interface DraftChoice {
  /** 本页范围内短编号。 */
  key: string
  /** 允许展示的名称。 */
  name: string
  /** 类目是否系统餐饮，成员资料不提供。 */
  dining?: boolean
  /** 当前成员标记，类目不提供。 */
  self?: boolean
}
/** 服务完整检查后才显示的草稿。 */
export interface DraftView {
  /** 是否还需要补充。 */
  status: 'DRAFT_READY' | 'DRAFT_CLARIFY'
  /** 页面不能解释或修改的有期限状态。 */
  sealed: string
  /** 不含原话来源副本的显示资料。 */
  draft: {
    /** 稳定草稿编号。 */
    id: string
    /** 防止旧响应覆盖当前内容的版本。 */
    revision: number
    /** 首次日历基准。 */
    anchorDay: string
    /** 固定过期时间。 */
    expiresAt: number
    /** 全部待核对账目。 */
    entries: DraftEntry[]
  }
  /** 本页可选类目。 */
  categories: DraftChoice[]
  /** 本页可选成员。 */
  members: DraftChoice[]
  /** 当前要补充的问句。 */
  question: string
}
/** 每项正式结果与无正文回执，不能凭模型文字生成成功状态。 */
export interface BatchResult {
  /** 固定响应种类。 */
  status: 'BATCH_RESULT'
  /** 仅用于查询原保存的批次引用。 */
  batchId: string
  /** 最终确认版本。 */
  version: number
  /** 每次明确保存后递增，旧请求不能重新获得原时限。 */
  attemptRevision: number
  /** 结果保留期限，不因查看续期。 */
  expiresAt: number
  /** 各项成功、明确失败、未知或未执行。 */
  items: {
    /** 对应原清单稳定编号。 */
    itemId: string
    /** 服务核对后的真实状态。 */
    status: 'success' | 'failed' | 'unknown' | 'unexecuted'
    /** 只有成功才允许打开的账目引用。 */
    entryId: string | null
    /** 固定错误编号，没有原消费描述。 */
    code: string | null
  }[]
}
