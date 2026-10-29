import generatedStyles from './generatedComponentStyles.json';
import metadata from './generatedComponentMetadata.json';
// Presets follow the library's README examples; every thumbnail uses the actual component.
export interface StyleNode { type: string; props: Record<string, any>; content?: string; children?: StyleNode[] }
export interface ComponentStyle {
  id: string;
  name: string;
  props: Record<string, unknown>;
  seeds?: Record<string, unknown>;
  matches?: (props: Record<string, any>) => boolean;
  children?: StyleNode[];
  content?: string;
}
export interface ComponentStyles { reset: Record<string, unknown>; items: ComponentStyle[]; nativeType?: string; docsPath?: string }
const preset = (id: string, name: string, props: Record<string, unknown>, seeds?: Record<string, unknown>, matches?: ComponentStyle['matches']): ComponentStyle => ({ id, name, props, seeds, matches });
const present = (value: unknown) => value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0);
const visible = (props: Record<string, any>, show: string, content: string) => props[show] ?? present(props[content]);
const label = { label: '描述信息' };
const description = { ...label, description: '所在位置：B3 空调机房' };
const notes = { multiLineNotes: ['已完成设备检查', '已记录现场情况', '等待后续处理'] };

export const curatedComponentStyles: Record<string, ComponentStyles> = {
  cell: {
    reset: {
      label: undefined, description: undefined, threeLine: false, threeLineEllipsis: false,
      icon: undefined, showIcon: false, rightIcon: '', showRightIcon: false, isLink: false,
      avatar: undefined, showAvatar: false, rightAvatar: undefined, showRightAvatar: false,
      showLeftSelect: false, showRightSelect: false, showTags: false, showTitleTag: false,
      showWrapTags: false, showTitleIcon: false, showMultiLineNotes: false, showTitleCollapseIcon: false,
      defaultMultiLineNotesCollapsed: false, showNote: false, showBadge: false, showBlueMark: false,
    },
    items: [
      preset('single', '基础单行', {}),
      preset('arrow', '单行右箭头', { isLink: true, showRightIcon: true }, undefined, (p) => !!visible(p, 'showRightIcon', 'rightIcon') || !!p.isLink),
      preset('double', '双行备注', {}, label, (p) => present(p.label)),
      preset('double-icon', '双行左图标', { showIcon: true }, { ...label, icon: 'location-o' }, (p) => present(p.label) && !!visible(p, 'showIcon', 'icon')),
      preset('double-arrow', '双行右箭头', { isLink: true, showRightIcon: true }, label, (p) => present(p.label) && !!(visible(p, 'showRightIcon', 'rightIcon') || p.isLink)),
      preset('icon', '左侧图标', { showIcon: true }, { icon: 'location-o' }, (p) => !present(p.label) && !!visible(p, 'showIcon', 'icon')),
      preset('title-tag', '跟随标题标签', { showTitleTag: true }, { titleTag: '标签' }, (p) => !!visible(p, 'showTitleTag', 'titleTag')),
      preset('wrap-tags', '换行标签栏', { showWrapTags: true }, { wrapTags: ['标签 1', '标签 2'] }, (p) => !!visible(p, 'showWrapTags', 'wrapTags')),
      preset('title-icon', '跟随标题图标', { showTitleIcon: true }, { titleIcon: 'info-o' }, (p) => !!visible(p, 'showTitleIcon', 'titleIcon')),
      preset('blue-mark', '前置小蓝标', { blueMark: true, showBlueMark: true }, undefined, (p) => !!(p.showBlueMark ?? p.blueMark)),
      preset('avatar', '左侧头像', { showAvatar: true }, { avatar: '/dog1.jpg' }, (p) => !!visible(p, 'showAvatar', 'avatar')),
      preset('right-avatar', '右侧头像', { showRightAvatar: true }, { rightAvatar: '/dog1.jpg' }, (p) => !!visible(p, 'showRightAvatar', 'rightAvatar')),
      preset('badge', '右侧徽标', { showBadge: true }, { badge: 9 }, (p) => !!visible(p, 'showBadge', 'badge')),
      preset('note', '右侧备注', { showNote: true }, { note: '备注' }, (p) => !!visible(p, 'showNote', 'note')),
      preset('left-checkbox', '前置复选', { showLeftSelect: true, selectType: 'checkbox' }, { leftSelect: false }, (p) => !!(p.showLeftSelect ?? p.leftSelect !== undefined) && p.selectType !== 'radio'),
      preset('left-radio', '前置单选', { showLeftSelect: true, selectType: 'radio' }, { leftSelect: true }, (p) => !!(p.showLeftSelect ?? p.leftSelect !== undefined) && p.selectType === 'radio'),
      preset('right-checkbox', '后置复选', { showRightSelect: true, selectType: 'checkbox' }, { rightSelect: false }, (p) => !!(p.showRightSelect ?? p.rightSelect !== undefined) && p.selectType !== 'radio'),
      preset('right-radio', '后置单选', { showRightSelect: true, selectType: 'radio' }, { rightSelect: true }, (p) => !!(p.showRightSelect ?? p.rightSelect !== undefined) && p.selectType === 'radio'),
      preset('three', '三行信息', { threeLine: true, isLink: true, showRightIcon: true }, description, (p) => !!p.threeLine),
      preset('three-ellipsis', '三行省略', { threeLine: true, threeLineEllipsis: true }, description, (p) => !!p.threeLine && !!p.threeLineEllipsis),
      preset('notes', '多行备注', { showMultiLineNotes: true }, notes, (p) => !!visible(p, 'showMultiLineNotes', 'multiLineNotes')),
      preset('collapsible-notes', '可收起备注', { showMultiLineNotes: true, showTitleCollapseIcon: true }, notes, (p) => !!visible(p, 'showMultiLineNotes', 'multiLineNotes') && !!p.showTitleCollapseIcon),
    ],
  },
  button: {
    reset: { type: 'primary', plain: false, round: false, square: false, hairline: false, icon: '', rightIcon: '' },
    items: [
      ...[['primary', '主要按钮'], ['default', '默认按钮'], ['success', '成功按钮'], ['warning', '警告按钮'], ['danger', '危险按钮'], ['text', '文字按钮']].map(([type, name]) => preset(type, name, { type })),
      preset('plain', '朴素按钮', { plain: true }), preset('round', '圆角按钮', { round: true }),
      preset('icon', '图标按钮', { icon: 'plus' }), preset('right-icon', '右图标按钮', { rightIcon: 'arrow' }),
    ],
  },
  field: {
    reset: { type: 'text', labelPosition: 'left', rows: 1, autosize: false, showWordLimit: false, leftIcon: '', rightIcon: '', showWrapTags: false, showTitleIcon: false, showUnit: false },
    items: [
      preset('text', '单行输入', { type: 'text', labelPosition: 'left' }),
      preset('top', '顶部标签输入', { type: 'text', labelPosition: 'top' }),
      preset('tel', '手机号输入', { type: 'tel', labelPosition: 'left' }),
      preset('number', '数字输入', { type: 'number', labelPosition: 'left' }),
      preset('password', '密码输入', { type: 'password', labelPosition: 'left' }),
      preset('textarea', '多行文本', { type: 'textarea', labelPosition: 'top', rows: 2, autosize: true, showWordLimit: true }, { maxlength: 200 }),
      preset('icon', '带图标输入', { leftIcon: 'smile-o', rightIcon: 'warning-o' }),
      preset('tags', '换行标签输入', { showWrapTags: true }, { wrapTags: ['标签 1', '标签 2'] }),
      preset('unit', '带单位输入', { showUnit: true }, { unit: '℃' }),
    ],
  },
  tag: {
    reset: { type: 'gray', plain: false, round: false, mark: false, closeable: false, rightIcon: '', showNumber: false },
    items: [preset('default', '默认标签', {}), preset('primary', '主要标签', { type: 'primary' }), preset('success', '成功标签', { type: 'success' }), preset('danger', '危险标签', { type: 'danger' }), preset('plain', '空心标签', { plain: true }), preset('round', '圆角标签', { round: true }), preset('mark', '标记标签', { mark: true }), preset('closeable', '可关闭标签', { closeable: true }), preset('number', '数字前缀标签', { showNumber: true }, { number: 12 })],
  },
  search: { reset: { variant: 'pure', showAction: false }, items: [preset('pure', '简洁搜索', { variant: 'pure', showAction: false }), preset('default', '标准搜索', { variant: 'default', showAction: false }), preset('action', '带操作搜索', { showAction: true }, { actionText: '取消' })] },
  stepper: { reset: { theme: '' }, items: [preset('default', '基础步进器', { theme: '' }), preset('round', '圆角步进器', { theme: 'round' }), preset('outline', '圆角线框', { theme: 'round-outline' })] },
  'nav-bar': { reset: { subtitle: '', titleDropdown: false, rightText: '', rightPopoverActions: [] }, items: [preset('default', '基础导航', {}), preset('right', '右侧操作导航', {}, { rightText: '操作' }, (p) => present(p.rightText)), preset('subtitle', '双行导航', {}, { subtitle: '副标题' }, (p) => present(p.subtitle)), preset('dropdown', '标题下拉导航', { titleDropdown: true })] },
  'title-bar': { reset: { size: 'default', showDescription: false, showIcon: false, showRightIcon: false, showArrow: false, showAction: false }, items: [preset('single', '单行标题', {}), preset('double', '双行标题', { showDescription: true }, { description: '备注信息' }), preset('mini', '小尺寸标题', { size: 'mini' }), preset('action', '带操作标题', { showAction: true }, { actionText: '操作' }), preset('right-icon', '右图标标题', { showRightIcon: true }, { rightIcon: 'cross' })] },
  'blue-mark': { reset: { size: 'large', isLink: false }, items: [preset('large', '大号小蓝标', { size: 'large' }), preset('normal', '标准小蓝标', { size: 'normal' }), preset('small', '小号小蓝标', { size: 'small' }), preset('link', '可跳转小蓝标', { isLink: true })] },
  'blue-mark-header': { reset: { expandable: false, actionText: '' }, items: [preset('default', '蓝标标题', {}), preset('action', '带操作蓝标标题', {}, { actionText: '操作' }, (p) => present(p.actionText)), preset('expandable', '可展开蓝标标题', { expandable: true })] },
  label: { reset: { type: 'default', vertical: false, contentAlign: 'follow' }, items: [preset('default', '跟随回显', {}), preset('right', '居右回显', { contentAlign: 'right' }), preset('vertical', '换行回显', { vertical: true }), preset('bold', '加粗回显', { type: 'bold' }), preset('link', '链接回显', { type: 'link' }), preset('tag', '标签回显', { type: 'tag' }, { tags: ['重要区域', '设备间'] }), preset('media', '图片回显', { type: 'media' }, { media: [{ url: '/dog1.jpg' }] })] },
  'notice-bar': { reset: { mode: '', wrapable: false, round: false, scrollable: undefined }, items: [preset('default', '基础通知', {}), preset('closeable', '可关闭通知', { mode: 'closeable' }), preset('link', '链接通知', { mode: 'link' }), preset('wrap', '多行通知', { wrapable: true, scrollable: false }), preset('round', '圆角通知', { round: true })] },
  progress: { reset: { size: 'default', showPivot: true, inactive: false }, items: [preset('default', '标准进度条', {}), preset('large', '大号进度条', { size: 'large' }), preset('simple', '无文字进度', { showPivot: false }), preset('inactive', '置灰进度条', { inactive: true })] },
  loading: { reset: { type: 'circular', vertical: false, size: 24 }, items: [preset('circular', '环形加载', { type: 'circular' }), preset('spinner', '旋转加载', { type: 'spinner' }), preset('vertical', '纵向加载', { vertical: true }), preset('illustration', '插画加载', { type: 'illustration', size: 72, vertical: true })] },
  empty: { reset: { image: 'default' }, items: [preset('default', '空数据', { image: 'default' }), preset('network', '网络异常', { image: 'network' }), preset('error', '通用错误', { image: 'error' }), preset('search', '搜索为空', { image: 'search' })] },
  image: { reset: { round: false, radius: 0, width: '100%', height: 140, fit: 'cover' }, items: [preset('cover', '填满裁剪', { fit: 'cover' }), preset('contain', '完整显示', { fit: 'contain' }), preset('radius', '圆角图片', { radius: 12 }), preset('round', '圆形图片', { round: true, width: 80, height: 80 })] },
  checkbox: { reset: { shape: 'round' }, items: [preset('round', '圆形复选', { shape: 'round' }), preset('square', '方形复选', { shape: 'square' })] },
  radio: { reset: { shape: 'round' }, items: [preset('round', '圆形单选', { shape: 'round' }), preset('square', '方形单选', { shape: 'square' })] },
  divider: { reset: { dashed: false, contentPosition: 'center' }, items: [preset('center', '居中文字分割', {}), preset('left', '左侧文字分割', { contentPosition: 'left' }), preset('right', '右侧文字分割', { contentPosition: 'right' }), preset('dashed', '虚线分割', { dashed: true })] },
  'info-card': { reset: { collapsible: false, collapsePosition: 'bottom', showCacheBadge: false }, items: [preset('default', '基础信息卡片', {}), preset('collapse', '底部展开信息卡片', { collapsible: true, showCollapse: true, collapsePosition: 'bottom' }, { extraFields: [{ label: '补充信息', content: '设备状态正常' }] }), preset('title-collapse', '标题展开信息卡片', { collapsible: true, showCollapse: true, collapsePosition: 'title' }, { extraFields: [{ label: '补充信息', content: '设备状态正常' }] }), preset('cache', '带缓存角标', { showCacheBadge: true }, { cacheText: '缓存' })] },
  'bottom-action-bar': { reset: { secondaryText: '', icon: '', moreText: '', moreIcon: '', morePopoverActions: [], showCheckboxAction: false }, items: [preset('single', '单按钮动作栏', {}), preset('double', '双按钮动作栏', {}, { secondaryText: '暂存' }, (p) => present(p.secondaryText)), preset('more', '双按钮与更多', {}, { secondaryText: '暂存', moreText: '更多', morePopoverActions: [{ text: '查看详情' }, { text: '编辑' }] }, (p) => present(p.secondaryText) && present(p.moreText)), preset('icon', '图标与更多操作', { icon: 'volume-o' }, { moreText: '更多', moreIcon: 'ellipsis' })] },
  'tree-select': { reset: { multiple: false }, items: [preset('single', '树形单选', { multiple: false }), preset('multiple', '树形多选', { multiple: true })] },
  'filter-tag': { reset: { selected: false, size: 'normal', icon: '', iconPosition: 'left', dot: false, badge: undefined }, items: [preset('default', '基础筛选标签', {}), preset('selected', '选中筛选标签', { selected: true }), preset('large', '大号筛选标签', { size: 'large' }), preset('icon', '图标筛选标签', { icon: 'arrow', iconPosition: 'right' }), preset('badge', '徽标筛选标签', {}, { badge: 9 }, (p) => present(p.badge))] },
};

const nativeMetadata = metadata as Record<string, { defaults?: Record<string, unknown> }>;
const documented = Object.fromEntries(Object.entries(generatedStyles).map(([type, config]) => {
  const nativeType = 'nativeType' in config ? String(config.nativeType) : type;
  return [type, { ...config, reset: Object.fromEntries(Object.keys(config.reset).map((key) => [key, nativeMetadata[nativeType]?.defaults?.[key]])) }];
}));
export const componentStyles: Record<string, ComponentStyles> = { ...documented };
for (const [type, config] of Object.entries(curatedComponentStyles)) {
  const docs = componentStyles[type];
  componentStyles[type] = { ...docs, ...config, reset: { ...docs?.reset, ...config.reset }, items: [...config.items, ...(docs?.items || [])] };
}
// These documented enum variants share a code sample in the README.
for (const type of ['tabs', 'tab']) {
  const config = componentStyles[type];
  if (config) config.items = [...config.items, ...[['card-gray', '灰底胶囊'], ['filter', '筛选标签栏']].map(([value, name]) => ({ ...config.items[0], id: `docs-type-${value}`, name, props: { ...config.items[0].props, type: value } }))];
}
