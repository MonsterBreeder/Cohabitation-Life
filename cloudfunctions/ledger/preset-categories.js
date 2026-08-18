// PRD 008：8 个固定类目（系统预设）。家庭创建时由 initCategories 一次性写入。
// 任何用户都能"添加"自定义类目（addCategory），但不能"删除"系统预设。
// 自定义类目也不允许使用 key 跟系统预设重复。

const PRESET_CATEGORIES = Object.freeze([
  Object.freeze({ key: 'dining',     name: '餐饮', iconKey: 'fork-spoon',    colorKey: 'amber',  sortOrder: 0 }),
  Object.freeze({ key: 'transport',  name: '交通', iconKey: 'car',           colorKey: 'blue',   sortOrder: 1 }),
  Object.freeze({ key: 'home',       name: '居家', iconKey: 'house',         colorKey: 'mint',   sortOrder: 2 }),
  Object.freeze({ key: 'entertain',  name: '娱乐', iconKey: 'gamepad',       colorKey: 'coral',  sortOrder: 3 }),
  Object.freeze({ key: 'medical',    name: '医疗', iconKey: 'first-aid',     colorKey: 'red',    sortOrder: 4 }),
  Object.freeze({ key: 'clothing',   name: '服饰', iconKey: 'shopping-bag',  colorKey: 'purple', sortOrder: 5 }),
  Object.freeze({ key: 'education',  name: '教育', iconKey: 'book',          colorKey: 'teal',   sortOrder: 6 }),
  Object.freeze({ key: 'other',      name: '其他', iconKey: 'tag',           colorKey: 'gray',   sortOrder: 7 }),
])

// 类目图标 key 白名单（自定义类目必须用这里面的 key；不允许自由上传）
const ALLOWED_ICON_KEYS = new Set([
  'fork-spoon', 'car', 'house', 'gamepad', 'first-aid', 'shopping-bag', 'book', 'tag',
])

// 类目颜色 key 白名单
const ALLOWED_COLOR_KEYS = new Set([
  'amber', 'blue', 'mint', 'coral', 'red', 'purple', 'teal', 'gray',
])

const PRESET_KEYS = new Set(PRESET_CATEGORIES.map((c) => c.key))

module.exports = {
  PRESET_CATEGORIES,
  ALLOWED_ICON_KEYS,
  ALLOWED_COLOR_KEYS,
  PRESET_KEYS,
}
