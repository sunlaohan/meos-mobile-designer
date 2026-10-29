import type { PropertyControl } from '../types';

const booleanLabels: Record<string, string> = {
  required: '必填标识', expandable: '展开收起', showExpandIcon: '展开图标', divider: '分割线',
  showIcon: '图标', fill: '填满父容器', showRangePrompt: '超出天数提示', showError: '错误提示',
  titleDropdown: '标题下拉', titleDropdownActive: '下拉展开', placeholder: '保留占位',
  safeAreaInsetTop: '顶部安全区', safeAreaInsetBottom: '底部安全区',
  showAction: '操作按钮', clearable: '清除按钮', disabled: '禁用', readonly: '只读',
  autofocus: '自动聚焦', error: '错误状态', showWordLimit: '字数统计', errorBorder: '错误边框',
  colon: '标签冒号', center: '内容居中', clickable: '点击反馈', isLink: '跳转箭头',
  titleIconClickable: '标题图标可点击', showTitleIcon: '标题图标',
  titleBold: '标题加粗', threeLine: '三行样式', showWrapTags: '换行标签栏',
  labelClickable: '备注可点击', showLabelIcon: '备注左侧图标', descriptionClickable: '第三行可点击',
  showMultiLineNotes: '多行备注', showTitleCollapseIcon: '标题展开交互',
  defaultMultiLineNotesCollapsed: '默认收起多行备注',
  noteBold: '右侧备注加粗', noteClickable: '右侧备注可点击', noteReplace: '备注跳转替换历史',
  replace: '跳转替换历史', inset: '圆角卡片', grayCard: '灰色渐变卡片', threeLineEllipsis: '三行文本省略',
  block: '块级布局', 'block 3.6.3': '块级布局', plain: '空心样式', round: '圆角样式',
  loading: '加载状态', hairline: '细边框', integer: '仅输入整数', disableInput: '禁用输入',
  longPress: '长按增减', allowEmpty: '允许空值', mark: '标记样式', closeable: '关闭图标',
  scrollable: '滚动播放', wrapable: '文本换行', lazyLoad: '图片懒加载',
  collapsible: '展开收起', showCollapse: '展开收起交互', defaultExpanded: '默认展开',
  confirmLoading: '主按钮加载', confirmDisabled: '禁用主按钮',
  secondaryLoading: '次按钮加载', secondaryDisabled: '禁用次按钮',
  checkboxActionChecked: '复选操作选中', checkboxActionDisabled: '禁用复选操作',
  dot: '小红点', forbidClick: '禁止背景点击', closeOnClick: '点击后关闭',
  closeOnClickOverlay: '点击遮罩关闭', lockScroll: '锁定背景滚动', lazyRender: '延迟渲染',
  closeOnPopstate: '页面回退时关闭', transitionAppear: '首次加载动画',
  multiple: '多选', selectableParent: '父级可选', cascade: '父子选择联动',
  labelDisabled: '禁用文本点击', bindGroup: '绑定复选框组', allowUncheck: '允许取消选中',
  validateFirst: '首项失败停止校验', scrollToError: '滚动到错误项',
  showErrorMessage: '错误提示', submitOnEnter: '回车提交', allowHtml: '允许 HTML',
  allowHalf: '允许半选', touchable: '滑动手势', startTimeFromCurrent: '开始时间默认当前',
  poppable: '弹层展示', allowSameDay: '允许选择同一天', swipeable: '滑动切换',
  transition: '过场动画', closeButtonLoading: '关闭按钮加载', blurOnClose: '关闭时失焦',
  hideOnClickOutside: '点击外部收起', randomKeyOrder: '随机按键顺序', mask: '隐藏密码',
  focused: '聚焦状态', range: '双滑块', previewImage: '上传后预览', uploadFirst: '上传入口置前',
  previewFullImage: '全屏图片预览', sourcePicker: '上传来源选择', deletable: '删除按钮',
  searchable: '搜索框', filterable: '筛选入口', filterActive: '筛选生效徽标',
  lazy: '滚动分页加载', finished: '加载完成', showSearchParentPath: '回显父级路径',
  contentAdaptive: '内容高度自适应', closeOnClickAction: '点击选项关闭',
  inputAutofocus: '打开时自动聚焦', showThirdButton: '第三个按钮', stopPropagation: '阻止滑动冒泡',
  showBar: '下拉触发栏', closeOnClickOutside: '点击外部关闭', showZero: '零值徽标',
  showColon: '字段名冒号', showLeftIcon: '左侧扩展图标', sameColor: '名称与内容同色',
  ellipsis: '超长文本省略', immediateCheck: '初始化检查滚动', showZeroBadge: '零值徽标',
  animated: '切换动画', shrink: '左侧收缩布局', scrollspy: '滚动导航',
  selected: '选中状态', reverse: '交换图文位置', forceEllipses: '页码省略号', route: '路由模式',
  enableInputDialog: '点击数量可编辑', stockInsufficient: '库存不足提示', swipeDelete: '左滑删除',
  isSaving: '保存中', isDeleting: '删除中', switchable: '允许切换地址', isEdit: '编辑模式',
};

const componentLabels: Record<string, Record<string, string>> = {
  slider: { reverse: '反向模式' },
  'tree-select': { items: '树节点', modelValue: '选中节点', expandedKeys: '展开节点', showParentSelect: '父级可选', showSelectLevels: '各层选择控件' },
  'quantity-input': { items: '选项列表', modelValue: '勾选状态', expanded: '展开已选', confirmText: '确认文案', expandText: '展开文案', collapseText: '收起文案', clearText: '清空文案' },
  'blue-mark-header': { modelValue: '展开状态', expandText: '展开文案', collapseText: '收起文案', square: '方形标记' },
  'nav-bar': { rightPopoverActions: '右侧菜单选项', rightPopoverIcon: '右侧菜单图标' },
  cell: {
    title: '左侧标题', value: '右侧内容', label: '备注', description: '第三行备注', note: '右侧备注',
    labelIcon: '备注左侧图标', labelSize: '备注字号', wrapTags: '换行标签', multiLineNotes: '多行备注数据',
    tags: '标题后标签', titleTag: '标题标签', titleIcon: '标题图标', titleStyle: '标题样式',
    noteTo: '备注跳转路由', noteUrl: '备注跳转链接', size: '单元格尺寸', background: '背景',
    leftSelect: '前置选中状态', rightSelect: '后置选中状态', showLeftSelect: '前置选择控件', showRightSelect: '后置选择控件', selectType: '选择控件类型',
  },
  field: { autosize: '自适应高度', enterkeyhint: '回车键样式', autocomplete: '自动完成' },
  button: { square: '方角样式' },
  grid: { square: '正方形格子' },
  skeleton: { title: '标题占位', avatar: '头像占位' },
  'collapse-toggle': { showIcon: '箭头图标' },
  'dropdown-menu': { offset: '面板偏移' },
  list: { offset: '触发加载距离' },
};

const parameterLabels: Record<string, string> = {
  title: '标题', modelValue: '当前值', size: '尺寸', icon: '图标', leftIcon: '左侧图标', rightIcon: '右侧图标',
  clearIcon: '清除图标', loadingIcon: '加载图标', errorIcon: '错误图标', iconPrefix: '图标前缀',
  iconSize: '图标尺寸', iconClass: '图标类名', badgeProps: '徽标配置',
  buttonSize: '按钮尺寸', defaultValue: '初始值', name: '标识符',
  type: '类型', nativeType: '原生按钮类型', loadingType: '加载图标类型',
  inputAlign: '内容对齐', labelAlign: '标签对齐', errorMessageAlign: '错误提示对齐',
  clearTrigger: '清除图标时机', formatTrigger: '格式化时机', beforeChange: '变更前回调',
  to: '跳转路由', url: '跳转链接', arrowDirection: '箭头方向', teleport: '挂载节点',
  titleColor: '标题颜色', textColor: '文字颜色', pivotColor: '进度文字颜色',
  expandText: '展开文案', collapseText: '收起文案',
  actionText: '操作文案', autocomplete: '自动完成', tag: '根节点标签', gutter: '列间距',
  zIndex: '弹层层级', expandedKeys: '展开节点', columnsFieldNames: '列字段映射', fieldNames: '字段映射',
  rangePrompt: '超出天数提示', reverse: '反向模式', customClass: '样式类名', speed: '动画速度',
};

export function propertyLabel(component: string, key: string, description: string, control: PropertyControl): string {
  const specific = componentLabels[component]?.[key];
  if (specific) return specific;
  if (control === 'boolean' && booleanLabels[key]) return booleanLabels[key];

  const summary = description.replaceAll('是否', '').split(/[，,；;。\n]/)[0].trim();
  if ((summary.length > 12 || !/[\u4e00-\u9fff]/.test(summary)) && parameterLabels[key]) return parameterLabels[key];
  if (control === 'boolean') {
    if (key === 'modelValue') return '选中状态';
    return summary.replace(/^(?:显示|展示|开启|启用|使用)/, '').replace(/(?:文本|文字)内容$/, '内容');
  }
  return summary.replace(/名称或图片(?:链接|地址)/g, '').replace(/(?:名称|文本)$/, (word) => summary.length > 8 ? '' : word);
}
