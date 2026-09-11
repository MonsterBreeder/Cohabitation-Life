import { formatLegalContent, getLegalDocument, type LegalDocumentKind } from '../../src/pages/legal/legal-content'

describe('legal content', () => {
  it('协议和隐私政策都包含必要的法定小节', () => {
    const kinds: LegalDocumentKind[] = ['agreement', 'privacy']
    for (const kind of kinds) {
      const doc = getLegalDocument(kind)
      expect(doc.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(doc.sections.length).toBeGreaterThan(0)
      for (const section of doc.sections) {
        expect(section.title).toMatch(/^[一二三四五六七八九十]+、/)
        expect(section.paragraphs.length).toBeGreaterThan(0)
      }
    }
  })

  it('默认占位强调"待运营者提供"，确保未替换前不会被误认作正式文本', () => {
    const doc = formatLegalContent('privacy')
    expect(doc.placeholders.operatorName).toContain('待运营者')
    expect(doc.placeholders.contactEmail).toContain('待运营者')
    expect(doc.placeholders.contactAddress).toContain('待运营者')
    expect(doc.placeholders.retentionPeriod).toContain('待运营者')
  })

  it('调用方传入实际值时会替换正文中的占位', () => {
    const doc = formatLegalContent('privacy', {
      operatorName: '睦录示例团队',
      contactEmail: 'support@example.com',
      contactAddress: '上海市某区某路 1 号',
      retentionPeriod: '36 个月',
    })
    expect(doc.placeholders.operatorName).toBe('睦录示例团队')
    expect(doc.placeholders.contactEmail).toBe('support@example.com')
    expect(doc.placeholders.retentionPeriod).toBe('36 个月')
    const flattened = doc.sections.flatMap((section) => section.paragraphs).join('\n')
    expect(flattened).toContain('36 个月')
    expect(flattened).not.toContain('PLACEHOLDER_RETENTION')
  })

  it('未提供的占位仍以占位字符串呈现，不会被清空', () => {
    const doc = formatLegalContent('agreement', { operatorName: '睦录示例团队' })
    expect(doc.placeholders.operatorName).toBe('睦录示例团队')
    expect(doc.placeholders.contactEmail).toContain('待运营者')
  })

  it('段落不会被拼接为不可滚动查看的长字符串', () => {
    const doc = getLegalDocument('agreement')
    for (const section of doc.sections) {
      for (const paragraph of section.paragraphs) {
        // 单段控制在 200 字内，渲染时不会撑爆小屏
        expect(paragraph.length).toBeLessThanOrEqual(200)
      }
    }
  })
})
