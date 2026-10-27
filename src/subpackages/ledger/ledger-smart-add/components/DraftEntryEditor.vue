<!-- 文件用途：使用已有金额类目餐段规则编辑当前单笔，提交后由父页面再次核对。 -->
<template>
  <wd-popup
    :model-value="true"
    position="bottom"
    closable
    :close-on-click-modal="!busy"
    custom-style="border-radius:32rpx 32rpx 0 0;max-height:90vh;overflow:auto;"
    @close="emit('close')"
  >
    <view class="draft-entry-editor">
      <text class="draft-entry-editor__title">修改这笔账目</text>
      <AmountInput
        :model-value="local.amountCents || 0"
        :type="local.type || 'expense'"
        :disabled="busy"
        @update:model-value="local.amountCents = $event || null"
        @error="amountError = $event"
      />
      <wd-cell
        title="类型"
        :value="local.type === 'income' ? '收入' : '支出'"
        is-link
        :clickable="!busy"
        @click="typeVisible = !busy"
      />
      <wd-picker
        :model-value="local.type ? [local.type] : []"
        :columns="types"
        :visible="typeVisible"
        title="选择收支类型"
        :z-index="40"
        @confirm="chooseType"
        @cancel="typeVisible = false"
      />
      <text class="draft-entry-editor__label">类目</text>
      <CategoryPicker
        :categories="categoryViews"
        :model-value="local.categoryKey"
        :allow-add="false"
        @update:model-value="chooseCategory"
      />
      <wd-cell
        title="日期"
        :value="local.date || '请选择'"
        is-link
        :clickable="!busy"
        @click="dateVisible = !busy"
      />
      <wd-datetime-picker
        :model-value="dateValue"
        type="date"
        title="选择日期"
        :visible="dateVisible"
        :z-index="40"
        @confirm="chooseDate"
        @cancel="dateVisible = false"
      />
      <wd-cell
        :title="local.type === 'income' ? '收入成员' : '付款人'"
        :value="memberLabel"
        is-link
        :clickable="!busy"
        @click="memberVisible = !busy"
      />
      <wd-picker
        :model-value="local.memberKey ? [local.memberKey] : []"
        :columns="memberOptions"
        :visible="memberVisible"
        title="选择对应成员"
        :z-index="40"
        @confirm="chooseMember"
        @cancel="memberVisible = false"
      />
      <MealPeriodPicker v-if="dining" v-model="local.mealPeriod" :disabled="busy" />
      <wd-textarea
        v-model="local.note"
        :maxlength="100"
        show-word-limit
        :disabled="busy"
        placeholder="备注（可选）"
      />
      <text v-if="amountError" class="draft-entry-editor__error">{{ amountError }}</text>
      <wd-button
        block
        :loading="busy"
        :disabled="
          busy ||
          !!amountError ||
          !local.amountCents ||
          !local.type ||
          !local.date ||
          !local.memberKey ||
          !local.categoryKey
        "
        data-testid="smart-draft-edit-confirm"
        @click="emit('save', { ...local })"
      >
        核对修改
      </wd-button>
    </view>
  </wd-popup>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import AmountInput from '../../ledger-add/components/AmountInput.vue'
import CategoryPicker from '../../ledger-add/components/CategoryPicker.vue'
import MealPeriodPicker from '../../ledger-add/components/MealPeriodPicker.vue'
import type { CategoryView } from '../../../../pages/ledger/ledger-home-view'
import type { DraftChoice, DraftEntry } from '../../../../types/ledger-draft'
/** 进入编辑时父级挂载新组件，局部副本不污染待确认清单。 */
const props = defineProps<{
  entry: DraftEntry
  categories: readonly DraftChoice[]
  members: readonly DraftChoice[]
  busy: boolean
}>()
/** 修改交回父级核对，关闭只丢弃本次局部修改。 */
const emit = defineEmits<{ save: [entry: DraftEntry]; close: [] }>()
/** 当前编辑副本，绝不直接修改属性。 */
const local = reactive<DraftEntry>({ ...props.entry })
/** 金额输入不合法时不能提交上一次合法值。 */
const amountError = ref('')
/** 各选择器仅控制本编辑弹层，不触发页面退出清理。 */
const typeVisible = ref(false)
/** 日期弹层只在用户点击后打开。 */
const dateVisible = ref(false)
/** 成员弹层使用当前快照。 */
const memberVisible = ref(false)
/** 固定收支选项。 */
const types = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
]
/** 成员短编号转换为Wot UI选择项。 */
const memberOptions = computed(
  /**
   * 从本页只读状态计算显示或操作条件，不在计算中调用云端。
   */
  () =>
    props.members.map(
      /**
       * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
       */
      (
        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        item,
      ) => ({ value: item.key, label: item.self ? `${item.name}（我）` : item.name }),
    ),
)
/** 当前成员显示名称与真实后台身份分离。 */
const memberLabel = computed(
  /**
   * 从本页只读状态计算显示或操作条件，不在计算中调用云端。
   */
  () =>
    props.members.find(
      /**
       * 按当前稳定字段匹配单项，供后续核对；没有匹配时保持空值。
       */
      (
        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        item,
      ) => item.key === local.memberKey,
    )?.name || '请选择',
)
/** 复用原类目芯片，不开放新建类目。 */
const categoryViews = computed<CategoryView[]>(
  /**
   * 从本页只读状态计算显示或操作条件，不在计算中调用云端。
   */
  () =>
    props.categories.map(
      /**
       * 将当前项转成调用方所需的固定形状，返回转换值；不触发正式保存。
       */
      (
        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        item,
      ) => ({
        id: item.key,
        key: item.key,
        name: item.name,
        iconKey: 'tag',
        colorKey: 'mint',
        isCustom: false,
        colorHex: '#e6f4eb',
        iconName: 'tag',
      }),
    ),
)
/** 仅当前系统餐饮显示餐段。 */
const dining = computed(
  /**
   * 从本页只读状态计算显示或操作条件，不在计算中调用云端。
   */
  () =>
    props.categories.some(
      /**
       * 核对集合中是否存在符合当前条件的项，返回布尔结果。
       */
      (
        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        item,
      ) => item.key === local.categoryKey && item.dining,
    ),
)
/** 已明确日期用于选择器显示；只有确认选择才修改本项日期。 */
const dateValue = computed(
  /**
   * 从本页只读状态计算显示或操作条件，不在计算中调用云端。
   */
  () => (local.date ? new Date(`${local.date}T12:00:00+08:00`).getTime() : Date.now()),
)
/** 选择类型仍限于原账本的收入支出。 */
function chooseType(
  /**
   * 当前组件或平台事件，只读取本操作需要的字段。
   */
  event: {
    /**
     * 当前待检查或转换的值，通过对应规则后才能使用。
     */
    value: unknown
  },
): void {
  /**
   * 当前待检查或转换的值，通过对应规则后才能使用。
   */
  const value = Array.isArray(event.value) ? event.value[0] : null
  if (value === 'income' || value === 'expense') local.type = value
  typeVisible.value = false
}
/** 选择对应成员，不向页面暴露内部身份。 */
function chooseMember(
  /**
   * 当前组件或平台事件，只读取本操作需要的字段。
   */
  event: {
    /**
     * 当前待检查或转换的值，通过对应规则后才能使用。
     */
    value: unknown
  },
): void {
  /**
   * 当前待检查或转换的值，通过对应规则后才能使用。
   */
  const value = Array.isArray(event.value) ? event.value[0] : null
  if (typeof value === 'string') local.memberKey = value
  memberVisible.value = false
}
/** 换成非餐饮时清空旧餐段，避免出现隐藏值。 */
function chooseCategory(
  /**
   * 当前待检查或转换的值，通过对应规则后才能使用。
   */
  value: string | null,
): void {
  if (props.busy) return
  local.categoryKey = value
  if (
    !props.categories.some(
      /**
       * 核对集合中是否存在符合当前条件的项，返回布尔结果。
       */
      (
        /**
         * 当前集合中的单项，使用所在集合的既有范围和检查规则。
         */
        item,
      ) => item.key === value && item.dining,
    )
  )
    local.mealPeriod = null
}
/** 用户确认日历后才写具体日，不在打开弹层时填默认。 */
function chooseDate(
  /**
   * 当前组件或平台事件，只读取本操作需要的字段。
   */
  event: {
    /**
     * 当前待检查或转换的值，通过对应规则后才能使用。
     */
    value: unknown
  },
): void {
  if (typeof event.value !== 'number') return

  /**
   * 本次已明确或由用户确认的日历值，不在打开弹层时填默认。
   */
  const date = new Date(event.value)
  local.date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  dateVisible.value = false
}
</script>

<style lang="scss" scoped>
/* 编辑弹层与原记账页共用品牌和输入组件。 */
.draft-entry-editor {
  display: flex;
  flex-direction: column;
  gap: 28rpx;
  padding: 48rpx 32rpx calc(40rpx + env(safe-area-inset-bottom));
  &__title {
    font-size: 36rpx;
    font-weight: 700;
  }
  &__label {
    font-size: 28rpx;
  }
  &__error {
    color: #a13f29;
    font-size: 24rpx;
  }
}
</style>
