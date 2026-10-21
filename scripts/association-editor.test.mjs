import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSSRApp } from 'vue';
import PersagyVant from 'persagy-vant';
import { renderToString } from 'vue/server-renderer';

test('关联编辑器使用统一的可点击拖拽区域，移除旧关联选择器并回显当前控件', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-association-editor-'));
  const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  try {
    const { default: Editor } = await server.ssrLoadModule('/src/components/InteractionEditor.vue');
    const source = { id: 'trigger', type: 'cell', props: { title: '报事位置' } };
    const panel = { id: 'location', type: 'location-select', props: { title: '选择报事位置', show: false } };
    const html = await renderToString(createSSRApp(Editor, { node: source, nodes: [source, panel] }));
    assert.match(html, /aria-label="选择关联控件"/);
    assert.match(html, /data-panel-trigger="trigger"/);
    assert.match(html, /点击选择或拖入关联控件/);
    assert.doesNotMatch(html, /aria-label="关联组件"|新建并关联|打开面板 · 关联组件/);
    assert.equal((html.match(/<select/g) || []).length, 1);
    const bound = { ...source, actions: { click: { type: 'open-panel', targetId: panel.id } } };
    const current = await renderToString(createSSRApp(Editor, { node: bound, nodes: [bound, panel] }));
    assert.match(current, /aria-label="更换关联控件"/);
    assert.doesNotMatch(current, /已关联/);
    assert.match(current, /位置单选/);
    assert.doesNotMatch(current, /选择报事位置/);
    assert.match(current, /aria-label="删除关联控件"/);
    assert.match(current, /title="删除关联控件及对应图层（可撤销）"/);
    assert.doesNotMatch(current, /保留画板中的控件/);
    assert.match(current, /aria-label="编辑关联组件"/);
    assert.doesNotMatch(current, /配置控件|interaction-target-actions/);
    assert.equal((current.match(/<button/g) || []).length, 3);
    assert.match(current, /点击更换，或拖入控件替换/);
    const unavailable = await renderToString(createSSRApp(Editor, { node: bound, nodes: [bound] }));
    assert.match(unavailable, /title="清除失效关联"/);
  } finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }); }
});

test('关联控件列表完整列出运行时支持的类型，可复用已有实例并标记当前关联', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-association-picker-'));
  const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  try {
    const { default: Picker } = await server.ssrLoadModule('/src/components/AssociationPicker.vue');
    const { canvasPanelTypes } = await server.ssrLoadModule('/src/utils/canvasPresentation.ts');
    const { getDefinition } = await server.ssrLoadModule('/src/data/componentCatalog.ts');
    const context = {};
    await renderToString(createSSRApp(Picker, { targets: [{ id: 'existing-radio', type: 'radio-panel', props: { title: '选择报事分类' } }], currentId: 'existing-radio' }), context);
    const html = context.teleports.body;
    assert.match(html, /role="dialog" aria-modal="true"/);
    assert.match(html, /搜索关联控件/);
    assert.equal((html.match(/class="association-type-option"/g) || []).length, canvasPanelTypes.length);
    for (const type of canvasPanelTypes) assert(html.includes(`添加并关联${getDefinition(type).name}`));
    assert.match(html, /使用已有控件/);
    assert.match(html, /选择报事分类/);
    assert.match(html, /data-association-target="existing-radio" aria-pressed="true"/);
    assert.match(html, /删除关联控件会同步删除对应图层，可撤销恢复/);
    assert.doesNotMatch(html, /添加并关联按钮/);
  } finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }); }
});

test('关联清单覆盖当前组件库所有具有 show 接口的独立控件，普通标签不作为弹层', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-association-coverage-'));
  const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  try {
    const { componentCatalog, createNode } = await server.ssrLoadModule('/src/data/componentCatalog.ts');
    const { canvasPanelTypes, panelSlotTypes } = await import('../shared/association-controls.mjs');
    const { bindPanel } = await server.ssrLoadModule('/src/utils/panelInteractions.ts');
    const { canvasPresentation } = await server.ssrLoadModule('/src/utils/canvasPresentation.ts');
    const app = createSSRApp({}); app.use(PersagyVant);
    const available = componentCatalog.filter(({ type }) => type !== 'tag' && app.component(`van-${type}`)?.props?.show !== undefined).map(({ type }) => type);
    assert.deepEqual([...canvasPanelTypes].sort(), available.sort());
    assert.equal(canvasPanelTypes.length, 25);
    const nodes = [createNode('cell'), ...canvasPanelTypes.map((type) => createNode(type))];
    for (const panel of nodes.slice(1)) {
      assert.equal(panel.props.show, false, panel.type);
      const linked = bindPanel(nodes, nodes[0].id, 'click', panel.id);
      assert.equal(linked[0].actions.click.targetId, panel.id, panel.type);
      assert.equal(linked.find(({ id }) => id === panel.id).props.show, false);
    }
    const view = canvasPresentation(nodes);
    assert.equal(view.panels.length, canvasPanelTypes.length);
    assert.equal(view.flow.length, 1);
    for (const type of panelSlotTypes) assert(componentCatalog.find((item) => item.type === type));
  } finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }); }
});
