// 协议与隐私政策正文（PRD 001 / Plan U3）。
// 约束：
// - 文本只用于本地展示，不上传云端；不得引用用户或家庭的实时数据
// - 运营者名称、联系渠道、保存期限等法定信息以占位形式给出，
//   实际内容必须由项目运营者提供并确认；未确认前不要把页面标记为"可提审完成"

export type LegalDocumentKind = 'agreement' | 'privacy'

export interface LegalSection {
  title: string
  paragraphs: string[]
}

export interface LegalDocument {
  kind: LegalDocumentKind
  eyebrow: string
  effectiveDate: string
  sections: LegalSection[]
  /** 受控的运营者占位；调用方按需替换。 */
  placeholders: {
    operatorName: string
    contactEmail: string
    contactAddress: string
    retentionPeriod: string
  }
}

const PLACEHOLDER_NAME = '[待运营者填写：产品运营方名称]'
const PLACEHOLDER_EMAIL = '[待运营者填写：联系邮箱]'
const PLACEHOLDER_ADDRESS = '[待运营者填写：联系地址]'
const PLACEHOLDER_RETENTION = '[待运营者填写：数据保存期限]'

const AGREEMENT: LegalDocument = {
  kind: 'agreement',
  eyebrow: '用户协议',
  effectiveDate: '2026-09-11',
  placeholders: {
    operatorName: PLACEHOLDER_NAME,
    contactEmail: PLACEHOLDER_EMAIL,
    contactAddress: PLACEHOLDER_ADDRESS,
    retentionPeriod: PLACEHOLDER_RETENTION,
  },
  sections: [
    {
      title: '一、本协议的范围与生效',
      paragraphs: [
        '本协议由你与睦录产品的运营方（以下称"我们"）共同订立，用于规范你访问、注册和使用睦录小程序的全过程。',
        '当你点击"同意"或实际使用我们提供的功能时，即视为你已经阅读、理解并同意本协议的全部内容。',
        '我们保留根据法律法规变更及业务调整修订本协议的权利；修订后的协议将在生效前通过小程序公告或页面提示告知。',
      ],
    },
    {
      title: '二、我们可以做什么',
      paragraphs: [
        '睦录用于帮助两位成员共同记录家庭事项、家庭账本和家庭足迹；你只能基于真实家庭关系使用本产品。',
        '你通过本产品提交的记录和资料，将仅在受邀加入的家庭成员之间可见，不会被用于跨家庭共享。',
        '我们会持续改进产品体验，但不对特定功能在所有设备上的可用性作出绝对保证。',
      ],
    },
    {
      title: '三、你的义务与禁止行为',
      paragraphs: [
        '你应确保你提供的昵称、头像、家庭名称等资料不侵犯他人合法权益，不包含违法违规或令人不适的内容。',
        '你不得利用睦录从事商业宣传、骚扰他人、传播违法信息或从事其他违反法律法规的活动。',
        '如你发现他人违反上述约定或对家庭内容造成困扰，请通过本协议末尾的联系方式告知我们。',
      ],
    },
    {
      title: '四、协议变更与终止',
      paragraphs: [
        '我们可能根据法律法规变化或业务调整修改本协议；重大变更会提前在产品内提示，请你定期查看。',
        '如你不同意变更后的协议，可以停止使用睦录并按隐私政策指引处理你提交的资料。',
        '如你严重违反本协议，我们可能暂停或终止向你提供服务，并依法依约处理相关数据。',
      ],
    },
  ],
}

const PRIVACY: LegalDocument = {
  kind: 'privacy',
  eyebrow: '隐私政策',
  effectiveDate: '2026-09-11',
  placeholders: {
    operatorName: PLACEHOLDER_NAME,
    contactEmail: PLACEHOLDER_EMAIL,
    contactAddress: PLACEHOLDER_ADDRESS,
    retentionPeriod: PLACEHOLDER_RETENTION,
  },
  sections: [
    {
      title: '一、我们收集哪些信息',
      paragraphs: [
        '为了建立和同步你的家庭，我们会使用微信云开发确认的微信身份；我们不会在未取得你同意前获取你的微信昵称、头像或其他资料。',
        '你主动填写或上传的家庭名称、家庭头像、成员昵称、成员头像、家庭事项、家庭账本和共同足迹等，仅在受邀加入的家庭成员之间共享。',
        '在你首次进入家庭前，你可以在不提供任何资料的情况下体验"事项认领、临时记账、查看示例足迹"三个独立功能；这些体验不写入真实家庭，也不会跨设备同步。',
      ],
    },
    {
      title: '二、我们如何使用这些信息',
      paragraphs: [
        '我们仅在你明确同意本协议并完成开始使用后，才会创建一份最小身份用于同步你的家庭。',
        '你的家庭资料仅在两位家庭成员之间共享；我们不会把家庭业务数据用于跨家庭展示或公开。',
        '我们可能使用聚合、匿名化后的统计数据来改进产品，但这些数据无法识别到你或你的家庭。',
      ],
    },
    {
      title: '三、你的权利',
      paragraphs: [
        '你可以在家庭资料和个人资料页面查看、修改你的昵称、头像和家庭信息。',
        '如你不再使用睦录，可以通过"移除家庭成员"或删除小程序的方式停止同步；按法律法规要求，部分必要记录仍可能由我们保留。',
        '如你对个人信息处理有任何疑问，可通过本政策末尾的联系方式与我们联系；我们会在合理期限内回复。',
      ],
    },
    {
      title: '四、信息保存与保护',
      paragraphs: [
        '你的家庭数据保存于中华人民共和国境内的微信云开发环境内，加密传输并按最小权限原则授权。',
        '本政策所称"必要保存期限"为：PLACEHOLDER_RETENTION；超过必要期限后我们会依法删除或匿名化处理。',
        '如发生个人信息安全事件，我们将在知悉后 72 小时内向你和有关主管部门报告。',
      ],
    },
  ],
}

const DOCUMENTS: Record<LegalDocumentKind, LegalDocument> = {
  agreement: AGREEMENT,
  privacy: PRIVACY,
}

export interface LegalContentValues {
  operatorName?: string
  contactEmail?: string
  contactAddress?: string
  retentionPeriod?: string
}

/** 按入参覆盖默认占位；未提供时仍保留占位文本，提醒运营者补齐。 */
export function formatLegalContent(kind: LegalDocumentKind, values: LegalContentValues = {}): LegalDocument {
  const base = DOCUMENTS[kind]
  return {
    ...base,
    placeholders: {
      operatorName: values.operatorName?.trim() || base.placeholders.operatorName,
      contactEmail: values.contactEmail?.trim() || base.placeholders.contactEmail,
      contactAddress: values.contactAddress?.trim() || base.placeholders.contactAddress,
      retentionPeriod: values.retentionPeriod?.trim() || base.placeholders.retentionPeriod,
    },
    sections: base.sections.map((section) => ({
      ...section,
      paragraphs: section.paragraphs.map((paragraph) => paragraph
        .replace(/PLACEHOLDER_RETENTION/g, values.retentionPeriod?.trim() || base.placeholders.retentionPeriod)
        .replace(/PLACEHOLDER_NAME/g, values.operatorName?.trim() || base.placeholders.operatorName)),
    })),
  }
}

/** 仅供单元测试使用：返回原始文档结构。 */
export function getLegalDocument(kind: LegalDocumentKind): LegalDocument {
  return DOCUMENTS[kind]
}
