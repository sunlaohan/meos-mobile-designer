import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'compose-artboards-'));
const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const { designArtboards, artboardDocument, copyArtboard } = await server.ssrLoadModule('/src/utils/artboards.ts');
const { designContentKey } = await server.ssrLoadModule('/src/utils/designDrafts.ts');
const { toJson, toMarkdown, toVueSfc } = await server.ssrLoadModule('/src/utils/exportDesign.ts');
const { readBuildAttachment } = await server.ssrLoadModule('/src/utils/buildAttachments.ts');
const { default: Switcher } = await server.ssrLoadModule('/src/components/ArtboardSwitcher.vue');
await server.close(); await rm(cacheDir, { recursive: true, force: true });
const node = (id, type = 'cell', props = {}, extra = {}) => ({ id, type, props, ...extra });
const boards = () => [
  { id: 'list', title: '设备列表', nodes: [node('nav', 'nav-bar', { title: '设备列表' }), node('field', 'field', { label: '设备名称', modelValue: '' })] },
  { id: 'detail', title: '设备详情', nodes: [node('nav', 'nav-bar', { title: '设备详情' }), node('field', 'field', { label: '详情名称', modelValue: '冷机' })] },
];

test('旧文档成为一个稳定画板，所有页面与活动页面可完整保存和重新打开', () => {
  const legacy = { title: '旧页面', nodes: [node('legacy')] };
  const old = designArtboards(legacy);
  assert.equal(old[0].id, designArtboards(legacy)[0].id);
  assert.deepEqual(old[0].nodes, legacy.nodes);
  assert.equal(designContentKey(legacy), designContentKey(artboardDocument(legacy.title, old, old[0].id)));
  const doc = artboardDocument('设备管理', boards(), 'detail');
  assert.equal(doc.nodes[0].props.title, '设备详情');
  assert.deepEqual(designArtboards(JSON.parse(JSON.stringify(doc))), boards());
  doc.artboards[1].nodes[0].props.title = '改名';
  assert.equal(boards()[1].nodes[0].props.title, '设备详情');
  assert.throws(() => designArtboards({ ...legacy, artboards: [] }), /无效/);
  assert.throws(() => designArtboards({ ...legacy, artboards: [boards()[0], boards()[0]] }), /无效/);
});

test('切换画板不制造内容冲突，非当前页修改仍被内容比较识别', () => {
  const list = artboardDocument('设备管理', boards(), 'list');
  const detail = artboardDocument('设备管理', boards(), 'detail');
  assert.equal(designContentKey(list), designContentKey(detail));
  detail.artboards[0].nodes[0].props.title = '非当前页变更';
  assert.notEqual(designContentKey(list), designContentKey(detail));
});

test('复制画板重建所有嵌套 ID 和面板关系，原画板不受影响', () => {
  const original = { id: 'a', title: '分类', nodes: [node('group', 'container-group', {}, { children: [node('trigger', 'cell', { title: '分类' }, { actions: { click: { type: 'open-panel', targetId: 'panel' } } })] }), node('panel', 'radio-panel', { show: false })] };
  const copy = copyArtboard(original, 'b', '分类副本');
  assert.equal(copy.nodes.length, 2);
  const trigger = copy.nodes[0].children[0], panel = copy.nodes[1];
  assert.notEqual(trigger.id, 'trigger'); assert.notEqual(panel.id, 'panel');
  assert.equal(trigger.actions.click.targetId, panel.id);
  trigger.props.title = '改变';
  assert.equal(original.nodes[0].children[0].props.title, '分类');
});

test('多画板 JSON、Markdown 和 Vue 导出保留全部页面，重复节点 ID 的状态独立', () => {
  const doc = artboardDocument('设备管理', boards(), 'detail');
  const json = JSON.parse(toJson(doc.title, doc.nodes, doc.report, doc.artboards, doc.activeArtboardId));
  assert.deepEqual(json.artboards, doc.artboards); assert.equal(json.activeArtboardId, 'detail');
  const markdown = toMarkdown(doc.title, doc.nodes, undefined, doc.artboards);
  assert.match(markdown, /## 设备列表/); assert.match(markdown, /## 设备详情/);
  const code = toVueSfc(doc.title, doc.nodes, doc.artboards, 'detail');
  assert.match(code, /const activeArtboard = ref\(1\)/);
  assert.match(code, /state\['page0-field'\]/); assert.match(code, /state\['page1-field'\]/);
  const { descriptor, errors } = parse(code);
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: 'multi-page-export' });
  const compiled = compileTemplate({ source: descriptor.template.content, filename: 'MultiPage.vue', id: 'multi-page-export', compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(compiled.errors, []);
  assert.ok(!toVueSfc('单页', doc.nodes).includes('page-navigation'));
});

test('仅多画板显示页面切换，单画板保留标题与添加操作', async () => {
  const single = await renderToString(createSSRApp(Switcher, { artboards: boards().slice(0, 1), activeId: 'list' }));
  assert.ok(!single.includes('<select')); assert.match(single, /新增画板/); assert.match(single, /设备列表/);
  const multi = await renderToString(createSSRApp(Switcher, { artboards: boards(), activeId: 'detail' }));
  assert.match(multi, /切换画板/); assert.match(multi, /2\/2/);
  const preview = await renderToString(createSSRApp(Switcher, { artboards: boards(), activeId: 'list', preview: true }));
  assert.match(preview, /切换画板/); assert.ok(!preview.includes('新增画板'));
});

test('统一文档读取支持 Markdown 与代码，保留纯文本和真实 UTF-8 大小', async () => {
  for (const [name, content] of [['需求.MD', '# 页面需求\n\n## 列表页\n<script>不执行</script>'], ['参考.vue', '<template>设备列表</template>']]) {
    const bytes = new TextEncoder().encode(content);
    const attachment = await readBuildAttachment({ name, type: 'text/plain', size: bytes.length, arrayBuffer: async () => bytes.buffer });
    assert.equal(attachment.kind, 'code'); assert.equal(attachment.content, content); assert.equal(attachment.size, bytes.length);
  }
  await assert.rejects(readBuildAttachment({ name: 'bad.md', type: 'text/markdown', size: 1, arrayBuffer: async () => new Uint8Array([0xff]).buffer }), /UTF-8/);
});
