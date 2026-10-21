import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import PersagyVant from 'persagy-vant';
import { runInNewContext } from 'node:vm';
import { createContainerExtensionRuntime } from '../shared/container-extension-runtime.mjs';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-container-extensions-'));
const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const extensions = await server.ssrLoadModule('/src/utils/containerExtensions.ts');
const tree = await server.ssrLoadModule('/src/utils/nodeTree.ts');
const exports = await server.ssrLoadModule('/src/utils/exportDesign.ts');
const { default: Editor } = await server.ssrLoadModule('/src/components/ContainerExtensionEditor.vue');
const { default: Renderer } = await server.ssrLoadModule('/src/components/ContainerExtensionsRenderer.vue');
const { default: Panel } = await server.ssrLoadModule('/src/components/PropertyPanel.vue');
await server.close();
await rm(cacheDir, { recursive: true, force: true });
const node = (id, type, children = []) => ({ id, type, props: {}, children });
const config = (kind, enabled = true, props = {}) => ({ [kind]: { enabled, props } });
const fixture = () => [node('background', 'background', [node('group', 'container-group', [node('cell', 'cell')])])];

test('容器扩展仅用于背景和分组，不向普通 Props 或子图层写入扩展', () => {
  const original = fixture();
  const snapshot = JSON.stringify(original);
  let next = extensions.updateContainerExtensions(original, 'background', { ...config('pull-refresh'), ...config('list') });
  next = extensions.updateContainerExtensions(next, 'group', config('lazyload'));
  assert.equal(tree.findNode(next, 'background').node.extensions['pull-refresh'].props.pullDistance, 50);
  assert.equal(tree.findNode(next, 'background').node.extensions.list.props.offset, 300);
  assert.equal(tree.findNode(next, 'group').node.extensions.lazyload.props.placeholderHeight, 160);
  assert.deepEqual(tree.findNode(next, 'background').node.props, {});
  assert.deepEqual(tree.flattenNodes(next).map(({ id }) => id), ['background', 'group', 'cell']);
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(extensions.updateContainerExtensions(original, 'cell', config('sticky')), null);
  assert.equal(extensions.updateContainerExtensions(original, 'missing', config('sticky')), null);
  assert.equal(extensions.supportsContainerExtensions({ ...node('spacer', 'container-group'), layoutRole: 'spacer' }), false);
});

test('添加、停用和移除保留完整子图层；复制、JSON、恢复快照保留扩展配置', () => {
  const original = fixture();
  const enabled = extensions.updateContainerExtensions(original, 'group', config('sticky', true, { position: 'bottom', offsetBottom: 16 }));
  const disabled = extensions.updateContainerExtensions(enabled, 'group', config('sticky', false, { position: 'bottom', offsetBottom: 16 }));
  assert.equal(tree.findNode(disabled, 'group').node.extensions.sticky.enabled, false);
  assert.equal(tree.findNode(disabled, 'group').node.extensions.sticky.props.offsetBottom, 16);
  assert.deepEqual(extensions.updateContainerExtensions(disabled, 'group', {}), original);
  assert.deepEqual(JSON.parse(exports.toJson('扩展', enabled)).components, enabled);
  let count = 0;
  const copied = tree.duplicateNodes(enabled, ['group'], () => `copy-${++count}`);
  assert.deepEqual(tree.findNode(copied.nodes, copied.selectedIds[0]).node.extensions, tree.findNode(enabled, 'group').node.extensions);
  assert.deepEqual(tree.cloneNodes(enabled), enabled);
});

test('限制祖先、后代和已有原生包装的同类嵌套，同时允许刷新与加载组合', () => {
  const original = extensions.updateContainerExtensions(fixture(), 'group', config('pull-refresh'));
  assert.equal(extensions.extensionConflict(original, 'background', 'pull-refresh'), '子图层已启用同类扩展');
  assert.equal(extensions.updateContainerExtensions(original, 'background', config('pull-refresh')), null);
  assert(extensions.updateContainerExtensions(original, 'background', config('list')));
  const parent = extensions.updateContainerExtensions(fixture(), 'background', config('sticky'));
  assert.equal(extensions.updateContainerExtensions(parent, 'group', config('sticky')), null);
  assert(extensions.updateContainerExtensions(parent, 'group', config('sticky', false)));
  const native = [node('native', 'pull-refresh', [node('group', 'container-group')])];
  assert.equal(extensions.updateContainerExtensions(native, 'group', config('pull-refresh')), null);
  const moved = tree.moveNode([...parent, { ...node('extra', 'container-group'), extensions: config('sticky') }], 'extra', 0, 'background');
  assert.match(extensions.extensionTreeError(moved), /不能在父子容器中重复启用/);
  const invalid = [{ ...node('outer', 'background', [{ ...node('inner', 'container-group'), extensions: config('list') }]), extensions: config('list') }];
  assert.equal(extensions.effectiveExtensions(invalid[0].children[0], invalid).list.enabled, false);
});

test('仅接收支持的扩展和公开配置，数字有限且限定范围，恢复旧文档无需迁移', () => {
  const selected = { ...node('group', 'container-group'), extensions: { ...config('sticky', true, { position: 'invalid', zIndex: Infinity, offsetTop: -2, secret: 'not allowed' }), ...config('lazyload', true, { placeholderHeight: 0 }), unsupported: { enabled: true, props: {} } } };
  const normalized = extensions.normalizedExtensions(selected);
  assert.equal(normalized.sticky.props.position, 'top');
  assert.equal(normalized.sticky.props.zIndex, 99);
  assert.equal(normalized.sticky.props.offsetTop, 0);
  assert.equal(normalized.lazyload.props.placeholderHeight, 1);
  assert.equal(normalized.sticky.props.secret, undefined);
  assert.equal(normalized.unsupported, undefined);
  assert.deepEqual(extensions.normalizedExtensions(node('old', 'background')), {});
});

test('右侧扩展区支持四类选项、状态与参数回显，普通组件不展示', async () => {
  const selected = { ...node('group', 'container-group'), extensions: { ...config('pull-refresh'), ...config('sticky', false) } };
  const html = await renderToString(createSSRApp(Editor, { node: selected, nodes: [selected] }));
  assert.match(html, /容器扩展/);
  assert.match(html, /添加扩展/);
  assert.match(html, /class="extension-add" aria-expanded="false" aria-label="添加扩展" title="添加扩展"/);
  assert.match(html, /lucide-plus/);
  assert.match(html, /aria-label="启用下拉刷新扩展" aria-checked="true"/);
  assert.match(html, /aria-label="启用吸顶／吸底扩展" aria-checked="false"/);
  assert.match(html, /移除扩展，保留容器和子图层/);
  for (const type of ['background', 'container-group', 'cell']) {
    const item = node(type, type);
    const panel = await renderToString(createSSRApp(Panel, { node: item, nodes: [item], selection: [item], canGroup: true, index: 0, total: 1 }).use(PersagyVant));
    if (type === 'cell') assert.doesNotMatch(panel, /aria-label="容器扩展"/);
    else assert.match(panel, /aria-label="容器扩展"/);
  }
});

test('编辑态旁路所有运行行为，预览输出真实刷新和加载组件，懒加载先保留占位', async () => {
  const selected = { ...node('group', 'container-group'), extensions: { ...config('pull-refresh'), ...config('list'), ...config('sticky') } };
  const render = (item, interactive) => renderToString(createSSRApp({ render: () => h(Renderer, { node: item, nodes: [item], interactive }, { default: () => '原始内容' }) }).use(PersagyVant));
  const editor = await render(selected, false);
  assert.match(editor, /原始内容/);
  assert.doesNotMatch(editor, /van-pull-refresh|van-list|van-sticky|container-extension-placeholder/);
  const preview = await render(selected, true);
  assert.match(preview, /van-pull-refresh/);
  assert.match(preview, /van-list/);
  assert.match(preview, /van-sticky/);
  assert.match(preview, /原始内容/);
  const lazy = await render({ ...selected, extensions: config('lazyload', true, { placeholderHeight: 240 }) }, true);
  assert.match(lazy, /min-height:240px/);
  assert.match(lazy, /内容待进入可视区加载/);
  assert.doesNotMatch(lazy, /原始内容/);
});

test('Vue 单文件导出内置同一运行时、自动注册懒加载、预留接口，嵌套关系和参数可编译', () => {
  let nodes = extensions.updateContainerExtensions(fixture(), 'background', { ...config('pull-refresh', true, { successText: "刷新'完成<&" }), ...config('list') });
  nodes = extensions.updateContainerExtensions(nodes, 'group', { ...config('lazyload'), ...config('sticky') });
  nodes.push({ id: 'source', type: 'button', props: {}, actions: { click: { type: 'open-panel', targetId: 'popover' } } }, { id: 'popover', type: 'popover', props: { show: false } });
  const code = exports.toVueSfc('容器扩展', nodes);
  assert.match(code, /import Lazyload from 'persagy-vant\/es\/lazyload\/index.mjs'/);
  assert.match(code, /use\(Lazyload, \{ lazyComponent: true \}\)/);
  assert.match(code, /const ContainerBehavior = \(function createContainerExtensionRuntime/);
  assert.match(code, /containerDataHandlers/);
  assert.match(code, /handleContainerEvent\('background', 'refresh', \$event\)/);
  assert.match(code, /刷新&#39;完成&lt;&amp;/);
  assert.doesNotMatch(code, / from ['"]\.\.?\//);
  const { descriptor, errors } = parse(code);
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: 'container-export' });
  const template = compileTemplate({ source: descriptor.template.content, filename: 'ContainerExport.vue', id: 'container-export', compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, []);
  const markdown = exports.toMarkdown('容器扩展', nodes);
  assert.match(markdown, /## 容器扩展/);
  assert.match(markdown, /下拉刷新/);
  assert.match(markdown, /containerDataHandlers/);
  const disabled = exports.toVueSfc('停用', [{ ...node('group', 'container-group'), extensions: config('lazyload', false) }]);
  assert.doesNotMatch(disabled, /ContainerBehavior|import Lazyload/);
});

function runtimeFixture(extensions, factory = createContainerExtensionRuntime) {
  const emitted = [];
  const hooks = {};
  const component = factory({
    defineComponent: (value) => value, h: (type, props, slots) => ({ type, props, slots }), ref: (value) => ({ value }), computed: (get) => ({ get value() { return get(); } }),
    watch: () => {}, onMounted: (hook) => { hooks.mounted = hook; }, onBeforeUnmount: (hook) => { hooks.unmounted = hook; }, nextTick: async () => {}, resolveComponent: (name) => name,
    PullRefresh: 'PullRefresh', List: 'List', Sticky: 'Sticky',
  });
  const render = component.setup({ extensions, interactive: true, simulate: false }, { slots: { default: () => '内容' }, emit: (...args) => emitted.push(args) });
  return { render, emitted, hooks };
}

test('刷新与加载控制可完成和失败重试，旧异步响应不覆盖新请求且不修改配置', () => {
  const configValue = { ...config('pull-refresh'), ...config('list') };
  const snapshot = JSON.stringify(configValue);
  const { render, emitted } = runtimeFixture(configValue);
  render().slots.default().props.onLoad();
  const first = emitted.find(([name]) => name === 'load')[1];
  assert.equal(render().slots.default().props.loading, true);
  render().props.onRefresh();
  const refresh = emitted.find(([name]) => name === 'refresh')[1];
  first.complete({ finished: true });
  assert.equal(render().props.modelValue, true);
  refresh.complete();
  assert.equal(render().props.modelValue, false);
  assert.equal(render().slots.default().props.finished, false);
  render().slots.default().props.onLoad();
  const load = emitted.filter(([name]) => name === 'load').at(-1)[1];
  load.fail();
  assert.equal(render().slots.default().props.error, true);
  render().slots.default().props.onLoad();
  emitted.filter(([name]) => name === 'load').at(-1)[1].complete({ finished: true });
  assert.equal(render().slots.default().props.finished, true);
  assert.equal(JSON.stringify(configValue), snapshot);
});

test('桌面鼠标桥接原生下拉手势，取消回到零位，卸载清理监听并忽略迟到响应', () => {
  const listeners = new Map();
  const fakeWindow = { scrollY: 100, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name) };
  const factory = runInNewContext(`(${createContainerExtensionRuntime.toString()})`, { window: fakeWindow, Event, setTimeout, clearTimeout, getComputedStyle: () => ({ overflowY: 'auto' }) });
  const runtime = runtimeFixture(config('pull-refresh'), factory);
  const events = [];
  const track = { dispatchEvent: (event) => events.push(event) };
  const start = { pointerType: 'mouse', pointerId: 1, button: 0, clientX: 100, clientY: 100, target: { closest: () => null }, currentTarget: { parentElement: { scrollTop: 0 }, querySelector: () => track } };
  runtime.render().props.onPointerdown(start);
  assert.equal(events[0].type, 'touchstart');
  assert.equal(events[0].touches[0].clientY, 100);
  let prevented = false;
  listeners.get('pointermove')({ pointerId: 1, buttons: 1, clientX: 100, clientY: 250, cancelable: true, preventDefault: () => { prevented = true; } });
  assert(prevented);
  assert.equal(events.at(-1).type, 'touchmove');
  listeners.get('keydown')({ key: 'Escape' });
  assert.equal(events.at(-2).touches[0].clientY, 100);
  assert.equal(events.at(-1).type, 'touchend');
  assert.equal(listeners.size, 0);
  runtime.render().props.onRefresh();
  const control = runtime.emitted.find(([name]) => name === 'refresh')[1];
  runtime.hooks.unmounted();
  control.complete();
  assert.equal(listeners.size, 0);
  assert.equal(runtime.render().props.modelValue, true, '卸载后的响应不再写状态');
});
