import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-page-generator-'));
const server = await createServer({ configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const generator = await server.ssrLoadModule('/src/utils/pageGenerator.ts');
const tree = await server.ssrLoadModule('/src/utils/nodeTree.ts');
const exports = await server.ssrLoadModule('/src/utils/exportDesign.ts');
await server.close();
await rm(cacheDir, { recursive: true, force: true });

test('先识别页面类型，不把列表里的新建入口或详情里的编辑操作识别成表单', () => {
  assert.equal(generator.inferSkillRecipe('做一个巡检任务列表，包含搜索、任务状态和底部新建入口'), 'list');
  assert.equal(generator.inferSkillRecipe('设备详情页，包含编辑操作'), 'detail');
  assert.equal(generator.inferSkillRecipe('新建工单，包含标题和说明'), 'form');
  assert.throws(() => generator.generatePageFromPrompt('你好'), /明确页面类型/);
  assert.throws(() => generator.generatePageFromPrompt(''), /填写页面需求/);
});

test('构建记录来自真实 Skill，包含正文配方、样式限制与组件文档指纹', () => {
  assert.equal(generator.skillRulebook.name, 'use-persagy-vant');
  assert.equal(generator.skillRecipes.length, 3);
  assert.ok(generator.skillRecipes.every((recipe) => recipe.instructions.length >= 5));
  assert.equal(generator.skillRulebook.searchVariant, 'pure');
  assert.equal(generator.skillRulebook.fieldMaxlength, 200);
  assert.equal(generator.skillRulebook.uploadMaxCount, 9);
  assert.equal(generator.skillRulebook.uploadPreviewSize, 70);
  assert.equal(generator.skillRulebook.trailingSpace, 24);
  assert.match(generator.skillRulebook.fingerprint, /^[0-9a-f]{8}$/);
});

test('列表按 Skill 组合真实背景、刷新、列表与业务卡片，并只保留一个末尾留白', () => {
  const page = generator.generatePageFromPrompt('巡检列表，包含搜索、筛选和新建入口');
  const nodes = tree.flattenNodes(page.nodes);
  for (const type of ['background', 'search', 'pull-refresh', 'list', 'work-order-card', 'work-order-filter', 'bottom-action-bar']) assert.ok(nodes.some((node) => node.type === type), type);
  assert.equal(nodes.find((node) => node.type === 'search').props.variant, 'pure');
  assert.ok(nodes.filter((node) => node.type === 'work-order-card').every((node) => !node.props.actions && !node.props.expandedInfos));
  const spacers = nodes.filter((node) => node.props.name === '页面末尾留白');
  assert.equal(spacers.length, 1);
  assert.equal(tree.getContainerStyle(spacers[0]).paddingTop, '24px');
  assert.ok(!nodes.some((node) => ['popup', 'overlay'].includes(node.type)));
  const trigger = nodes.find((node) => node.actions?.click);
  assert.equal(tree.findNode(page.nodes, trigger.actions.click.targetId).node.type, 'work-order-filter');
});

test('显式配方和标题优先；字段盘点保留用户字段，明确省略搜索会记录差异', () => {
  const detail = generator.generatePageFromPrompt('字段：设备名、编号、状态', { recipeId: 'detail', title: '我的设备' });
  assert.equal(detail.title, '我的设备');
  assert.deepEqual(tree.flattenNodes(detail.nodes).find((node) => node.type === 'info-card').props.fields.map((field) => field.label), ['设备名：', '编号：', '状态：']);
  const list = generator.generatePageFromPrompt('设备列表，不要搜索');
  assert.ok(!tree.flattenNodes(list.nodes).some((node) => node.type === 'search'));
  assert.ok(list.report.warnings.some((warning) => warning.includes('省略搜索')));
});

test('多字段编辑放入 FormPanel，上传和输入约束从 Skill 读取，动态入口引用可用', () => {
  const page = generator.generatePageFromPrompt('新建维修单，包含照片上传');
  const nodes = tree.flattenNodes(page.nodes);
  const panel = nodes.find((node) => node.type === 'form-panel');
  assert.equal(panel.props.show, false);
  assert.equal(panel.children[0].type, 'form');
  for (const field of nodes.filter((node) => node.type === 'field')) {
    assert.equal(field.props.type, 'textarea');
    assert.equal(field.props.labelPosition, 'top');
    assert.equal(field.props.maxlength, 200);
    assert.equal(field.props.showWordLimit, true);
  }
  const uploader = nodes.find((node) => node.type === 'uploader');
  assert.equal(uploader.props.maxCount, 9);
  assert.equal(uploader.props.previewSize, 70);
  assert.equal(uploader.content, undefined);
  assert.equal(nodes.find((node) => node.type === 'bottom-action-bar').props.fixed, true);
  assert.ok(nodes.filter((node) => node.actions).every((node) => Object.values(node.actions).every((action) => tree.findNode(page.nodes, action.targetId))));
});

test('加载、空态、失败、禁用和提交中均有独立配置；无效状态组合明确拒绝', () => {
  for (const state of ['loading', 'empty', 'error']) {
    const page = generator.generatePageFromPrompt('设备详情', { state });
    const nodes = tree.flattenNodes(page.nodes);
    assert.equal(page.report.state, state);
    if (state === 'loading') assert.equal(nodes.find((node) => node.type === 'loading').props.type, 'illustration');
    else assert.equal(nodes.find((node) => node.type === 'empty').props.image, state === 'error' ? 'network' : 'default');
  }
  for (const state of ['disabled', 'submitting']) {
    const nodes = tree.flattenNodes(generator.generatePageFromPrompt('新建工单', { state }).nodes);
    assert.ok(nodes.filter((node) => node.type === 'field').every((node) => node.props.disabled));
    assert.ok(nodes.some((node) => node.type === 'notice-bar' && node.props.text));
  }
  assert.throws(() => generator.generatePageFromPrompt('设备列表', { state: 'submitting' }), /适用于创建/);
});

test('所有已支持配方和状态导出完整嵌套 Vue，源码可以编译；说明保留来源和未接入项', () => {
  for (const [recipeId, prompt] of [['list', '工单列表，带筛选'], ['detail', '设备详情，带进度'], ['form', '创建工单，带上传']]) {
    for (const state of ['ready', 'loading', 'empty', 'error', ...(recipeId === 'form' ? ['disabled', 'submitting'] : [])]) {
      const page = generator.generatePageFromPrompt(prompt, { recipeId, state });
      const code = exports.toVueSfc(page.title, page.nodes);
      const { descriptor, errors } = parse(code);
      assert.deepEqual(errors, []);
      const script = compileScript(descriptor, { id: 'skill-export' });
      const template = compileTemplate({ source: descriptor.template.content, filename: 'Page.vue', id: 'skill-export', compilerOptions: { bindingMetadata: script.bindings } });
      assert.deepEqual(template.errors, [], `${recipeId}/${state}`);
      assert.equal(JSON.parse(exports.toJson(page.title, page.nodes, page.report)).report.fingerprint, page.report.fingerprint);
      const markdown = exports.toMarkdown(page.title, page.nodes, page.report);
      for (const heading of ['Skill 来源', '元素-组件匹配', '组件复用清单', '组件变体选型', '规范落实项', '业务与数据兼容核查', '组件覆盖率']) assert.ok(markdown.includes(heading));
      if (recipeId === 'form' && state === 'ready') {
        assert.ok(code.includes('<FormPanel'));
        assert.ok(code.includes('<Form'));
        assert.ok(code.includes('<Field'));
        assert.ok(code.includes(`state['${tree.flattenNodes(page.nodes).find((node) => node.type === 'form-panel').id}:show'] = true`));
      }
    }
  }
});

test('业务组件默认插槽可编辑排序，复制完整子树会重连其面板入口', () => {
  const page = generator.generatePageFromPrompt('新建工单');
  const root = { id: 'all', type: 'container-group', props: {}, children: page.nodes };
  let id = 0;
  const duplicate = tree.duplicateNodes([root], ['all'], () => `copy-${++id}`);
  const copied = duplicate.nodes[1];
  const copiedNodes = tree.flattenNodes([copied]);
  assert.ok(copiedNodes.filter((node) => node.actions).every((node) => Object.values(node.actions).every((action) => copiedNodes.some((target) => target.id === action.targetId))));
  const background = tree.flattenNodes(page.nodes).find((node) => node.type === 'background');
  assert.ok(tree.canHaveChildren(background));
  const moved = tree.moveNode(page.nodes, page.nodes[0].id, 0, background.id);
  assert.equal(tree.findNode(moved, page.nodes[0].id).parentId, background.id);
});
