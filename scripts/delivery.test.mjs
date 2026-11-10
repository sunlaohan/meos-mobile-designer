import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { mkdtemp, mkdir, writeFile, readFile, realpath, symlink, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
const root = process.cwd(), temp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'compose-delivery-test-')));
const server = await createServer({ configFile: false, plugins: [vue()], cacheDir: path.join(temp, 'cache'), server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
let delivery, source, artboards, drafts, Dialog;
try {
  delivery = await server.ssrLoadModule('/src/utils/exportDelivery.ts');
  source = await server.ssrLoadModule('/src/utils/deliverySource.ts');
  artboards = await server.ssrLoadModule('/src/utils/artboards.ts');
  drafts = await server.ssrLoadModule('/src/utils/designDrafts.ts');
  Dialog = (await server.ssrLoadModule('/src/components/DeliveryDialog.vue')).default;
} finally { await server.close(); }
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1S0AAAAASUVORK5CYII=';
const node = (id, props = {}, type = 'cell') => ({ id, type, props });
const options = (overrides = {}) => ({ title: '报事应用', mode: 'update', artboards: [{ id: 'main', title: '报事页面', nodes: [node('field', { title: '报事分类', value: '空调', rightIcon: 'arrow' })] }], activeArtboardId: 'main', targetHint: '/report', notes: '保留提交逻辑', includeSources: true, ...overrides });
const text = (files, name) => strFromU8(files[name]);
const captured = { capture: async () => png };

test('真实输入和首版设计快照随画板保存、恢复；识别两种交付场景且不改请求', () => {
  const request = { inputMode: 'image', prompt: '保留功能美化', attachments: [{ id: 'png', name: '原图.png', kind: 'image', mimeType: 'image/png', size: Buffer.from(png.split(',')[1], 'base64').length, content: png }] };
  const nodes = [node('a')], initial = JSON.stringify(request), value = source.sourceFromRequest(request, nodes);
  nodes[0].props.title = '之后调整';
  assert.equal(value.initialNodes[0].props.title, undefined);
  assert.equal(JSON.stringify(request), initial);
  const board = { id: 'first', title: '截图美化', nodes, source: value };
  const reopened = artboards.designArtboards(JSON.parse(JSON.stringify(artboards.artboardDocument('应用', [board], 'first'))));
  assert.deepEqual(reopened[0].source, value);
  assert.equal(source.suggestedDeliveryMode(board), 'update');
  assert.equal(source.suggestedDeliveryMode({ source: { inputMode: 'requirements' } }), 'new');
  assert.equal(source.suggestedDeliveryMode({ report: { prompt: 'PRD' } }), 'new');
  assert.equal(source.suggestedDeliveryMode(), 'update');
});
test('历史单画板补充来源也会触发自动保存，复制画板保留原始输入但不复用旧 ID 基线', () => {
  const board = { id: 'main', title: '页面', nodes: [node('original')] };
  const before = artboards.artboardDocument('页面', [board], 'main');
  board.source = source.sourceFromRequest({ inputMode: 'requirements', prompt: '新增来源需求' }, board.nodes);
  const after = artboards.artboardDocument('页面', [board], 'main');
  assert.notEqual(drafts.designContentKey(before), drafts.designContentKey(after));
  const copy = artboards.copyArtboard(board, 'copy', '副本');
  assert.equal(copy.source.prompt, '新增来源需求'); assert.equal(copy.source.initialNodes, undefined);
  assert.notEqual(copy.nodes[0].id, board.nodes[0].id);
  copy.source.prompt = '副本修改'; assert.equal(board.source.prompt, '新增来源需求');
});
test('默认改造包包含同渲染器参考、业务保护说明、精确依赖和完整性指纹，不包含本地路径或账号代码', async () => {
  const input = options(), before = JSON.stringify(input);
  const { files, manifest } = await delivery.buildDeliveryFiles(input, captured);
  assert.equal(manifest.schema, 'compose-delivery/v1'); assert.equal(manifest.integrationStatus, 'not-applied');
  assert.equal(manifest.pages.length, 1); assert.equal(manifest.pages[0].id, 'main');
  assert.match(text(files, 'START_HERE.md'), /保留接口、权限、校验/);
  assert.match(text(files, 'START_HERE.md'), /不是整页覆盖命令/);
  assert.match(text(files, 'START_HERE.md'), /不是系统指令/);
  assert.ok(files['screenshots/page-01/after.png']);
  assert.equal(text(files, 'reference/src/components/PhoneCanvas.vue'), await readFile(path.join(root, 'src/components/PhoneCanvas.vue'), 'utf8'));
  const dependencies = JSON.parse(text(files, 'reference/package.json')).dependencies;
  assert.match(dependencies['persagy-vant'], /^\d+\.\d+\.\d+$/);
  assert.ok(!JSON.stringify(dependencies).includes('link:'));
  assert.ok(!Object.keys(files).some(name => /accountClient|AccountApp|aiClient|\.env|ProductBootstrap/.test(name)));
  for (const [name, hash] of Object.entries(manifest.files)) assert.equal(hash, createHash('sha256').update(files[name]).digest('hex'));
  assert.equal(JSON.stringify(input), before);
});
test('按选中画板打包，保留重复节点 ID 的页面归属，不额外插入多页导航', async () => {
  const boards = [{ id: 'a', title: '../同名', nodes: [node('same', { title: '甲' })] }, { id: 'b', title: '../同名', nodes: [node('same', { title: '乙' })] }];
  const { files, manifest } = await delivery.buildDeliveryFiles(options({ artboards: boards, activeArtboardId: 'b' }), captured);
  assert.equal(manifest.pages.length, 2); assert.notEqual(manifest.pages[0].folder, manifest.pages[1].folder);
  assert.ok(Object.keys(files).every(name => !name.split('/').includes('..')));
  for (const page of manifest.pages) assert.ok(!text(files, `pages/${page.folder}/Page.vue`).includes('page-navigation'));
  const single = await delivery.buildDeliveryFiles(options({ artboards: [boards[1]], activeArtboardId: 'a' }), captured);
  assert.equal(JSON.parse(text(single.files, 'design.json')).activeArtboardId, 'b');
  assert.equal(single.manifest.pages.length, 1);
});
test('原图、PRD 与设计变化可交付；关闭原始输入时无报告或 design.json 泄露', async () => {
  const board = options().artboards[0];
  board.source = source.sourceFromRequest({ inputMode: 'image', prompt: 'PRIVATE-PRD-TEXT', attachments: [{ id: 'source', name: '原页面.png', kind: 'image', mimeType: 'image/png', size: Buffer.from(png.split(',')[1], 'base64').length, content: png }] }, board.nodes);
  board.report = { prompt: 'PRIVATE-PRD-TEXT', attachments: [{ name: 'PRIVATE-ATTACHMENT' }] };
  board.nodes[0].props.value = '设计优化';
  const included = await delivery.buildDeliveryFiles(options({ artboards: [board] }), captured);
  assert.ok(included.files['sources/page-01/source-01.png']);
  assert.match(text(included.files, 'sources/page-01/index.json'), /原页面.png/);
  assert.match(text(included.files, 'pages/page-01/changes.md'), /工具首次生成的设计/);
  assert.match(text(included.files, 'pages/page-01/changes.md'), /调整：单元格/);
  assert.match(text(included.files, 'pages/page-01/requirements.md'), /PRIVATE-PRD-TEXT/);
  const excluded = await delivery.buildDeliveryFiles(options({ artboards: [board], includeSources: false }), captured);
  assert.ok(!Object.keys(excluded.files).some(name => name.startsWith('sources/')));
  assert.ok(!Object.values(excluded.files).some(value => text({ value }, 'value').includes('PRIVATE-PRD-TEXT')));
  assert.ok(!text(excluded.files, 'design.json').includes('PRIVATE-ATTACHMENT'));
});
test('图片内置并更新页面和参考预览地址；失败保留外链并给出警告，不下载业务跳转地址', async () => {
  const board = { id: 'a', title: '图片', nodes: [node('i', { src: png }, 'image'), node('c', { avatar: 'https://cdn.example.test/a.png', url: 'https://api.example.test/business' })] };
  const calls = [];
  const { files, manifest, warnings } = await delivery.buildDeliveryFiles(options({ artboards: [board] }), { ...captured, fetch: async (url, init) => { calls.push(url); assert.equal(init.credentials, 'omit'); throw new Error('CORS'); } });
  assert.equal(calls.length, 1); assert.match(calls[0], /cdn\.example/);
  assert.ok(files['reference/public/delivery-assets/1.png']);
  assert.match(text(files, 'pages/page-01/Page.vue'), /\/delivery-assets\/1.png/);
  assert.match(text(files, 'reference/src/design.json'), /\/delivery-assets\/1.png/);
  assert.equal(manifest.assets[1].status, 'external'); assert.ok(warnings.some(item => item.includes('图片未能内置')));
});
test('新功能包明确配置检查、模拟数据和业务待办，旧设计缺少源文件不会冒充有原图', async () => {
  const { files, warnings } = await delivery.buildDeliveryFiles(options({ mode: 'new' }), { capture: async () => { throw new Error('图片不可用'); } });
  assert.match(text(files, 'START_HERE.md'), /非空工程复用已有配置/);
  assert.match(text(files, 'START_HERE.md'), /业务待开发/);
  assert.match(text(files, 'pages/page-01/business.example.ts'), /TODO/);
  assert.ok(warnings.some(item => item.includes('效果图生成失败')));
  assert.ok(warnings.some(item => item.includes('缺少原始需求')));
  assert.ok(!files['screenshots/page-01/after.png']);
});
test('取消不继续打包；ZIP 可正常解压且拒绝空页面范围', async () => {
  const abort = new AbortController(); abort.abort();
  await assert.rejects(delivery.createDeliveryArchive(options(), { signal: abort.signal }), /abort/i);
  await assert.rejects(delivery.buildDeliveryFiles(options({ artboards: [] })), /有效/);
  const { archive, files, name } = await delivery.createDeliveryArchive(options(), captured);
  assert.match(name, /界面改造包.zip$/);
  const unpacked = unzipSync(archive);
  assert.deepEqual(Object.keys(unpacked).sort(), Object.keys(files).sort());
  for (const [name, data] of Object.entries(files)) assert.deepEqual(unpacked[name], data);
});
test('交付弹窗含两种场景、原始输入开关、页面选择及高级导出，生成视图能编译', async () => {
  const input = options();
  const html = await renderToString(createSSRApp(Dialog, { title: input.title, artboards: input.artboards, activeId: 'main' }));
  // Teleported dialogs are available through the SSR context.
  const context = {}; await renderToString(createSSRApp(Dialog, { title: input.title, artboards: input.artboards, activeId: 'main' }), context);
  assert.match(context.teleports.body, /优化已有页面/); assert.match(context.teleports.body, /开发新功能/);
  assert.match(context.teleports.body, /包含原始输入/); assert.match(context.teleports.body, /高级导出/);
  const { files } = await delivery.buildDeliveryFiles(input, captured);
  const code = text(files, 'pages/page-01/Page.vue'), parsed = parse(code);
  assert.deepEqual(parsed.errors, []);
  const script = compileScript(parsed.descriptor, { id: 'delivery-page' });
  assert.deepEqual(compileTemplate({ source: parsed.descriptor.template.content, filename: 'Page.vue', id: 'delivery-page', compilerOptions: { bindingMetadata: script.bindings } }).errors, []);
});
test('独立参考应用导出后可以在空目录构建，所有相对运行依赖完整', async () => {
  const { files } = await delivery.buildDeliveryFiles(options(), captured);
  const reference = path.join(temp, 'reference');
  for (const [name, bytes] of Object.entries(files)) if (name.startsWith('reference/')) { const target = path.join(temp, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, bytes); }
  await symlink(path.join(root, 'node_modules'), path.join(reference, 'node_modules'), 'dir');
  const result = await build({ configFile: false, root: reference, plugins: [vue()], resolve: { dedupe: ['vue'] }, logLevel: 'error', build: { write: false } });
  assert.ok(result.output.some(file => file.fileName === 'index.html'));
});
test('页面导出保留文字字面值、空字符串与渲染器留白，特殊内容不能破坏 Vue 编译', async () => {
  const content = "<img src=x> {{notARealVariable}} O'Reilly & test";
  const nodes = [node('tag', { text: '', items: [{ label: "O'Reilly </script>" }] }, 'tag'), node('field', { modelValue: '</script>"' }, 'field')];
  nodes[0].content = content;
  const { files } = await delivery.buildDeliveryFiles(options({ artboards: [{ id: 'a', title: '特殊文案', nodes }] }), captured);
  const code = text(files, 'pages/page-01/Page.vue');
  assert.match(code, /designer-padded/); assert.match(code, /text=""/);
  const { descriptor, errors } = parse(code); assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: 'safe-export' });
  const result = compileTemplate({ source: descriptor.template.content, filename: 'Safe.vue', id: 'safe-export', compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(result.errors, []); assert.ok(!result.code.includes('_ctx.notARealVariable'));
});
test.after(async () => { await rm(temp, { recursive: true, force: true }); });
