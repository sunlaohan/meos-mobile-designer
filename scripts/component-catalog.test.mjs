import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-catalog-'));
const server = await createServer({ configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
let catalog;
let navigation;
try {
  catalog = await server.ssrLoadModule('/src/data/componentCatalog.ts');
  navigation = await server.ssrLoadModule('/src/data/componentNavigation.ts');
} finally {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}

test('全部组件的开关字段名称不再包含“是否”', () => {
  let count = 0;
  for (const definition of catalog.componentCatalog) {
    for (const property of definition.properties) {
      if (property.control !== 'boolean') continue;
      count += 1;
      assert(!property.label.includes('是否'), `${definition.type}.${property.key}: ${property.label}`);
      assert(property.label.trim(), `${definition.type}.${property.key} 需要保留字段名称`);
    }
  }
  assert(count > 100, '覆盖整个组件库的开关字段');
});

test('资源分类、名称及组件顺序沿用官网中文导航，隐藏指定入口', async () => {
  const packageRoot = path.dirname(createRequire(import.meta.url).resolve('persagy-vant/package.json'));
  const { default: config } = await import(pathToFileURL(path.join(packageRoot, 'vant.config.mjs')).href);
  const hiddenPaths = new Set(['space', 'col', 'popup', 'style', 'config-provider', 'overlay', 'form']);
  const expected = config.site.locales['zh-CN'].nav.filter((group) => group.title.endsWith('组件')).map((group) => ({
    ...group,
    items: group.items.filter((item) => !hiddenPaths.has(item.path)),
  }));
  assert.deepEqual(navigation.componentCategories, ['基础组件', '表单组件', '反馈组件', '展示组件', '导航组件', '业务组件']);
  assert.deepEqual(navigation.componentNavigation.map((group) => ({
    title: group.title,
    items: group.items.map((item) => ({ path: item.path, title: `${item.name} ${item.englishName}`.trim() })),
  })), expected);
  assert.deepEqual(navigation.componentNavigation[0].items.slice(0, 4).map((item) => item.path), ['button', 'icon', 'cell', 'image']);
});

test('保留拖拽组件、属性及历史图层，说明性条目仅提供文档入口', () => {
  const items = navigation.componentNavigationItems;
  assert.equal(new Set(items.map((item) => item.path)).size, items.length);
  for (const item of items.filter((entry) => entry.component)) {
    const original = catalog.getDefinition(item.path);
    assert.equal(item.component.type, original.type);
    assert.equal(item.component.properties, original.properties);
    assert.equal(item.component.defaultProps, original.defaultProps);
    assert.equal(item.component.category, item.category);
  }
  assert.deepEqual(items.filter((item) => !item.component).map((item) => item.path), ['lazyload', 'bot-mobile']);
  for (const type of ['space', 'col', 'popup', 'config-provider', 'overlay', 'form']) {
    assert.equal(catalog.createNode(type).type, type, `隐藏 ${type} 的入口后，已有页面中的组件仍然可用`);
  }
  assert(catalog.getDefinition('blue-mark-header'), '已保存页面中的历史组件继续可用');
  assert(!items.some((item) => item.path === 'blue-mark-header'), '资源面板不插入官网之外的重复入口');
});

test('移除开头和句中的“是否”，保留字段映射和类型说明', () => {
  const properties = catalog.getDefinition('cell').properties;
  const bold = properties.find((property) => property.key === 'titleBold');
  assert.equal(bold.label, '标题加粗');
  assert.equal(bold.description, '加粗左侧标题文本');
  assert.equal(bold.help, 'title-bold · boolean');
  assert.equal(bold.control, 'boolean');
  assert.equal(properties.find((property) => property.key === 'defaultMultiLineNotesCollapsed').label, '默认收起多行备注');
  assert.equal(properties.find((property) => property.key === 'title').label, '左侧标题');
});

test('树选择和批量多选提供真实预览及独立的默认示例，数据只使用公开属性', () => {
  for (const type of ['tree-select', 'quantity-input']) {
    const definition = catalog.getDefinition(type);
    assert.equal(definition.previewMode, 'live');
    const first = catalog.createNode(type);
    const second = catalog.createNode(type);
    assert(first.props.items.length > 0);
    assert(Array.isArray(first.props.modelValue));
    const keys = new Set(definition.properties.map((property) => property.key));
    for (const key of Object.keys(first.props)) assert(keys.has(key), `${type}.${key} 必须是公开属性`);
    first.props.items[0].name = '修改后的选项';
    first.props.modelValue.length = 0;
    assert.notEqual(second.props.items[0].name, '修改后的选项');
    assert(second.props.modelValue.length > 0, '不同组件实例不得共享示例数组');
  }
  const tree = catalog.createNode('tree-select');
  assert(tree.props.items[0].children.some((item) => item.id === tree.props.modelValue[0]));
  assert(tree.props.expandedKeys.includes(tree.props.items[0].id));
  assert.equal(catalog.getDefinition('tree-select').properties.find((item) => item.key === 'items').label, '树节点');
  assert.equal(catalog.getDefinition('quantity-input').properties.find((item) => item.key === 'modelValue').label, '勾选状态');
});

test('使用简短中文标签，完整说明独立保留，不影响字段和变量匹配', () => {
  const cell = catalog.getDefinition('cell');
  const clickable = cell.properties.find((property) => property.key === 'labelClickable');
  assert.equal(clickable.label, '备注可点击');
  assert.equal(clickable.description, '将第二行备注设为蓝色加粗的可点击文本');
  const size = cell.properties.find((property) => property.key === 'labelSize');
  assert.equal(size.label, '备注字号');
  assert.equal(size.description, '标题下方备注文本字号，默认单位为 px');
  assert.equal(size.tokenKind, 'font-size');
  assert.equal(size.help, 'label-size · number | string');
  assert.equal(catalog.getDefinition('blue-mark-header').properties.find((property) => property.key === 'required').label, '必填标识');
});
