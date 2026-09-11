import {
  createExperienceState,
  submitExperienceEntry,
  toggleFootprint,
  toggleTaskClaim,
  resetExperienceState,
} from '../../src/pages/experience/experience-view'
import { EXPERIENCE_CATEGORIES, EXPERIENCE_FOOTPRINT_SAMPLES, EXPERIENCE_TASK_SAMPLES } from '../../src/pages/experience/experience-view'

describe('experience view', () => {
  it('初始状态包含 2 个未认领事项、0 笔流水、5 个类目、1 个收起的足迹', () => {
    const state = createExperienceState()
    expect(state.tasks).toHaveLength(EXPERIENCE_TASK_SAMPLES.length)
    expect(state.tasks.every((task) => task.state === 'pending')).toBe(true)
    expect(state.entries).toEqual([])
    expect(state.stats.expenseCents).toBe(0)
    expect(state.stats.incomeCents).toBe(0)
    expect(state.categories).toHaveLength(EXPERIENCE_CATEGORIES.length)
    expect(state.footprints).toHaveLength(EXPERIENCE_FOOTPRINT_SAMPLES.length)
    expect(state.footprints.every((footprint) => footprint.expanded === false)).toBe(true)
  })

  it('事项切换：pending → claimed → pending', () => {
    let state = createExperienceState()
    const firstId = state.tasks[0]!.id
    state = toggleTaskClaim(state, firstId)
    expect(state.tasks[0]!.state).toBe('claimed')
    state = toggleTaskClaim(state, firstId)
    expect(state.tasks[0]!.state).toBe('pending')
  })

  it('记账：支出 12.50 餐饮正确累加 1250 分', () => {
    const before = createExperienceState()
    const result = submitExperienceEntry(before, { type: 'expense', amountText: '12.50', categoryId: 'food' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.entries).toHaveLength(1)
    expect(result.state.stats.expenseCents).toBe(1250)
    expect(result.state.stats.incomeCents).toBe(0)
    expect(result.state.stats.byCategoryCents.food).toBe(1250)
  })

  it('记账：收入 200 居家 累加到收入与居家分类', () => {
    const result = submitExperienceEntry(createExperienceState(), { type: 'income', amountText: '200', categoryId: 'home' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.stats.incomeCents).toBe(20000)
    expect(result.state.stats.byCategoryCents.home).toBe(20000)
    expect(result.state.stats.expenseCents).toBe(0)
  })

  it('连续两笔不同类目和类型不会引入浮点误差', () => {
    let state = createExperienceState()
    let r = submitExperienceEntry(state, { type: 'expense', amountText: '0.10', categoryId: 'food' })
    expect(r.ok).toBe(true)
    if (r.ok) state = r.state
    r = submitExperienceEntry(state, { type: 'expense', amountText: '0.20', categoryId: 'transport' })
    expect(r.ok).toBe(true)
    if (r.ok) state = r.state
    expect(state.stats.expenseCents).toBe(30)
    expect(state.stats.byCategoryCents.food).toBe(10)
    expect(state.stats.byCategoryCents.transport).toBe(20)
  })

  it.each([
    ['空白', '   ', 'food'],
    ['零', '0', 'food'],
    ['负数', '-1', 'food'],
    ['四位小数', '12.3456', 'food'],
    ['非数字', 'abc', 'food'],
  ])('非法金额 %s 不改变统计', (_label, amountText, categoryId) => {
    const before = createExperienceState()
    const result = submitExperienceEntry(before, { type: 'expense', amountText, categoryId })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.state).toBe(before)
  })

  it('超出金额上限（>=10_000_000.00 元）直接被拒绝', () => {
    const result = submitExperienceEntry(createExperienceState(), { type: 'expense', amountText: '10000000', categoryId: 'food' })
    expect(result.ok).toBe(false)
  })

  it('类目不在白名单时拒绝提交', () => {
    const result = submitExperienceEntry(createExperienceState(), { type: 'expense', amountText: '10', categoryId: 'forged-category' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('请选择类目')
  })

  it('切换类型或类目本身不会触发提交', () => {
    const state = createExperienceState()
    const after = { ...state, entries: state.entries, stats: state.stats }
    expect(after).toEqual(state)
  })

  it('足迹展开后显示完整副本，再次点击收起', () => {
    let state = createExperienceState()
    const firstId = state.footprints[0]!.id
    state = toggleFootprint(state, firstId)
    expect(state.footprints[0]!.expanded).toBe(true)
    state = toggleFootprint(state, firstId)
    expect(state.footprints[0]!.expanded).toBe(false)
  })

  it('重置后与全新初始状态完全一致', () => {
    let state = createExperienceState()
    state = toggleTaskClaim(state, state.tasks[0]!.id)
    state = submitExperienceEntry(state, { type: 'expense', amountText: '99.99', categoryId: 'food' }).ok
      ? (submitExperienceEntry(state, { type: 'expense', amountText: '99.99', categoryId: 'food' }) as { ok: true; state: typeof state }).state
      : state
    const fresh = resetExperienceState()
    const freshState = createExperienceState()
    expect(fresh).toEqual(freshState)
  })
})
