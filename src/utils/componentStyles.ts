import type { CanvasNode, ComponentDefinition } from '../types';
import { componentStyles, type ComponentStyle, type StyleNode } from '../data/componentStyles';
import { getDefinition, makeId } from '../data/componentCatalog';
import metadata from '../data/generatedComponentMetadata.json';

const runtime = metadata as Record<string, { defaults?: Record<string, unknown>; supportedProps?: string[] }>;
export const hasContent = (value: unknown): boolean => value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0);
const cellShows: Record<string, string> = {
  showIcon: 'icon', showRightIcon: 'rightIcon', showAvatar: 'avatar', showRightAvatar: 'rightAvatar',
  showTags: 'tags', showTitleTag: 'titleTag', showWrapTags: 'wrapTags', showTitleIcon: 'titleIcon',
  showNote: 'note', showBadge: 'badge', showMultiLineNotes: 'multiLineNotes', showLabelIcon: 'labelIcon',
};

export function componentPropertyValue(node: CanvasNode, key: string): any {
  if (node.props[key] !== undefined && node.props[key] !== null) return node.props[key];
  if (node.type === 'cell') {
    if (key === 'showRightIcon') return hasContent(node.props.rightIcon) || !!node.props.isLink;
    if (key === 'showLeftSelect' || key === 'showRightSelect') return node.props[key === 'showLeftSelect' ? 'leftSelect' : 'rightSelect'] !== undefined;
    if (key === 'showBlueMark') return !!node.props.blueMark;
    if (cellShows[key]) return hasContent(node.props[cellShows[key]]);
    if (key === 'clickable') return !!node.props.isLink || node.props.rightIcon === 'arrow'
      || (node.props.leftSelect !== undefined && node.props.showLeftSelect !== false) || (node.props.rightSelect !== undefined && node.props.showRightSelect !== false);
  }
  const field = key.match(/^show([A-Z].*)$/)?.[1];
  const contentKey = field && field[0].toLowerCase() + field.slice(1);
  if (contentKey && runtime[node.type]?.supportedProps?.includes(contentKey) && !Object.prototype.hasOwnProperty.call(runtime[node.type]?.defaults || {}, key)) return hasContent(node.props[contentKey]);
  return runtime[node.type]?.defaults?.[key];
}

export function stylesFor(type: string) { return componentStyles[type]?.items || []; }
export function patchChangesComponentStyle(node: CanvasNode, patch: Record<string, unknown>): boolean {
  const config = componentStyles[node.type];
  return !!config && Object.keys(patch).some((key) => key in config.reset || config.items.some((item) => key in (item.seeds || {}) && typeof item.seeds![key] === 'object' && JSON.stringify(dataShape(node.props[key])) !== JSON.stringify(dataShape(patch[key]))));
}
function effectiveProps(node: CanvasNode) { return { ...runtime[node.type]?.defaults, ...node.props }; }
function dataShape(value: unknown): unknown {
  if (Array.isArray(value)) return [...new Set(value.map((entry) => JSON.stringify(dataShape(entry))))].sort();
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, dataShape(entry)]));
  return typeof value === 'boolean' ? value : typeof value;
}

export function selectedComponentStyle(node: CanvasNode): string {
  if (node.styleId && stylesFor(node.type).some(({ id }) => id === node.styleId)) return node.styleId;
  const props = effectiveProps(node);
  const curated = stylesFor(node.type).filter((style) => !style.id.startsWith('docs-'));
  const manual = curated.filter((style) => style.matches ? style.matches(props) : Object.entries(style.props).every(([key, value]) => JSON.stringify(props[key]) === JSON.stringify(value)));
  if (manual.length) return manual[manual.length - 1].id;
  let selected = '';
  let bestScore = -1;
  for (const style of stylesFor(node.type)) {
    const matches = style.matches ? style.matches(props) : Object.entries(style.props).every(([key, value]) => JSON.stringify(props[key]) === JSON.stringify(value));
    if (!matches) continue;
    const shapes = Object.entries(style.seeds || {}).filter(([, value]) => value && typeof value === 'object');
    if (shapes.some(([key, value]) => JSON.stringify(dataShape(value)) !== JSON.stringify(dataShape(props[key])))) continue;
    if (style.children && (style.children.length !== node.children?.length || JSON.stringify(dataShape(style.children.map(({ type, props }) => ({ type, props })))) !== JSON.stringify(dataShape(node.children?.map(({ type, props }) => ({ type, props })))))) continue;
    const score = Object.keys(style.props).length + shapes.length + (style.children?.length || 0);
    if (score > bestScore) { selected = style.id; bestScore = score; }
  }
  return selected || stylesFor(node.type)[0]?.id || '';
}

export function componentStylePatch(node: CanvasNode, id: string): Record<string, unknown> | null {
  const styles = componentStyles[node.type];
  const style = styles?.items.find((item) => item.id === id);
  if (!styles || !style) return null;
  const patch = { ...structuredClone(styles.reset), ...structuredClone(style.props) };
  for (const key of ['columnsFieldNames', 'fieldNames']) if (styles.items.some((item) => key in (item.seeds || {}))) patch[key] = structuredClone(runtime[node.type]?.defaults?.[key]);
  for (const [key, sample] of Object.entries(style.seeds || {})) {
    const current = node.props[key];
    const compatible = !['columnsFieldNames', 'fieldNames'].includes(key) && (!(Array.isArray(sample) || Array.isArray(current)) || JSON.stringify(dataShape(sample)) === JSON.stringify(dataShape(current)));
    patch[key] = structuredClone(hasContent(current) && compatible ? current : sample);
  }
  if (node.type === 'slider' && patch.range === true && !Array.isArray(patch.modelValue ?? node.props.modelValue)) patch.modelValue = [Number(node.props.min ?? 0), Number(node.props.modelValue ?? 50)];
  const sliderValue = patch.modelValue ?? node.props.modelValue;
  if (node.type === 'slider' && patch.range === false && Array.isArray(sliderValue)) patch.modelValue = sliderValue[1] ?? sliderValue[0] ?? 0;
  if (node.type === 'collapse' && typeof patch.accordion === 'boolean') {
    const current = patch.modelValue ?? node.props.modelValue;
    patch.modelValue = patch.accordion ? Array.isArray(current) ? current[0] ?? '' : current ?? '' : Array.isArray(current) ? current : hasContent(current) ? [current] : [];
  }
  if (node.type === 'swipe' && !Number(patch.height ?? node.props.height)) patch.height = 140;
  return patch;
}

export function componentStylePreview(type: string, style: ComponentStyle): CanvasNode {
  type = componentStyles[type]?.nativeType || type;
  const definition = getDefinition(type);
  const node: CanvasNode = { id: `style-${type}-${style.id}`, type, props: structuredClone(definition.defaultProps), content: definition.defaultContent };
  return applyComponentStyle(node, style.id) || node;
}

function materializeStyleNode(template: StyleNode, resets: Map<string, Set<string>>, previous?: CanvasNode): CanvasNode {
  const defaults = Object.fromEntries([...(resets.get(template.type) || [])].map((key) => [key, runtime[template.type]?.defaults?.[key]]));
  const props = { ...previous?.props, ...structuredClone(defaults), ...structuredClone(template.props) };
  for (const key of ['title', 'label', 'value', 'text', 'description', 'placeholder']) if (hasContent(previous?.props[key])) props[key] = previous!.props[key];
  return { ...previous, id: previous?.id || makeId(), type: template.type, props, content: previous?.content || template.content,
    children: template.children?.map((child, index) => materializeStyleNode(child, resets, previous?.children?.[index]?.type === child.type ? previous.children[index] : undefined)),
  };
}

export function applyComponentStyle(node: CanvasNode, id: string): CanvasNode | null {
  const config = componentStyles[node.type];
  const style = config?.items.find((item) => item.id === id);
  const patch = componentStylePatch(node, id);
  if (!style || !patch) return null;
  const next = { ...node, styleId: id, type: config.nativeType || node.type, props: { ...node.props, ...patch } };
  if (style.children) {
    const resets = new Map<string, Set<string>>();
    const collect = (children: StyleNode[]) => children.forEach((child) => { const keys = resets.get(child.type) || new Set<string>(); Object.keys(child.props).forEach((key) => keys.add(key)); resets.set(child.type, keys); if (child.children) collect(child.children); });
    config.items.forEach((item) => { if (item.children) collect(item.children); });
    next.children = style.children.map((child, index) => materializeStyleNode(child, resets, node.children?.[index]?.type === child.type ? node.children[index] : undefined));
    // A visual variant must not delete the user's additional tabs/grid items.
    for (const child of node.children?.slice(style.children.length) || []) {
      const template = style.children.find((item) => item.type === child.type);
      if (template) next.children.push(materializeStyleNode(template, resets, child));
    }
  }
  if (style.content && !hasContent(next.content)) next.content = style.content;
  return next;
}

function shown(node: CanvasNode, key: string) { return !!componentPropertyValue(node, key); }
function content(node: CanvasNode, key: string) { return hasContent(componentPropertyValue(node, key)); }

// Conditions describe actual runtime branches, not arbitrary restrictions on editable data.
export function isComponentPropertyVisible(node: CanvasNode, key: string): boolean {
  const p = effectiveProps(node);
  if (key === 'defaultValue' && node.props.modelValue !== undefined) return false;
  if (key === 'defaultExpanded' && node.props.expanded !== undefined) return false;
  if (node.type === 'cell') {
    if (['inset', 'grayCard', 'blueMark'].includes(key)) return false;
    if (['description', 'descriptionClickable', 'threeLineEllipsis'].includes(key)) return !!p.threeLine;
    if (['labelClickable', 'labelSize', 'showLabelIcon'].includes(key)) return content(node, 'label');
    if (key === 'labelIcon') return content(node, 'label') && shown(node, 'showLabelIcon');
    if (key === 'titleIconClickable') return shown(node, 'showTitleIcon');
    if (['noteBold', 'noteClickable', 'noteTo', 'noteUrl'].includes(key)) return shown(node, 'showNote');
    if (key === 'noteReplace') return shown(node, 'showNote') && (content(node, 'noteUrl') || content(node, 'noteTo'));
    if (key === 'arrowDirection') return shown(node, 'showRightIcon') && !!p.isLink && !p.rightIcon;
    if (key === 'leftSelect') return shown(node, 'showLeftSelect');
    if (key === 'rightSelect') return shown(node, 'showRightSelect');
    if (key === 'selectType') return shown(node, 'showLeftSelect') || shown(node, 'showRightSelect');
    if (key === 'showTitleCollapseIcon') return shown(node, 'showMultiLineNotes');
    if (key === 'defaultMultiLineNotesCollapsed') return shown(node, 'showMultiLineNotes') && !!p.showTitleCollapseIcon;
    const owner = Object.entries(cellShows).find(([, field]) => field === key);
    if (owner && key !== 'labelIcon') return shown(node, owner[0]);
    if (key === 'showRightIcon' || key === 'isLink') return true;
    if (key === 'titleBold' || key === 'threeLine' || key.startsWith('showTitle') || key === 'showWrapTags' || key === 'showTags') return content(node, 'title');
  }
  if (node.type === 'field') {
    if (['rows', 'autosize'].includes(key)) return p.type === 'textarea';
    if (['labelWidth', 'labelAlign'].includes(key)) return p.labelPosition !== 'top';
    if (key === 'showWordLimit') return Number(p.maxlength) > 0;
    if (key === 'clearIcon' || key === 'clearTrigger') return !!p.clearable;
    if (key === 'unit') return !!p.showUnit;
    if (key === 'wrapTags') return !!(p.showWrapTags ?? hasContent(p.wrapTags));
    if (key === 'titleIcon') return !!(p.showTitleIcon ?? hasContent(p.titleIcon));
  }
  if (node.type === 'button') {
    if (['loadingText', 'loadingType', 'loadingSize'].includes(key)) return !!p.loading;
    if (key === 'hairline') return !!p.plain;
    if (key === 'iconPosition' || key === 'iconSize' || key === 'iconPrefix') return !!(p.icon || p.rightIcon);
  }
  if (node.type === 'tag' && ['number', 'numberColor'].includes(key)) return !!p.showNumber;
  if (node.type === 'title-bar') {
    if (key === 'showDescription') return p.size !== 'mini';
    if (key === 'description') return p.size !== 'mini' && !!p.showDescription;
    if (key === 'actionText') return !!p.showAction;
    if (key === 'icon') return !!p.showIcon;
    if (key === 'rightIcon') return !!p.showRightIcon;
    if (key === 'showExpandIcon' || key === 'modelValue') return !!p.expandable;
  }
  if (node.type === 'blue-mark-header' && ['showExpandIcon', 'modelValue', 'expandText', 'collapseText'].includes(key)) return !!p.expandable;
  if (node.type === 'label') {
    const text = !['tag', 'media'].includes(p.type);
    const follows = text && !p.vertical && p.contentAlign !== 'right';
    if (['content', 'contentList', 'sameColor'].includes(key)) return text && p.showContent !== false;
    if (key === 'label') return p.showLabel !== false;
    if (key === 'tags') return p.type === 'tag';
    if (key === 'media') return p.type === 'media';
    if (key === 'href') return p.type === 'link';
    if (key === 'showLeftIcon') return follows;
    if (key === 'leftIcon') return follows && !!p.showLeftIcon;
    if (key === 'ellipsis') return text && !p.vertical;
    if (key === 'location') return !!p.vertical && ['bold', 'link'].includes(p.type);
    if (key === 'contentAlign') return !p.vertical && p.type !== 'media';
  }
  if (node.type === 'search') {
    if (key === 'actionText') return !!p.showAction;
    if (key === 'clearIcon' || key === 'clearTrigger') return !!p.clearable;
  }
  if (node.type === 'nav-bar') {
    if (key === 'titleDropdownActive') return !!p.titleDropdown;
    if (key === 'rightPopoverIcon') return hasContent(p.rightPopoverActions);
  }
  if (node.type === 'progress' && ['pivotText', 'pivotColor', 'textColor'].includes(key)) return p.showPivot !== false;
  if (node.type === 'image') {
    if (key === 'radius') return !p.round;
    if (key === 'loadingIcon') return p.showLoading !== false;
    if (key === 'errorIcon') return p.showError !== false;
  }
  if (node.type === 'info-card') {
    if (key === 'title') return p.showTitle !== false;
    if (key === 'showCollapse') return !!p.collapsible && hasContent(p.extraFields);
    if (['modelValue', 'collapsePosition', 'expandText', 'collapseText'].includes(key)) return !!p.collapsible && p.showCollapse !== false && hasContent(p.extraFields);
    if (key === 'cacheText') return !!p.showCacheBadge;
  }
  if (node.type === 'work-order-card') {
    if (key === 'expanded' || key === 'defaultExpanded') return !!p.expandable;
    if (key === 'overdue') return !!p.showOverdue;
    if (key === 'location') return p.showLocation !== false;
  }
  if (node.type === 'bottom-action-bar') {
    if (['secondaryType', 'secondaryLoading', 'secondaryDisabled'].includes(key)) return hasContent(p.secondaryText);
    if (key === 'iconDisabled') return hasContent(p.icon);
    if (['moreIcon', 'moreBadge', 'moreBadgeMax', 'moreDisabled', 'morePopoverActions'].includes(key)) return hasContent(p.moreText);
    if (key.startsWith('checkboxAction')) return !!p.showCheckboxAction;
  }
  if (node.type === 'stepper') {
    if (key === 'disablePlus') return p.showPlus !== false;
    if (key === 'disableMinus') return p.showMinus !== false;
    if (['disableInput', 'inputWidth', 'placeholder'].includes(key)) return p.showInput !== false;
  }
  if (node.type === 'badge') {
    if (['content', 'max', 'showZero'].includes(key) && p.dot) return false;
    if (key === 'max') return typeof p.content === 'number';
  }
  if (node.type === 'skeleton') {
    if (key.startsWith('avatar') && key !== 'avatar') return !!p.avatar;
    if (key === 'titleWidth') return !!p.title;
    if (key === 'rowWidth') return Number(p.row) > 0;
  }
  if (node.type === 'calendar') {
    if (['allowSameDay', 'maxRange', 'minRange', 'rangePrompt', 'showRangePrompt'].includes(key)) return p.type === 'range';
    if (['confirmText', 'confirmDisabledText'].includes(key)) return p.showConfirm !== false;
  }
  if (node.type === 'datetime-picker') {
    if (key === 'showTimeRange') return p.type === 'datetime';
    if (['minDate', 'maxDate'].includes(key)) return p.type !== 'time';
    if (['minHour', 'maxHour', 'minMinute', 'maxMinute'].includes(key)) return p.type === 'time';
  }
  if (node.type === 'picker') {
    if (['title', 'confirmButtonText', 'cancelButtonText', 'toolbarPosition'].includes(key)) return p.showToolbar !== false;
    if (key === 'defaultIndex') return !p.columns?.some((column: any) => column && typeof column === 'object' && (column.values || column.children));
    if (key === 'columnsFieldNames') return !!p.columns?.some((column: any) => column && typeof column === 'object');
  }
  if (node.type === 'uploader') {
    if (['previewSize', 'deletable', 'previewFullImage', 'resultType', 'imageFit'].includes(key)) return p.previewImage !== false;
    if (key === 'uploadText') return p.showUpload !== false;
  }
  if (['popup', 'dialog', 'action-sheet', 'popover', 'calendar', 'share-sheet', 'content-panel', 'form-panel'].includes(node.type)) {
    if (['overlayClass', 'overlayStyle', 'closeOnClickOverlay'].includes(key)) return p.overlay !== false;
    if (['closeIcon', 'closeIconPosition'].includes(key)) return !!p.closeable;
  }
  if (node.type === 'dialog') {
    if (key.startsWith('confirmButton')) return p.showConfirmButton !== false;
    if (key.startsWith('cancelButton')) return !!p.showCancelButton;
  }
  if (node.type === 'number-keyboard' && key === 'closeButtonLoading') return p.theme === 'custom';
  if (node.type === 'pagination' && ['forceEllipses', 'showPageSize'].includes(key)) return p.mode !== 'simple';
  if (node.type === 'tree-select' && key === 'cascade') return !!p.multiple;
  if (node.type === 'tabs') {
    if (['moreIcon', 'moreText', 'moreTitle', 'moreOptions', 'showMore'].includes(key)) return !!p.more;
    if (['border', 'lineWidth', 'lineHeight'].includes(key)) return !p.type || p.type === 'line';
    if (key === 'offsetTop') return !!p.sticky;
  }
  if (node.type === 'list') {
    if (key === 'finishedText') return !!p.finished;
    if (key === 'errorText') return !!p.error;
  }
  const flag = `show${key[0]?.toUpperCase()}${key.slice(1)}`;
  if (runtime[node.type]?.supportedProps?.includes(flag) && !key.startsWith('show')) return !!componentPropertyValue(node, flag);
  if (key === 'placeholder' && ['nav-bar', 'bottom-action-bar'].includes(node.type)) return !!p.fixed;
  return true;
}

export function componentPropertyPatch(node: CanvasNode, key: string, value: unknown): Record<string, unknown> {
  const patch: Record<string, unknown> = { [key]: value };
  if (node.type === 'slider' && key === 'range') {
    if (value === true && !Array.isArray(node.props.modelValue)) patch.modelValue = [Number(node.props.min ?? 0), Number(node.props.modelValue ?? 50)];
    if (value === false && Array.isArray(node.props.modelValue)) patch.modelValue = node.props.modelValue[1] ?? node.props.modelValue[0] ?? 0;
  }
  if (node.type === 'collapse' && key === 'accordion') {
    const current = node.props.modelValue;
    patch.modelValue = value ? Array.isArray(current) ? current[0] ?? '' : current ?? '' : Array.isArray(current) ? current : hasContent(current) ? [current] : [];
  }
  if (node.type === 'cell' && key === 'isLink' && value === false && !node.props.rightIcon) patch.showRightIcon = false;
  if (value !== true) return patch;
  const seed = (field: string, sample: unknown) => { if (!hasContent(node.props[field])) patch[field] = structuredClone(sample); };
  const field = key.match(/^show([A-Z].*)$/)?.[1];
  const contentKey = field && field[0].toLowerCase() + field.slice(1);
  if (contentKey && runtime[node.type]?.supportedProps?.includes(contentKey)) {
    const example = stylesFor(node.type).find((style) => hasContent(style.seeds?.[contentKey]) || hasContent(style.props[contentKey]));
    const sample = example?.seeds?.[contentKey] ?? example?.props[contentKey] ?? getDefinition(node.type).defaultProps[contentKey];
    if (hasContent(sample)) seed(contentKey, sample);
  }
  if (node.type === 'cell') {
    const samples: Record<string, unknown> = { icon: 'location-o', rightIcon: 'arrow', avatar: '/dog1.jpg', rightAvatar: '/dog1.jpg', tags: ['标签 1', '标签 2'], titleTag: '标签', wrapTags: ['标签 1', '标签 2'], titleIcon: 'info-o', note: '备注', badge: 9, multiLineNotes: ['备注信息'] };
    if (cellShows[key] && key !== 'showLabelIcon') seed(cellShows[key], samples[cellShows[key]]);
    if (key === 'showBlueMark') patch.blueMark = true;
    if (key === 'showLeftSelect' && node.props.leftSelect === undefined) patch.leftSelect = false;
    if (key === 'showRightSelect' && node.props.rightSelect === undefined) patch.rightSelect = false;
    if (key === 'threeLine') { seed('label', '描述信息'); seed('description', '第三行备注'); }
    if (key === 'isLink') { patch.rightIcon = ''; patch.showRightIcon = true; }
  }
  if (node.type === 'field') {
    if (key === 'showWrapTags') seed('wrapTags', ['标签 1', '标签 2']);
    if (key === 'showTitleIcon') seed('titleIcon', 'info-o');
    if (key === 'showUnit') seed('unit', '℃');
  }
  if (node.type === 'title-bar') {
    if (key === 'showDescription') seed('description', '备注信息');
    if (key === 'showIcon') seed('icon', 'info-o');
    if (key === 'showAction') seed('actionText', '操作');
  }
  if (node.type === 'tag' && key === 'showNumber') seed('number', 12);
  if (node.type === 'info-card' && key === 'collapsible') seed('extraFields', [{ label: '补充信息', content: '请填写内容' }]);
  if (node.type === 'work-order-card' && key === 'showOverdue') seed('overdue', '已超时');
  return patch;
}

export function componentPropertyHint(node: CanvasNode, key: string): string {
  if (key === 'clickable') return '按下组件时显示反馈，请在右上角预览中测试。';
  if (key === 'clearable') return '有输入内容并聚焦时显示清除按钮，请在预览中测试。';
  if (['readonly', 'autofocus', 'integer', 'longPress', 'touchable'].includes(key)) return '此属性影响操作行为，请在右上角预览中测试。';
  if (['animated', 'swipeable', 'sticky', 'loop', 'lazyRender', 'closeOnClickOverlay', 'closeOnClickOutside', 'lockScroll', 'immediateCheck', 'lazyLoad'].includes(key)) return '此属性影响操作行为，请在右上角预览中测试。';
  if (node.type === 'image' && ['showLoading', 'showError'].includes(key)) return '仅在图片加载中或加载失败时显示对应提示。';
  if (node.type === 'cell' && key === 'border') return '内边框位于单元格下方，末项会按组件规范自动隐藏。';
  return '';
}

export function visibleComponentProperties(node: CanvasNode, definition: ComponentDefinition) {
  return definition.properties.filter((schema) => !/\b[Ff]unction\b|=>/.test(schema.help || '') && isComponentPropertyVisible(node, schema.key));
}

export function initialComponentStateKey(node: CanvasNode) {
  return JSON.stringify([node.id, ...Object.entries(node.props).filter(([key]) => /^default[A-Z]/.test(key))]);
}
