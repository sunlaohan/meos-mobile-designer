import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import PersagyVant from 'persagy-vant';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

test('树选择和批量多选的缩略图及画布渲染真实组件，Vue 导出保留选择和展开绑定', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-selections-'));
  const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  try {
    const { default: Renderer } = await server.ssrLoadModule('/src/components/ComponentRenderer.vue');
    const { createNode } = await server.ssrLoadModule('/src/data/componentCatalog.ts');
    const { toVueSfc, toJson } = await server.ssrLoadModule('/src/utils/exportDesign.ts');
    const nodes = ['tree-select', 'quantity-input'].map((type) => createNode(type));
    for (const node of nodes) for (const options of [{ thumbnail: true }, {}, { interactive: true }]) {
      const html = await renderToString(createSSRApp(Renderer, { node, ...options }).use(PersagyVant));
      assert.match(html, new RegExp(`class="van-${node.type}`));
      assert.doesNotMatch(html, /configured-component|需要业务数据/);
      if (node.type === 'tree-select') assert.match(html, /设备分类[\s\S]*暖通空调[\s\S]*给排水/);
      else assert.match(html, /巡检工具[\s\S]*安全用品[\s\S]*维修备件[\s\S]*展开已选/);
    }
    const snapshot = JSON.stringify(nodes);
    // Imported/AI nodes may omit their selection state and rely on component defaults.
    delete nodes[0].props.modelValue;
    delete nodes[1].props.modelValue;
    const code = toVueSfc('选择组件示例', nodes);
    assert(code.includes('<TreeSelect v-model="'));
    assert(code.includes('<BatchMultiSelect v-model="'));
    assert(code.includes(`v-model:expanded-keys="state['${nodes[0].id}:expandedKeys']"`));
    assert(code.includes(`v-model:expanded="state['${nodes[1].id}:expanded']"`));
    assert(code.includes(`'${nodes[0].id}': []`));
    assert.deepEqual(JSON.parse(toJson('选择组件示例', JSON.parse(snapshot))).components, JSON.parse(snapshot));
    const { descriptor, errors } = parse(code);
    assert.deepEqual(errors, []);
    const script = compileScript(descriptor, { id: 'selection-export' });
    const template = compileTemplate({ source: descriptor.template.content, filename: 'Selections.vue', id: 'selection-export', compilerOptions: { bindingMetadata: script.bindings } });
    assert.deepEqual(template.errors, []);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test('字段组件保留属性回显，仅在设置文字插槽时覆盖内容', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-renderer-'));
  const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  try {
    const { default: Renderer } = await server.ssrLoadModule('/src/components/ComponentRenderer.vue');
    const render = (node) => renderToString(createSSRApp(Renderer, { node }).use(PersagyVant));
    const node = { id: 'attachment-field', type: 'label', props: { label: '设备编号', content: 'AHU-B2-018' } };
    const html = await render(node);
    assert.match(html, /设备编号：/);
    assert.match(html, /AHU-B2-018/);
    const overridden = await render({ ...node, content: '用户设置的内容' });
    assert.match(overridden, /用户设置的内容/);
    assert.doesNotMatch(overridden, /AHU-B2-018/);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test('固定导航在手机顶部宿主内渲染普通组件，保留标题与副标题，不改写文档属性', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-fixed-nav-'));
  const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  try {
    const { default: Renderer } = await server.ssrLoadModule('/src/components/ComponentRenderer.vue');
    const node = { id: 'fixed-nav', type: 'nav-bar', props: { title: '创建报事工单', subtitle: '填写报事信息', fixed: true, placeholder: true, safeAreaInsetTop: true, leftArrow: true } };
    const snapshot = JSON.stringify(node);
    const render = (options) => renderToString(createSSRApp(Renderer, { node, ...options }).use(PersagyVant));
    const native = await render({ interactive: true });
    assert.match(native, /van-nav-bar--fixed/);
    assert.match(native, /van-nav-bar__placeholder/);
    const docked = await render({ docked: true, interactive: true });
    assert.match(docked, /创建报事工单/);
    assert.match(docked, /填写报事信息/);
    assert.doesNotMatch(docked, /van-nav-bar--fixed|van-nav-bar__placeholder|van-safe-area-top/);
    assert.doesNotMatch(await render({ thumbnail: true }), /van-nav-bar--fixed/);
    assert.equal(JSON.stringify(node), snapshot);
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});

test('背景使用原生主题并支持公共颜色及布局样式，空背景和嵌套背景均可编辑', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-background-'));
  const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  try {
    const { default: Renderer } = await server.ssrLoadModule('/src/components/ComponentRenderer.vue');
    const render = (node) => renderToString(createSSRApp(Renderer, { node }).use(PersagyVant));
    const node = { id: 'background', type: 'background', props: { theme: 'gray' }, content: '页面内容' };
    const native = await render(node);
    assert.match(native, /van-background--gray/);
    assert.match(native, /页面内容/);
    assert.doesNotMatch(native, /background:transparent/);
    const styled = await render({ ...node, props: { ...node.props, fill: '#eef4ff', gap: 20, paddingLeft: 16, marginTop: 12 } });
    assert.match(styled, /background:#eef4ff/);
    assert.match(styled, /gap:20px/);
    assert.match(styled, /padding-left:16px/);
    assert.match(styled, /margin-top:12px/);
    assert.doesNotMatch(styled, / fill=| gap=| paddingleft=| margintop=/i);
    const { default: Panel } = await server.ssrLoadModule('/src/components/PropertyPanel.vue');
    for (const type of ['background', 'container-group']) {
      const selected = { ...node, type, children: [] };
      const panel = await renderToString(createSSRApp(Panel, { node: selected, nodes: [selected], selection: [selected], canGroup: true, index: 0, total: 1 }).use(PersagyVant));
      assert.equal((panel.match(/class="token-control"/g) || []).length, 11, '颜色、圆角、四向内外边距及间距共用同一套控件');
      assert.match(panel, /组件之间间距/);
      if (type === 'background') assert.doesNotMatch(panel, />解组<|容器图层名称/);
    }
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
