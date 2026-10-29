import type { CanvasNode, ComponentDefinition, ComponentType, PropertyOption, PropertySchema } from '../types';
import webTypes from 'persagy-vant/lib/web-types.json';
import generatedMetadata from './generatedComponentMetadata.json';
import { propertyTokenKind } from '../utils/designTokens';
import { propertyLabel } from '../utils/propertyLabels';
import { canvasPanelTypes } from '../../shared/association-controls.mjs';
import documentedStyles from './generatedComponentStyles.json';
import { curatedComponentStyles } from './componentStyles';

const optionLabelMap: Record<string, string> = {
  default: '默认',
  primary: '主要',
  success: '成功',
  warning: '警告',
  danger: '危险',
  text: '文字',
  normal: '标准',
  large: '大',
  medium: '中',
  small: '小',
  mini: '迷你',
  left: '左侧',
  center: '居中',
  right: '右侧',
  top: '上方',
  pure: '简洁',
  round: '圆形',
  'round-outline': '圆形描边',
  closeable: '可关闭',
  link: '链接',
  gray: '灰色',
  turquoise: '青绿色',
  purple: '紫色',
  violet: '蓝紫色',
  contain: '完整显示',
  cover: '填满裁剪',
  fill: '拉伸填满',
  none: '原始尺寸',
  'scale-down': '缩小适配',
  circular: '环形加载',
  spinner: '旋转加载',
  illustration: '插画加载',
  network: '网络异常',
  textarea: '多行文本',
  tel: '电话号码',
  digit: '纯数字',
  number: '数字',
};

function optionLabel(value: string) {
  return optionLabelMap[value] || value;
}

const bool = (key: string, label: string, group = '状态'): ComponentDefinition['properties'][number] => ({
  key,
  label,
  control: 'boolean',
  group,
});

const text = (
  key: string,
  label: string,
  group = '内容',
  control: 'text' | 'textarea' = 'text',
): ComponentDefinition['properties'][number] => ({ key, label, control, group });

const select = (
  key: string,
  label: string,
  values: Array<string | [string, string]>,
  group = '外观',
): ComponentDefinition['properties'][number] => ({
  key,
  label,
  control: 'select',
  group,
  options: values.map((item): PropertyOption =>
    Array.isArray(item) ? { label: item[0], value: item[1] } : { label: optionLabel(item), value: item },
  ),
});

const json = (key: string, label: string, group = '数据'): ComponentDefinition['properties'][number] => ({
  key,
  label,
  control: 'json',
  group,
  help: '使用组件 README 定义的数据结构',
});

const curatedCatalog: ComponentDefinition[] = [
  {
    type: 'nav-bar',
    name: '导航栏',
    englishName: 'NavBar',
    category: '导航',
    description: '页面标题、返回与右侧操作',
    keywords: ['标题', '返回', '顶部'],
    docsPath: 'nav-bar',
    defaultProps: { title: '页面标题', leftArrow: true, border: true, fixed: false, placeholder: true },
    properties: [
      text('title', 'title'),
      text('subtitle', 'subtitle'),
      text('leftText', 'left-text'),
      text('rightText', 'right-text'),
      bool('leftArrow', 'left-arrow'),
      bool('titleDropdown', 'title-dropdown'),
      bool('border', 'border'),
    ],
  },
  {
    type: 'blue-mark-header',
    name: '小蓝标标题栏',
    englishName: 'BlueMarkHeader',
    category: '导航',
    description: '卡片外一级标题',
    keywords: ['标题', '蓝标', '分组'],
    docsPath: 'blue-mark',
    defaultProps: { title: '模块标题', size: 'large', required: false, divider: false },
    properties: [
      text('title', 'title'),
      select('size', 'size', ['small', 'normal', 'large']),
      text('actionText', 'action-text'),
      bool('required', 'required'),
      bool('expandable', 'expandable'),
      bool('showExpandIcon', 'show-expand-icon'),
      bool('divider', 'divider'),
    ],
  },
  {
    type: 'title-bar',
    name: '标题栏',
    englishName: 'TitleBar',
    category: '导航',
    description: '卡片内二级标题',
    keywords: ['二级标题', '备注'],
    docsPath: 'title-bar',
    defaultProps: { title: '标题名称', description: '备注信息', showDescription: false, bottomGap: '4' },
    properties: [
      text('title', 'title'),
      text('description', 'description'),
      bool('showDescription', 'show-description'),
      text('actionText', 'action-text'),
      bool('showAction', 'show-action'),
      bool('showArrow', 'show-arrow'),
      bool('required', 'required'),
      select('bottomGap', 'bottom-gap', ['4', '8', '12']),
    ],
  },
  {
    type: 'search',
    name: '搜索',
    englishName: 'Search',
    category: '表单',
    description: '纯净搜索与取消操作',
    keywords: ['查找', '筛选', '输入'],
    docsPath: 'search',
    defaultProps: { modelValue: '', placeholder: '请输入搜索关键词', variant: 'pure', showAction: false, clearable: true },
    properties: [
      text('modelValue', 'v-model'),
      text('placeholder', 'placeholder'),
      text('label', 'label'),
      select('variant', 'variant', ['pure', 'default']),
      select('shape', 'shape', ['round']),
      bool('showAction', 'show-action'),
      bool('clearable', 'clearable'),
      bool('disabled', 'disabled'),
      bool('readonly', 'readonly'),
    ],
  },
  {
    type: 'field',
    name: '输入框',
    englishName: 'Field',
    category: '表单',
    description: '文本、数字与换行文本域',
    keywords: ['输入', '表单', '文本域'],
    docsPath: 'field',
    defaultProps: {
      modelValue: '',
      label: '字段名称',
      placeholder: '请输入内容',
      type: 'textarea',
      labelPosition: 'top',
      inputAlign: 'left',
      maxlength: 200,
      showWordLimit: true,
      rows: 2,
      autosize: true,
    },
    properties: [
      text('modelValue', 'v-model', '内容', 'textarea'),
      text('label', 'label'),
      text('placeholder', 'placeholder'),
      select('type', 'type', ['text', 'textarea', 'tel', 'digit', 'number', 'password']),
      select('labelPosition', 'label-position', ['left', 'top']),
      select('inputAlign', 'input-align', ['left', 'center', 'right']),
      { key: 'maxlength', label: 'maxlength', control: 'number', group: '限制', min: 0, max: 1000 },
      bool('showWordLimit', 'show-word-limit', '限制'),
      bool('required', 'required', '状态'),
      bool('disabled', 'disabled', '状态'),
      bool('readonly', 'readonly', '状态'),
      bool('clearable', 'clearable', '状态'),
      bool('border', 'border', '外观'),
    ],
  },
  {
    type: 'cell',
    name: '单元格',
    englishName: 'Cell',
    category: '展示',
    description: '列表、下钻、选择与多行信息',
    keywords: ['列表', '箭头', '信息', '选择'],
    docsPath: 'cell',
    defaultProps: { title: '单元格标题', value: '内容', label: '', rightIcon: 'arrow', border: true },
    properties: [
      text('title', 'title'),
      text('value', 'value'),
      text('label', 'label'),
      text('description', 'description'),
      text('rightIcon', 'right-icon'),
      text('note', 'note'),
      bool('titleBold', 'title-bold'),
      bool('threeLine', 'three-line'),
      bool('showWrapTags', 'show-wrap-tags'),
      json('wrapTags', 'wrap-tags'),
      bool('border', 'border'),
      bool('clickable', 'clickable'),
      select('size', 'size', ['normal', 'large']),
      select('selectType', '选择控件', [['复选框', 'checkbox'], ['单选框', 'radio']]),
    ],
  },
  {
    type: 'button',
    name: '按钮',
    englishName: 'Button',
    category: '表单',
    description: '页面主次操作',
    keywords: ['操作', '提交', '点击'],
    docsPath: 'button',
    defaultProps: { text: '主要操作', type: 'primary', size: 'normal', block: false, round: false },
    properties: [
      text('text', 'text'),
      select('type', 'type', ['default', 'primary', 'success', 'warning', 'danger', 'text']),
      select('size', 'size', ['normal', 'large', 'small', 'mini']),
      text('icon', 'icon'),
      text('rightIcon', 'right-icon'),
      bool('block', 'block'),
      bool('plain', 'plain'),
      bool('round', 'round'),
      bool('disabled', 'disabled'),
      bool('loading', 'loading'),
    ],
  },
  {
    type: 'switch',
    name: '开关',
    englishName: 'Switch',
    category: '表单',
    description: '布尔状态即时切换',
    keywords: ['布尔', '启用', '关闭'],
    docsPath: 'switch',
    defaultProps: { modelValue: true, size: 24, disabled: false, loading: false },
    properties: [
      bool('modelValue', 'v-model', '内容'),
      { key: 'size', label: 'size', control: 'number', group: '外观', min: 16, max: 48 },
      bool('disabled', 'disabled'),
      bool('loading', 'loading'),
    ],
  },
  {
    type: 'stepper',
    name: '步进器',
    englishName: 'Stepper',
    category: '表单',
    description: '数量增减与范围限制',
    keywords: ['数量', '数字', '加减'],
    docsPath: 'stepper',
    defaultProps: { modelValue: 1, min: 1, max: 99, step: 1, theme: 'round-outline' },
    properties: [
      { key: 'modelValue', label: 'v-model', control: 'number', group: '内容' },
      { key: 'min', label: 'min', control: 'number', group: '限制' },
      { key: 'max', label: 'max', control: 'number', group: '限制' },
      { key: 'step', label: 'step', control: 'number', group: '限制', min: 0.1, step: 0.1 },
      select('theme', 'theme', ['default', 'round', 'round-outline']),
      bool('integer', 'integer', '限制'),
      bool('disabled', 'disabled'),
      bool('disableInput', 'disable-input'),
    ],
  },
  {
    type: 'tag',
    name: '标签',
    englishName: 'Tag',
    category: '展示',
    description: '业务状态、分类与关键词',
    keywords: ['状态', '分类', '标记'],
    docsPath: 'tag',
    defaultProps: { type: 'primary', size: 'medium', plain: false, round: false, show: true },
    defaultContent: '标签',
    properties: [
      { key: 'content', label: 'default slot', control: 'text', group: '内容', target: 'content' },
      select('type', 'type', ['primary', 'success', 'danger', 'warning', 'gray', 'turquoise', 'purple', 'violet']),
      select('size', 'size', ['large', 'medium', 'small']),
      bool('plain', 'plain'),
      bool('round', 'round'),
      bool('mark', 'mark'),
      bool('closeable', 'closeable'),
      text('rightIcon', 'right-icon'),
      bool('showNumber', 'show-number'),
      text('number', 'number'),
    ],
  },
  {
    type: 'notice-bar',
    name: '通知栏',
    englishName: 'NoticeBar',
    category: '反馈',
    description: '页面级提醒与异常提示',
    keywords: ['通知', '提示', '警告'],
    docsPath: 'notice-bar',
    defaultProps: { text: '这是一条重要通知', leftIcon: 'volume-o', mode: '', scrollable: false, wrapable: true },
    properties: [
      text('text', 'text', '内容', 'textarea'),
      select('mode', 'mode', [['无', ''], 'closeable', 'link']),
      text('leftIcon', 'left-icon'),
      bool('scrollable', 'scrollable'),
      bool('wrapable', 'wrapable'),
      bool('round', 'round'),
    ],
  },
  {
    type: 'progress',
    name: '进度条',
    englishName: 'Progress',
    category: '反馈',
    description: '任务进度与完成度',
    keywords: ['进度', '完成', '百分比'],
    docsPath: 'progress',
    defaultProps: { percentage: 65, size: 'default', strokeWidth: 6, showPivot: true, inactive: false },
    properties: [
      { key: 'percentage', label: 'percentage', control: 'number', group: '内容', min: 0, max: 100 },
      text('pivotText', 'pivot-text'),
      select('size', 'size', ['default', 'large']),
      { key: 'strokeWidth', label: 'stroke-width', control: 'number', group: '外观', min: 1, max: 20 },
      bool('showPivot', 'show-pivot'),
      bool('inactive', 'inactive'),
    ],
  },
  {
    type: 'image',
    name: '图片',
    englishName: 'Image',
    category: '展示',
    description: '图片展示与加载失败状态',
    keywords: ['媒体', '照片', '封面'],
    docsPath: 'image',
    defaultProps: { src: 'https://picsum.photos/720/320?random=12', fit: 'cover', width: '100%', height: 140, radius: 0, block: true },
    properties: [
      text('src', 'src'),
      text('alt', 'alt'),
      select('fit', 'fit', ['contain', 'cover', 'fill', 'none', 'scale-down']),
      text('width', 'width'),
      { key: 'height', label: 'height', control: 'number', group: '外观', min: 20, max: 500 },
      { key: 'radius', label: 'radius', control: 'number', group: '外观', min: 0, max: 100 },
      bool('round', 'round'),
      bool('showLoading', 'show-loading'),
      bool('showError', 'show-error'),
    ],
  },
  {
    type: 'divider',
    name: '分割线',
    englishName: 'Divider',
    category: '布局',
    description: '内容分区与文字分割',
    keywords: ['分隔', '线', '区域'],
    docsPath: 'divider',
    defaultProps: { dashed: false, hairline: true, contentPosition: 'center' },
    defaultContent: '分割线',
    properties: [
      { key: 'content', label: 'default slot', control: 'text', group: '内容', target: 'content' },
      select('contentPosition', 'content-position', ['left', 'center', 'right']),
      bool('dashed', 'dashed'),
      bool('hairline', 'hairline'),
    ],
  },
  {
    type: 'info-card',
    name: '信息卡片',
    englishName: 'InfoCard',
    category: '业务',
    description: '成组展示多类型业务字段',
    keywords: ['详情', '字段', '卡片'],
    docsPath: 'info-card',
    defaultProps: {
      title: '设备信息',
      showTitle: true,
      fields: [
        { label: '设备名称：', content: '冷却塔 01' },
        { label: '所在位置：', content: 'A 栋楼顶' },
      ],
      extraFields: [],
      modelValue: false,
      collapsible: false,
      divider: false,
    },
    properties: [
      text('title', 'title'),
      bool('showTitle', 'show-title'),
      json('fields', 'fields'),
      json('extraFields', 'extra-fields'),
      bool('collapsible', 'collapsible'),
      bool('modelValue', 'v-model'),
      bool('showCollapse', 'show-collapse'),
      bool('divider', 'divider'),
      text('expandText', 'expand-text'),
      text('collapseText', 'collapse-text'),
    ],
  },
  {
    type: 'work-order-card',
    name: '工单卡片',
    englishName: 'WorkOrderCard',
    category: '业务',
    description: '工单标题、标签、位置与操作',
    keywords: ['工单', '巡检', '维修', '任务'],
    docsPath: 'work-order-card',
    defaultProps: {
      title: '冷却塔日常巡检',
      location: 'A 栋 · 楼顶设备层',
      expanded: false,
      expandable: true,
      tags: [{ text: '待处理', type: 'warning' }, { text: '巡检', type: 'primary' }],
      primaryInfos: [{ label: '计划时间', content: '今天 14:00' }],
      expandedInfos: [{ label: '负责人', content: '张师傅' }],
      actions: [{ text: '开始处理', type: 'primary' }],
    },
    properties: [
      text('title', 'title'),
      text('location', 'location'),
      bool('expanded', 'v-model:expanded'),
      bool('expandable', 'expandable'),
      json('tags', 'tags'),
      json('primaryInfos', 'primary-infos'),
      json('expandedInfos', 'expanded-infos'),
      json('actions', 'actions'),
      text('overdue', 'overdue'),
      bool('showOverdue', 'show-overdue'),
    ],
  },
  {
    type: 'bottom-action-bar',
    name: '动作栏',
    englishName: 'BottomActionBar',
    category: '业务',
    description: '页面底部主次操作',
    keywords: ['底部', '提交', '确认', '操作'],
    docsPath: 'bottom-action-bar',
    defaultProps: { confirmText: '确定', secondaryText: '暂存', fixed: false, safeAreaInsetBottom: false },
    properties: [
      text('confirmText', 'confirm-text'),
      select('confirmType', 'confirm-type', ['primary', 'success', 'warning', 'danger']),
      text('secondaryText', 'secondary-text'),
      select('secondaryType', 'secondary-type', ['default', 'primary', 'danger']),
      bool('confirmLoading', 'confirm-loading'),
      bool('confirmDisabled', 'confirm-disabled'),
      bool('secondaryDisabled', 'secondary-disabled'),
      text('moreText', 'more-text'),
      bool('fixed', 'fixed'),
      bool('safeAreaInsetBottom', 'safe-area-inset-bottom'),
    ],
  },
  {
    type: 'empty',
    name: '空状态',
    englishName: 'Empty',
    category: '反馈',
    description: '无数据与异常结果说明',
    keywords: ['无数据', '空白', '错误'],
    docsPath: 'empty',
    defaultProps: { image: 'default', description: '暂无数据', imageSize: 96 },
    properties: [
      select('image', 'image', ['default', 'network']),
      text('description', 'description'),
      { key: 'imageSize', label: 'image-size', control: 'number', group: '外观', min: 48, max: 200 },
    ],
  },
  {
    type: 'loading',
    name: '加载',
    englishName: 'Loading',
    category: '反馈',
    description: '页面与局部加载反馈',
    keywords: ['等待', '载入', '状态'],
    docsPath: 'loading',
    defaultProps: { type: 'illustration', size: 72, vertical: true },
    defaultContent: '加载中…',
    properties: [
      { key: 'content', label: 'default slot', control: 'text', group: '内容', target: 'content' },
      select('type', 'type', ['circular', 'spinner', 'illustration']),
      { key: 'size', label: 'size', control: 'number', group: '外观', min: 16, max: 160 },
      { key: 'textSize', label: 'text-size', control: 'number', group: '外观', min: 10, max: 24 },
      bool('vertical', 'vertical'),
    ],
  },
];

type OfficialEntry = [path: string, title: string, category: string];

const officialComponents: OfficialEntry[] = [
  ['button', '按钮 Button', '基础'],
  ['icon', '图标 Icon', '基础'],
  ['cell', '单元格 Cell', '基础'],
  ['image', '图片 Image', '基础'],
  ['toast', '轻提示 Toast', '基础'],
  ['space', '间距 Space', '基础'],
  ['col', '布局 Layout', '基础'],
  ['popup', '弹出层 Popup', '基础'],
  ['config-provider', '全局配置 ConfigProvider', '基础'],
  ['tree-select', '树选择 TreeSelect', '表单'],
  ['quantity-input', '批量多选 BatchMultiSelect', '表单'],
  ['checkbox', '复选框 Checkbox', '表单'],
  ['radio', '单选框 Radio', '表单'],
  ['field', '输入框 Field', '表单'],
  ['form', '表单 Form', '表单'],
  ['switch', '开关 Switch', '表单'],
  ['picker', '选择器 Picker', '表单'],
  ['rate', '评分 Rate', '表单'],
  ['search', '搜索 Search', '表单'],
  ['datetime-picker', '时间选择 DatetimePicker', '表单'],
  ['calendar', '日历 Calendar', '表单'],
  ['cascader', '级联选择 Cascader', '表单'],
  ['number-keyboard', '数字键盘 NumberKeyboard', '表单'],
  ['password-input', '密码输入框 PasswordInput', '表单'],
  ['slider', '滑块 Slider', '表单'],
  ['stepper', '步进器 Stepper', '表单'],
  ['uploader', '文件上传 Uploader', '表单'],
  ['content-panel', '内容面板 ContentPanel', '反馈'],
  ['form-panel', '表单面板 FormPanel', '反馈'],
  ['radio-panel', '单选面板 RadioPanel', '反馈'],
  ['checkbox-panel', '多选面板 CheckboxPanel', '反馈'],
  ['tree-select-panel', '树选择面板 TreeSelectPanel', '反馈'],
  ['action-sheet', '动作面板 ActionSheet', '反馈'],
  ['dialog', '弹出框 Dialog', '反馈'],
  ['loading', '加载 Loading', '反馈'],
  ['notify', '消息通知 Notify', '反馈'],
  ['overlay', '遮罩层 Overlay', '反馈'],
  ['pull-refresh', '下拉刷新 PullRefresh', '反馈'],
  ['share-sheet', '分享面板 ShareSheet', '反馈'],
  ['swipe-cell', '滑动单元格 SwipeCell', '反馈'],
  ['dropdown-menu', '下拉菜单 DropdownMenu', '反馈'],
  ['blue-mark', '小蓝标 BlueMark', '展示'],
  ['tag', '标签 Tag', '展示'],
  ['badge', '徽标 Badge', '展示'],
  ['swipe', '轮播 Swipe', '展示'],
  ['divider', '分割线 Divider', '展示'],
  ['collapse-toggle', '展开收起 CollapseToggle', '展示'],
  ['label', '字段展示 Label', '展示'],
  ['title-bar', '标题栏 TitleBar', '展示'],
  ['empty', '空状态 Empty', '展示'],
  ['background', '背景 Background', '展示'],
  ['skeleton', '骨架屏 Skeleton', '展示'],
  ['notice-bar', '通知栏 NoticeBar', '展示'],
  ['popover', '气泡弹出框 Popover', '展示'],
  ['friendly-tip', '友好提示 FriendlyTip', '展示'],
  ['image-preview', '图片预览 ImagePreview', '展示'],
  ['video-preview', '视频预览 VideoPreview', '展示'],
  ['circle', '环形进度条 Circle', '展示'],
  ['collapse', '折叠面板 Collapse', '展示'],
  ['count-down', '倒计时 CountDown', '展示'],
  ['list', '列表 List', '展示'],
  ['progress', '进度条 Progress', '展示'],
  ['steps', '步骤条 Steps', '展示'],
  ['sticky', '粘性布局 Sticky', '展示'],
  ['nav-bar', '导航栏 NavBar', '导航'],
  ['bottom-action-bar', '动作栏 ActionBar', '导航'],
  ['tab', '标签页 Tab', '导航'],
  ['filter-tag', '筛选标签 FilterTag', '导航'],
  ['grid', '宫格 Grid', '导航'],
  ['index-bar', '索引栏 IndexBar', '导航'],
  ['pagination', '分页 Pagination', '导航'],
  ['sidebar', '侧边导航 Sidebar', '导航'],
  ['tabbar', '菜单栏 Tabbar', '导航'],
  ['work-order-card', '工单卡片 WorkOrderCard', '业务'],
  ['info-card', '信息卡片 InfoCard', '业务'],
  ['floor-select', '楼层选择 FloorSelect', '业务'],
  ['location-select', '位置单选 LocationSelect', '业务'],
  ['material-add', '添加物料 MaterialAdd', '业务'],
  ['material-detail', '物料详情 MaterialDetail', '业务'],
  ['material-action-bar', '物料操作列表 MaterialActionList', '业务'],
  ['material-display-bar', '物料预览列表 MaterialPreviewList', '业务'],
  ['object-select', '对象选择 ObjectSelect', '业务'],
  ['multi-person-select', '多人选择 MultiSelect', '业务'],
  ['single-person-select', '单人选择 PersonSelect', '业务'],
  ['work-order-filter', '工单筛选 WorkOrderFilter', '业务'],
  ['address-edit', '地址编辑 AddressEdit', '业务'],
  ['address-list', '地址列表 AddressList', '业务'],
  ['area', '省市区选择 Area', '业务'],
  ['contact-edit', '联系人编辑 ContactEdit', '业务'],
  ['contact-list', '联系人列表 ContactList', '业务'],
  ['submit-bar', '提交订单栏 SubmitBar', '业务'],
];

interface WebTypeAttribute {
  name: string;
  default?: string;
  description?: string;
  value?: { type?: string };
}

interface WebTypeTag {
  name: string;
  attributes?: WebTypeAttribute[];
  slots?: Array<{ name: string }>;
}

interface GeneratedAttribute {
  name: string;
  default?: string;
  description?: string;
  type?: string;
}

const webTypeTags = new Map<string, WebTypeTag>(
  ((webTypes as any).contributions?.html?.tags || []).map((tag: WebTypeTag) => [tag.name, tag]),
);

const livePreviewTypes = new Set([
  ...canvasPanelTypes,
  'tree-select',
  'quantity-input',
  'icon',
  'checkbox',
  'radio',
  'rate',
  'slider',
  'uploader',
  'blue-mark',
  'badge',
  'label',
  'background',
  'skeleton',
  'circle',
  'count-down',
  'filter-tag',
  'pagination',
]);

const previewOverrides: Record<string, { props?: Record<string, unknown>; content?: string }> = {
  'tree-select': { props: {
    items: [
      { id: 'equipment', text: '设备分类', children: [{ id: 'air-conditioning', text: '暖通空调' }, { id: 'water-supply', text: '给排水' }] },
      { id: 'area', text: '公共区域', children: [{ id: 'lobby', text: '大厅' }, { id: 'corridor', text: '走廊' }] },
    ],
    modelValue: ['air-conditioning'], expandedKeys: ['equipment'], multiple: false,
  } },
  'quantity-input': { props: {
    items: [{ name: '巡检工具' }, { name: '安全用品' }, { name: '维修备件' }],
    modelValue: [1, 0, 0], expanded: false,
    confirmText: '确定', expandText: '展开已选', collapseText: '收起已选', clearText: '清空已选',
  } },
  icon: { props: { name: 'apps-o', size: 28 } },
  checkbox: { props: { modelValue: true }, content: '复选项' },
  radio: { props: { modelValue: '1', name: '1' }, content: '单选项' },
  rate: { props: { modelValue: 4 } },
  slider: { props: { modelValue: 45 } },
  uploader: { props: { label: '照片/视频', modelValue: [], maxCount: 9, previewSize: 54 } },
  'blue-mark': { props: { size: 'large' }, content: '小蓝标标题' },
  badge: { props: { content: 8 }, content: '徽标内容' },
  label: { props: { label: '字段名称：', content: '字段内容' } },
  background: { props: { theme: 'gray' }, content: '页面内容' },
  skeleton: { props: { loading: true, row: 3 } },
  circle: { props: { modelValue: 65, rate: 65, text: '65%' } },
  'count-down': { props: { time: 3600000 } },
  'filter-tag': { props: { selected: true }, content: '筛选条件' },
  pagination: { props: { modelValue: 1, pageCount: 5 } },
  'content-panel': { props: { title: '内容说明' }, content: '请阅读内容并确认。' },
  popup: { props: { position: 'bottom', round: true, closeable: true }, content: '弹出层内容' },
  dialog: { props: { title: '确认操作', message: '是否继续此操作？', showCancelButton: true } },
  'action-sheet': { props: { title: '选择操作', actions: [{ name: '查看详情' }, { name: '编辑' }], closeOnClickAction: true, cancelText: '取消' } },
  'share-sheet': { props: { title: '分享', options: [{ name: '链接', icon: 'link' }, { name: '二维码', icon: 'qrcode' }], cancelText: '取消' } },
  popover: { props: { actions: [{ text: '查看详情' }, { text: '编辑' }] } },
  'friendly-tip': { props: { message: '请先确认填写的信息' } },
  toast: { props: { message: '操作成功' } },
  notify: { props: { message: '你有一条新消息', type: 'primary' } },
  'number-keyboard': { props: { modelValue: '', closeButtonText: '完成' } },
  'image-preview': { props: { images: ['/dog1.jpg'], closeable: true } },
  'checkbox-panel': { props: { title: '请选择', options: [{ label: '选项一', value: '1' }, { label: '选项二', value: '2' }], modelValue: [] } },
  'tree-select-panel': { props: { title: '选择分类', items: [{ id: 'group', text: '分类', children: [{ id: 'first', text: '选项一' }, { id: 'second', text: '选项二' }] }], expandedKeys: ['group'] } },
  'material-detail': { props: { item: { id: 'sample', name: '示例物料', detail: '示例品牌｜标准规格｜示例仓库', unit: '件', available: 10, category: 'sample' } } },
};

function toCamelCase(value: string) {
  const normalized = value.startsWith('v-model:') ? value.slice(8) : value === 'v-model' ? 'model-value' : value;
  return normalized.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function parseDefault(attribute: WebTypeAttribute) {
  const raw = attribute.default;
  if (!raw || raw === '-' || !raw.startsWith('`') || !raw.endsWith('`')) return undefined;
  const value = raw.slice(1, -1);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (value === '[]') return [];
  if (value === '{}') return {};
  if (value === "''") return '';
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (/^[\[{]/.test(value)) {
    try { return JSON.parse(value); } catch { /* Descriptive defaults belong to the runtime. */ }
  }
  // Documentation may describe array/object defaults (such as A-Z) rather than executable values.
  // Leave those to the runtime component instead of passing descriptive strings as structured props.
  if (/\[\]|Array|object|Props|Item|Option|Date|Function|=>/.test(attribute.value?.type || '')) return undefined;
  return value.replace(/^(['"])(.*)\1$/, '$2');
}

function propertyFromAttribute(attribute: WebTypeAttribute): PropertySchema {
  const type = attribute.value?.type || 'string';
  let control: PropertySchema['control'] = 'text';
  if (type === 'boolean') control = 'boolean';
  else if (type === 'number') control = 'number';
  else if (/\[\]|\[[^\]]*,[^\]]*\]|Array|object|Props|Item|Option/.test(type)) control = 'json';
  const values = attribute.description?.match(/可选值为\s*([^。；;]+)/)?.[1].match(/[a-zA-Z][\w-]*/g);
  const options = values ? [...new Set(values)].map((value) => ({ label: optionLabel(value), value })) : undefined;
  const defaultValue = parseDefault(attribute);
  if (options && typeof defaultValue === 'string' && !options.some(({ value }) => value === defaultValue)) options.unshift({ label: optionLabel(defaultValue), value: defaultValue });
  if (control === 'text' && options && options.length > 1 && options.length <= 12) control = 'select';
  return {
    key: toCamelCase(attribute.name),
    label: attribute.description || attribute.name,
    control,
    group: /boolean/.test(type) ? '状态' : control === 'json' ? '数据' : '属性',
    help: `${attribute.name} · ${type}`,
    ...(control === 'select' ? { options } : {}),
  };
}

function attributesFor(path: string) {
  const metadata = (generatedMetadata as Record<string, { attributes?: GeneratedAttribute[]; supportedProps?: string[]; booleanProps?: string[] }>)[path];
  const merged = new Map<string, WebTypeAttribute>();
  for (const attribute of webTypeTags.get(`van-${path}`)?.attributes || []) {
    const name = attribute.name.replace(/\s+v?\d[\d.]*$/, '');
    merged.set(name, { ...attribute, name });
  }
  const generated = metadata?.attributes || [];
  for (const attribute of generated) {
    const previous = merged.get(attribute.name);
    merged.set(attribute.name, {
      name: attribute.name,
      default: attribute.default || previous?.default,
      description: attribute.description || previous?.description,
      value: { type: attribute.type || previous?.value?.type || 'string' },
    });
  }
  // Some function-style APIs omit their component's show prop from web-types.
  if (canvasPanelTypes.includes(path) && ![...merged.keys()].some((key) => toCamelCase(key) === 'show')) {
    merged.set('v-model:show', { name: 'v-model:show', default: '`false`', description: '是否显示控件', value: { type: 'boolean' } });
  }
  return [...merged.values()].filter((attribute) => !metadata?.supportedProps || metadata.supportedProps.includes(toCamelCase(attribute.name))).map((attribute) => metadata?.booleanProps?.includes(toCamelCase(attribute.name)) ? { ...attribute, value: { type: 'boolean' } } : attribute);
}

function buildExtendedDefinition([path, title, category]: OfficialEntry): ComponentDefinition {
  const tag = webTypeTags.get(`van-${path}`);
  const attributes = attributesFor(path);
  const englishName = title.match(/[A-Za-z][A-Za-z0-9]+$/)?.[0] || path;
  const name = title.slice(0, title.length - englishName.length).trim();
  const defaultProps: Record<string, unknown> = {};
  for (const attribute of attributes) {
    const value = parseDefault(attribute);
    if (value !== undefined) defaultProps[toCamelCase(attribute.name)] = value;
  }
  Object.assign(defaultProps, previewOverrides[path]?.props || {});
  const example = (documentedStyles as Record<string, { items: { props: Record<string, unknown>; seeds: Record<string, unknown>; content?: string }[] }>)[path]?.items[0];
  if (example && !previewOverrides[path] && !curatedComponentStyles[path]) Object.assign(defaultProps, example.props, example.seeds);
  if (canvasPanelTypes.includes(path)) defaultProps.show = false;

  return {
    type: path,
    name,
    englishName,
    category,
    description: `${name}组件；Props 与 persagy-vant ${webTypes.version} 元数据同步`,
    keywords: [path, title, category],
    docsPath: path,
    defaultProps,
    defaultContent: previewOverrides[path]?.content || example?.content,
    properties: attributes.map(propertyFromAttribute),
    previewMode: livePreviewTypes.has(path) || example || (generatedMetadata as Record<string, { supportedProps?: string[] }>)[path]?.supportedProps ? 'live' : 'configured',
  };
}

const enrichedCuratedCatalog = curatedCatalog.map((definition) => {
  const existingKeys = new Set(definition.properties.map((item) => item.key));
  const additions = attributesFor(definition.type)
    .map(propertyFromAttribute)
    .filter((item) => !existingKeys.has(item.key));
  const supported = (generatedMetadata as Record<string, { supportedProps?: string[] }>)[definition.type]?.supportedProps;
  return {
    ...definition,
    defaultProps: Object.fromEntries(Object.entries(definition.defaultProps).filter(([key]) => !supported || supported.includes(key))),
    properties: [...definition.properties, ...additions].filter((item) => item.target === 'content' || !supported || supported.includes(item.key)),
  };
});
const curatedTypes = new Set(enrichedCuratedCatalog.map((item) => item.type));
const extendedCatalog = officialComponents.filter(([path]) => !curatedTypes.has(path)).map(buildExtendedDefinition);

function localizeDefinition(definition: ComponentDefinition): ComponentDefinition {
  const attributeMap = new Map(
    attributesFor(definition.type).map((attribute) => [toCamelCase(attribute.name), attribute]),
  );

  return {
    ...definition,
    properties: definition.properties.map((property) => {
      if (property.target === 'content') {
        return { ...property, label: '默认内容', help: 'default slot · string' };
      }

      const attribute = attributeMap.get(property.key);
      const originalDescription = attribute?.description || property.label;
      const description = property.control === 'boolean' ? originalDescription.replaceAll('是否', '') : originalDescription;
      const localized = { ...property, label: propertyLabel(definition.type, property.key, description, property.control), description };
      if (!attribute) return { ...localized, help: property.help || property.key };
      const type = attribute.value?.type || property.help || 'string';
      return {
        ...localized,
        help: `${attribute.name} · ${type}`,
        tokenKind: propertyTokenKind(definition.type, localized, type),
        allowGradient: /渐变/.test(attribute.description || ''),
      };
    }),
  };
}

const registered = new Set([...enrichedCuratedCatalog, ...extendedCatalog].map(({ type }) => type));
const nativeChildren = new Map<string, string>();
function collectNativeChildren(items: { type: string; children?: any[] }[], docsPath: string) {
  for (const item of items) { if (!registered.has(item.type)) nativeChildren.set(item.type, docsPath); if (item.children) collectNativeChildren(item.children, docsPath); }
}
for (const [type, config] of Object.entries(documentedStyles)) {
  if (!registered.has(type)) nativeChildren.set(type, config.docsPath);
  for (const item of config.items) if ('children' in item) collectNativeChildren(item.children as any[], config.docsPath);
}
const internalCatalog = [...nativeChildren].filter(([type]) => (generatedMetadata as Record<string, { supportedProps?: string[] }>)[type]?.supportedProps).map(([type, docsPath]) => {
  const englishName = type.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
  const names: Record<string, string> = { tabs: '标签页', row: '行布局', 'grid-item': '宫格项', 'swipe-item': '轮播项', step: '步骤项', 'sidebar-item': '侧边导航项', 'index-anchor': '索引锚点', 'collapse-item': '折叠项', 'action-bar-icon': '动作栏图标', 'action-bar-button': '动作栏按钮', 'dropdown-item': '下拉菜单项', 'tabbar-item': '菜单栏项', 'checkbox-group': '复选框组', 'radio-group': '单选框组', 'cell-group': '单元格组', 'qr-scanner': '二维码扫描' };
  const definition = buildExtendedDefinition([type, `${names[type] || englishName} ${englishName}`, '布局']);
  return { ...definition, docsPath, previewMode: 'live' as const };
});
export const componentCatalog: ComponentDefinition[] = [...enrichedCuratedCatalog, ...extendedCatalog, ...internalCatalog].map(localizeDefinition);

export const categories = ['基础', '导航', '表单', '展示', '业务', '反馈', '布局'];

export function getDefinition(type: ComponentType) {
  const definition = componentCatalog.find((item) => item.type === type);
  if (definition) return definition;
  const internal = (generatedMetadata as Record<string, { supportedProps?: string[] }>)[type];
  if (!internal?.supportedProps) throw new Error(`Unsupported component: ${type}`);
  const name = type.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('');
  return localizeDefinition({ ...buildExtendedDefinition([type, name, '布局']), previewMode: 'live' });
}

export function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createNode(type: ComponentType, overrides: Record<string, unknown> = {}): CanvasNode {
  const documented = (documentedStyles as Record<string, { nativeType?: string; items: { children?: any[] }[] }>)[type];
  if (documented?.nativeType) type = documented.nativeType;
  const definition = getDefinition(type);
  const materialize = (item: any): CanvasNode => ({ ...item, props: structuredClone(item.props), id: makeId(), ...(item.children ? { children: item.children.map(materialize) } : {}) });
  const children = documented?.items[0]?.children;
  return {
    id: makeId(),
    type,
    props: { ...structuredClone(definition.defaultProps), ...structuredClone(overrides) },
    content: definition.defaultContent,
    ...(children && !curatedComponentStyles[type] ? { children: children.map(materialize) } : {}),
  };
}
