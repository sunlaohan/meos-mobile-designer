// All catalog controls whose public API can be opened independently by a trigger.
// Inline controls (for example Tag and FloorSelect) stay in the page flow.
// Used by the picker, drag validation, canvas renderer and AI output validation.
export const associationControls = [
  { type: 'form-panel', group: '内容与业务面板', slot: true },
  { type: 'content-panel', group: '内容与业务面板', slot: true },
  { type: 'work-order-filter', group: '内容与业务面板' },
  { type: 'material-add', group: '内容与业务面板' },
  { type: 'material-detail', group: '内容与业务面板' },
  { type: 'location-select', group: '选择控件' },
  { type: 'radio-panel', group: '选择控件' },
  { type: 'checkbox-panel', group: '选择控件' },
  { type: 'tree-select-panel', group: '选择控件' },
  { type: 'single-person-select', group: '选择控件' },
  { type: 'multi-person-select', group: '选择控件' },
  { type: 'object-select', group: '选择控件' },
  { type: 'calendar', group: '选择控件' },
  { type: 'number-keyboard', group: '选择控件' },
  { type: 'popup', group: '弹层与反馈', slot: true },
  { type: 'dialog', group: '弹层与反馈', slot: true, componentApi: true },
  { type: 'action-sheet', group: '弹层与反馈', slot: true },
  { type: 'share-sheet', group: '弹层与反馈' },
  { type: 'popover', group: '弹层与反馈', anchor: true },
  { type: 'friendly-tip', group: '弹层与反馈', anchor: true },
  { type: 'overlay', group: '弹层与反馈', slot: true },
  { type: 'toast', group: '弹层与反馈' },
  { type: 'notify', group: '弹层与反馈', componentApi: true },
  { type: 'image-preview', group: '媒体预览', componentApi: true },
  { type: 'video-preview', group: '媒体预览', componentApi: true },
];

export const canvasPanelTypes = associationControls.map(({ type }) => type);
export const panelSlotTypes = associationControls.filter(({ slot }) => slot).map(({ type }) => type);
export const anchoredPanelTypes = associationControls.filter(({ anchor }) => anchor).map(({ type }) => type);

// Events implemented by ComponentRenderer, shared by the editor and AI validator.
export const triggerEventOptions = {
  cell: [{ value: 'click', label: '点击单元格' }],
  button: [{ value: 'click', label: '点击按钮' }],
  field: [{ value: 'click', label: '点击输入框' }],
  'nav-bar': [{ value: 'click-left', label: '点击左侧操作' }, { value: 'click-right', label: '点击右侧操作' }],
  'bottom-action-bar': [
    { value: 'confirm', label: '点击主按钮' }, { value: 'secondary', label: '点击次按钮' },
    { value: 'icon', label: '点击图标按钮' }, { value: 'more', label: '点击更多操作' },
  ],
  'work-order-card': [{ value: 'click-action', label: '点击工单操作' }],
};
