import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import * as library from 'persagy-vant';

// The library's Space implementation references the browser Text constructor.
// SSR has no DOM; no DOM operations are performed by this rendering check.
globalThis.Text ??= class Text {};

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-component-styles-'));
const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, resolve: { dedupe: ['vue'] }, ssr: { noExternal: ['persagy-vant', '@vant/use'] }, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const { default: PersagyVant } = await server.ssrLoadModule('persagy-vant');
const { default: Lazyload } = await server.ssrLoadModule('persagy-vant/es/lazyload/index.mjs');
const { componentStyles } = await server.ssrLoadModule('/src/data/componentStyles.ts');
const { getDefinition, createNode } = await server.ssrLoadModule('/src/data/componentCatalog.ts');
const helpers = await server.ssrLoadModule('/src/utils/componentStyles.ts');
const { applyComponentStyle, componentStylePatch, componentStylePreview, selectedComponentStyle, patchChangesComponentStyle, componentPropertyPatch, componentPropertyValue, isComponentPropertyVisible: visible, visibleComponentProperties, initialComponentStateKey } = helpers;
const { default: Renderer } = await server.ssrLoadModule('/src/components/ComponentRenderer.vue');
const { default: Panel } = await server.ssrLoadModule('/src/components/PropertyPanel.vue');
const { toVueSfc, toJson } = await server.ssrLoadModule('/src/utils/exportDesign.ts');
await server.close();
await rm(cacheDir, { recursive: true, force: true });
const render = (node) => renderToString(createSSRApp(Renderer, { node, thumbnail: true, stylePreview: true }).use(PersagyVant).use(Lazyload, { lazyComponent: true }));
const apply = (node, patch) => ({ ...node, props: { ...node.props, ...patch } });

test('全部样式只使用真实组件公开参数，缩略图不依赖业务占位，选中状态与实际属性一致', async () => {
  assert.ok(Object.keys(componentStyles).length >= 20);
  for (const [type, config] of Object.entries(componentStyles)) {
    const definition = getDefinition(config.nativeType || type);
    const api = library[definition.englishName];
    const component = api?.Component || api || Object.values(library).map((entry) => entry?.Component || entry).find((entry) => entry?.name === `van-${config.nativeType || type}`);
    assert(component?.props, `${type} must resolve to its real runtime component`);
    assert.ok(selectedComponentStyle(createNode(type)), `${type} must have a selected initial style`);
    for (const style of config.items) {
      for (const key of [...Object.keys(config.reset), ...Object.keys(style.props), ...Object.keys(style.seeds || {})]) assert(key in component.props, `${type}/${style.id}: unsupported prop ${key}`);
      const node = componentStylePreview(type, style);
      assert.equal(selectedComponentStyle(node), style.id, `${type}/${style.id}: wrong selected thumbnail`);
      const html = await render(node);
      assert.doesNotMatch(html, /configured-component|需要业务数据/);
      assert.match(html, /class="van-/, `${type}/${style.id}: thumbnail must render the component`);
    }
  }
});

test('单元格样式切换保留节点身份、主要业务文字和交互，保存及 Vue 导出使用真实属性', async () => {
  const original = { ...createNode('cell', { title: '设备 AHU-01', value: '处理中', label: '原设备编号' }), actions: { click: { type: 'open-panel', targetId: 'details' } } };
  const snapshot = JSON.stringify(original);
  const three = apply(original, componentStylePatch(original, 'three'));
  assert.equal(three.id, original.id); assert.deepEqual(three.actions, original.actions);
  assert.equal(three.props.title, original.props.title); assert.equal(three.props.value, original.props.value);
  assert.equal(three.props.label, '原设备编号');
  assert.match(await render(three), /van-cell--three-line/);
  assert.match(await render(three), /所在位置：B3 空调机房/);
  assert.match(toVueSfc('样式测试', [three]), /three-line/);
  assert.equal(JSON.parse(toJson('样式测试', [three])).components[0].props.threeLine, true);
  const single = apply(three, componentStylePatch(three, 'single'));
  assert.doesNotMatch(await render(single), /van-cell--three-line|van-cell__description/);
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(componentStylePatch(original, 'missing'), null);
});

test('单元格显隐开关使用自动显示状态，开启空元素时补齐必要内容而非空开关', async () => {
  const node = createNode('cell');
  assert.equal(componentPropertyValue(node, 'showRightIcon'), true);
  assert.equal(componentPropertyValue(node, 'showIcon'), false);
  for (const [key, expected] of [
    ['showIcon', /van-cell__left-icon/], ['showWrapTags', /van-cell__wrap-tags/],
    ['showTitleTag', /van-cell__title-tag/], ['showTitleIcon', /van-cell__title-icon/],
    ['showMultiLineNotes', /van-cell__multi-line-notes/], ['showLeftSelect', /van-cell__left-select/],
    ['showBadge', /van-cell__badge/], ['showBlueMark', /van-cell__blue-mark/],
    ['showNote', /van-cell__note/], ['showAvatar', /van-cell__left-avatar/],
  ]) {
    const enabled = apply(node, componentPropertyPatch(node, key, true));
    assert.match(await render(enabled), expected, key);
    assert.doesNotMatch(await render(apply(enabled, componentPropertyPatch(enabled, key, false))), expected, key);
  }
  const existing = createNode('cell', { icon: 'smile-o', wrapTags: ['重要设备'], badge: 0 });
  assert.equal(componentPropertyPatch(existing, 'showIcon', true).icon, undefined);
  assert.equal(componentPropertyPatch(existing, 'showWrapTags', true).wrapTags, undefined);
  assert.equal(componentPropertyPatch(existing, 'showBadge', true).badge, undefined);
});

test('样式和内容依赖隐藏无效变量，重新启用后原有内容仍保留', () => {
  const cell = createNode('cell');
  assert.equal(visible(cell, 'description'), false);
  assert.equal(visible(cell, 'descriptionClickable'), false);
  assert.equal(visible(cell, 'wrapTags'), false);
  assert.equal(visible(cell, 'noteBold'), false);
  assert.equal(visible(cell, 'defaultMultiLineNotesCollapsed'), false);
  assert.equal(visible(apply(cell, { threeLine: true }), 'description'), true);
  assert.equal(visible(apply(cell, { showWrapTags: true, wrapTags: ['测试'] }), 'wrapTags'), true);
  assert.equal(visible(apply(cell, { showMultiLineNotes: true, showTitleCollapseIcon: true }), 'defaultMultiLineNotesCollapsed'), true);
  assert.equal(visible(createNode('title-bar', { size: 'mini', showDescription: true }), 'showDescription'), false);
  assert.equal(visible(createNode('title-bar', { size: 'mini', showDescription: true }), 'description'), false);
  assert.equal(visible(createNode('label', { vertical: true }), 'showLeftIcon'), false);
  assert.equal(visible(createNode('label', { contentAlign: 'right' }), 'showLeftIcon'), false);
  assert.equal(visible(createNode('label', { type: 'tag' }), 'content'), false);
  assert.equal(visible(createNode('label', { type: 'tag' }), 'tags'), true);
  assert.equal(visible(createNode('label', { type: 'bold', vertical: true }), 'location'), true);
  assert.equal(visible(createNode('field', { type: 'text' }), 'rows'), false);
  assert.equal(visible(createNode('field', { type: 'textarea' }), 'rows'), true);
  assert.equal(visible(createNode('button', { loading: false }), 'loadingText'), false);
  assert.equal(visible(createNode('button', { loading: true }), 'loadingText'), true);
});

test('初始状态属性变更刷新预览组件，普通文字变更不重置运行状态', async () => {
  const node = apply(createNode('cell'), { ...componentStylePatch(createNode('cell'), 'collapsible-notes'), defaultMultiLineNotesCollapsed: false });
  const collapsed = apply(node, { defaultMultiLineNotesCollapsed: true });
  assert.notEqual(initialComponentStateKey(node), initialComponentStateKey(collapsed));
  assert.equal(initialComponentStateKey(node), initialComponentStateKey(apply(node, { title: '新标题' })));
  assert.match(await render(node), /已完成设备检查/);
  assert.doesNotMatch(await render(collapsed), /已完成设备检查/);
});

test('元数据区分 Cell 与 CellGroup，样式面板回显选中缩略图且不暴露不支持变量', async () => {
  const definition = getDefinition('cell');
  assert(!definition.properties.some(({ key }) => ['inset', 'grayCard'].includes(key)));
  assert.equal(getDefinition('image').properties.some(({ key }) => /3\.6\.3/.test(key)), false);
  const node = createNode('cell');
  const html = await renderToString(createSSRApp(Panel, { node, nodes: [node], selection: [node], canGroup: true, index: 0, total: 1 }).use(PersagyVant));
  assert.match(html, /component-style-grid/);
  assert.match(html, /data-style-id="arrow"/);
  assert.match(html, /aria-pressed="true"[^>]*data-style-id="arrow"/);
  assert.doesNotMatch(html, new RegExp(`id="property-${node.id}-(?:inset|grayCard|description|wrapTags)"`));
});

test('结构化默认值说明不作为字符串传给真实组件，组件库加载不会因缩略图中断', async () => {
  for (const [type, key] of [['index-bar', 'indexList'], ['picker', 'columnsFieldNames'], ['cascader', 'fieldNames']]) {
    const node = createNode(type);
    assert.notEqual(typeof node.props[key], 'string', `${type}.${key}`);
    assert.match(await render(node), /class="van-/);
  }
});

test('选择器按数据结构区分单列、多列、级联及禁用选项，切换后使用兼容数据', async () => {
  const picker = createNode('picker');
  assert.equal(selectedComponentStyle(picker), componentStyles.picker.items[0].id);
  let current = picker;
  for (const name of ['多列选择', '级联选择', '禁用选项', '自定义 Columns 的结构', '基础用法']) {
    const style = componentStyles.picker.items.find((item) => item.name === name);
    assert(style, name);
    current = applyComponentStyle(current, style.id);
    if (name === '多列选择') assert(Array.isArray(current.props.columns[0].values));
    if (name === '级联选择') assert(Array.isArray(current.props.columns[0].children));
    if (name === '禁用选项') assert.equal(current.props.columns[0].disabled, true);
    if (name === '自定义 Columns 的结构') assert.equal(current.props.columnsFieldNames.text, 'cityName');
    if (name === '基础用法') { assert.equal(typeof current.props.columns[0], 'string'); assert.equal(current.props.columnsFieldNames, undefined); }
    assert.match(await render(current), /van-picker-column/);
  }
});

test('组合样式同步原生子组件，保留身份和已编辑文案，清理旧徽标及禁用状态', async () => {
  const tabs = createNode('tabs');
  tabs.children[0].props.title = '设备信息';
  const badge = applyComponentStyle(tabs, componentStyles.tabs.items.find((item) => item.name === '徽标展示').id);
  assert.equal(badge.children[0].id, tabs.children[0].id);
  assert.equal(badge.children[0].props.title, '设备信息');
  assert.equal(badge.children[1].props.badge, 'New');
  assert.equal(badge.children.length, tabs.children.length, '样式切换不能丢掉原有标签');
  const gray = applyComponentStyle(badge, 'docs-type-card-gray');
  assert.equal(gray.props.type, 'card-gray');
  assert.equal(gray.children[1].props.badge, undefined);
  assert.equal(gray.children[2].props.dot, false);
  assert.match(await render(gray), /van-tabs--card-gray/);
  assert.match(toVueSfc('标签页', [gray]), /v-model:active=/);
  assert.match(toVueSfc('标签页', [gray]), /<Tab title="设备信息"/);
});

test('编辑业务内容保留样式选择，结构变化更新选中项，范围开关保持模型类型有效', () => {
  const field = applyComponentStyle(createNode('field'), 'textarea');
  assert.equal(patchChangesComponentStyle(field, { label: '处理说明', modelValue: '业务内容' }), false);
  assert.equal(patchChangesComponentStyle(field, { type: 'text' }), true);
  const slider = createNode('slider', { modelValue: 40 });
  const range = apply(slider, componentPropertyPatch(slider, 'range', true));
  assert.deepEqual(range.props.modelValue, [0, 40]);
  assert.equal(componentPropertyPatch(range, 'range', false).modelValue, 40);
  assert(!visibleComponentProperties(createNode('tabs'), getDefinition('tabs')).some(({ key }) => key === 'beforeChange'));
  assert.equal(getDefinition('slider').properties.find(({ key }) => key === 'reverse').control, 'boolean');
  assert.equal(getDefinition('slider').properties.find(({ key }) => key === 'modelValue').control, 'json');
  assert.equal(selectedComponentStyle(createNode('tabs')), componentStyles.tabs.items[0].id);
  assert.equal(visible(createNode('tabs', { type: 'card-gray' }), 'lineWidth'), false);
  assert.equal(visible(createNode('tabs', { more: false }), 'moreOptions'), false);
  assert.equal(visible(createNode('picker', { columns: [{ values: ['第一列'] }, { values: ['第二列'] }] }), 'defaultIndex'), false);
});
