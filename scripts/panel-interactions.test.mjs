import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-interactions-'));
const server = await createServer({ configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const interactions = await server.ssrLoadModule('/src/utils/panelInteractions.ts');
const tree = await server.ssrLoadModule('/src/utils/nodeTree.ts');
const presentation = await server.ssrLoadModule('/src/utils/canvasPresentation.ts');
const exports = await server.ssrLoadModule('/src/utils/exportDesign.ts');
const editing = await server.ssrLoadModule('/src/utils/associatedPanelEditing.ts');
await server.close();
await rm(cacheDir, { recursive: true, force: true });

const node = (id, type, props = {}, children) => ({ id, type, props, ...(children ? { children } : {}) });
const fixture = () => [node('background', 'background', {}, [node('cell', 'cell', { title: '报事位置' })]), node('location', 'location-select', { show: false }), node('radio', 'radio-panel', { show: false, title: '选择分类' })];

test('关联编辑仅记录返回入口，不改变面板默认显示和文档内容；编辑子图层仍属于当前会话', () => {
  const nodes = interactions.bindPanel([node('source', 'cell'), node('panel', 'content-panel', { show: false }, [node('field', 'field')])], 'source', 'click', 'panel');
  const snapshot = JSON.stringify(nodes);
  const edit = editing.associatedPanelEdit(nodes, 'source', 'click');
  assert.deepEqual(edit, { sourceId: 'source', event: 'click', targetId: 'panel' });
  assert(editing.validPanelEdit(nodes, edit));
  assert(editing.selectionInPanelEdit(nodes, edit, ['panel']));
  assert(editing.selectionInPanelEdit(nodes, edit, ['field']));
  assert(editing.selectionInPanelEdit(nodes, edit, ['panel', 'field']));
  assert.equal(editing.selectionInPanelEdit(nodes, edit, ['source']), false);
  assert.equal(editing.selectionInPanelEdit(nodes, edit, []), false);
  assert.equal(editing.associatedPanelEdit(nodes, 'source', 'other'), null);
  assert.equal(JSON.stringify(nodes), snapshot);
});

test('编辑期间删除或更换关联会使会话失效；嵌套编辑保留各级返回触发器', () => {
  let nodes = [node('source', 'cell'), node('panel', 'form-panel', { show: false }, [node('child-trigger', 'button')]), node('child-panel', 'radio-panel', { show: false })];
  nodes = interactions.bindPanel(nodes, 'source', 'click', 'panel');
  nodes = interactions.bindPanel(nodes, 'child-trigger', 'click', 'child-panel');
  const parent = editing.associatedPanelEdit(nodes, 'source', 'click');
  const child = editing.associatedPanelEdit(nodes, 'child-trigger', 'click');
  assert.equal(child.sourceId, 'child-trigger');
  assert(editing.selectionInPanelEdit(nodes, parent, [child.sourceId]));
  assert.equal(editing.validPanelEdit(tree.removeNodes(nodes, ['child-panel']), child), false);
  assert.equal(editing.validPanelEdit(interactions.bindPanel(nodes, 'source', 'click', 'child-panel'), parent), false);
  assert.equal(editing.validPanelEdit(tree.removeNodes(nodes, ['source']), parent), false);
});

test('选择已存在的面板并切换关联，只改变触发器的指定事件', () => {
  const original = fixture();
  const first = interactions.bindPanel(original, 'cell', 'click', 'location');
  assert.equal(tree.findNode(first, 'cell').node.actions.click.targetId, 'location');
  const changed = interactions.bindPanel(first, 'cell', 'click', 'radio');
  assert.equal(tree.findNode(changed, 'cell').node.actions.click.targetId, 'radio');
  assert.equal(tree.findNode(changed, 'radio').node.props.show, false);
  assert.equal(tree.findNode(original, 'cell').node.actions, undefined);
  assert.deepEqual(interactions.panelTargets(original, tree.findNode(original, 'cell').node).map((item) => item.id), ['location', 'radio']);
});

test('拖入创建与关联为一次原子变更，撤销快照不受影响，解除关联保留面板', () => {
  const before = fixture();
  const next = interactions.bindPanel(before, 'cell', 'click', 'new-panel', node('new-panel', 'form-panel', { show: true, title: '编辑信息' }, [node('field', 'field', { label: '名称' })]));
  assert.equal(tree.findNode(next, 'new-panel').node.props.show, false);
  assert.equal(tree.findNode(next, 'cell').node.actions.click.targetId, 'new-panel');
  assert.equal(tree.findNode(before, 'new-panel'), null);
  const removed = interactions.bindPanel(next, 'cell', 'click', '');
  assert.equal(tree.findNode(removed, 'cell').node.actions, undefined);
  assert.equal(tree.findNode(removed, 'new-panel').node.children[0].id, 'field');
});

test('拖入新控件替换关联时保留旧实例；不支持的拖入不会影响当前关联和属性', () => {
  const before = interactions.bindPanel(fixture(), 'cell', 'click', 'location');
  const replaced = interactions.bindPanel(before, 'cell', 'click', 'new-radio', node('new-radio', 'radio-panel', { title: '新分类', show: true }));
  assert.equal(tree.findNode(replaced, 'cell').node.actions.click.targetId, 'new-radio');
  assert.equal(tree.findNode(replaced, 'location').node.props.show, false);
  assert.equal(tree.findNode(replaced, 'new-radio').node.props.show, false);
  const snapshot = JSON.stringify(replaced);
  assert.equal(interactions.bindPanel(replaced, 'cell', 'click', 'ordinary', node('ordinary', 'button')), null);
  assert.equal(interactions.bindPanel(replaced, 'cell', 'click', 'background'), null);
  assert.equal(JSON.stringify(replaced), snapshot);
  const cleared = interactions.bindPanel(replaced, 'cell', 'click', '');
  assert.equal(tree.findNode(cleared, 'cell').node.actions, undefined);
  assert.equal(tree.findNode(cleared, 'new-radio').node.props.title, '新分类');
  assert.equal(tree.findNode(before, 'cell').node.actions.click.targetId, 'location');
});

test('拒绝不可触发组件、不支持事件、缺失面板、普通组件和自身面板循环', () => {
  const original = fixture();
  for (const args of [['cell', 'search', 'radio'], ['cell', 'click', 'missing'], ['cell', 'click', 'background'], ['background', 'click', 'radio']]) {
    assert.equal(interactions.bindPanel(original, ...args), null);
  }
  assert.equal(interactions.bindPanel(original, 'cell', 'click', 'x', node('x', 'button')), null);
  assert.equal(interactions.bindPanel(original, 'cell', 'click', 'radio', node('radio', 'radio-panel')), null);
  const nested = [node('form-panel', 'form-panel', {}, [node('cell', 'cell')])];
  assert.equal(interactions.bindPanel(nested, 'cell', 'click', 'form-panel'), null);
});

test('删除关联控件同步删除根图层，不删除触发器或未关联组件，原文档可完整恢复', () => {
  const before = interactions.bindPanel(fixture(), 'cell', 'click', 'radio');
  const snapshot = JSON.stringify(before);
  const next = interactions.removeAssociatedPanel(before, 'cell', 'click');
  assert.equal(tree.findNode(next, 'radio'), null);
  assert.equal(tree.findNode(next, 'cell').node.actions, undefined);
  assert(tree.findNode(next, 'location'));
  assert.deepEqual(tree.flattenNodes(next).map(({ id }) => id), ['background', 'cell', 'location']);
  assert.equal(JSON.stringify(before), snapshot);
  const restored = tree.cloneNodes(before);
  assert.equal(tree.findNode(restored, 'cell').node.actions.click.targetId, 'radio');
  assert.deepEqual(interactions.removeAssociatedPanel(restored, 'cell', 'click'), next);
});

test('删除嵌套关联面板及子图层，清理全部共享引用，保留其他事件和兄弟图层', () => {
  let before = [node('source', 'bottom-action-bar'), node('other', 'cell'), node('descendant-source', 'button'),
    node('group', 'container-group', {}, [node('panel', 'content-panel', { show: false }, [node('nested', 'radio-panel', { show: false })]), node('sibling', 'field')]),
    node('keep', 'location-select', { show: false })];
  before = interactions.bindPanel(before, 'source', 'confirm', 'panel');
  before = interactions.bindPanel(before, 'source', 'secondary', 'keep');
  before = interactions.bindPanel(before, 'other', 'click', 'panel');
  before = interactions.bindPanel(before, 'descendant-source', 'click', 'nested');
  const snapshot = JSON.stringify(before);
  const next = interactions.removeAssociatedPanel(before, 'source', 'confirm');
  assert.equal(tree.findNode(next, 'panel'), null);
  assert.equal(tree.findNode(next, 'nested'), null);
  assert.deepEqual(tree.findNode(next, 'group').node.children.map(({ id }) => id), ['sibling']);
  assert.deepEqual(tree.findNode(next, 'source').node.actions, { secondary: { type: 'open-panel', targetId: 'keep' } });
  assert.equal(tree.findNode(next, 'other').node.actions, undefined);
  assert.equal(tree.findNode(next, 'descendant-source').node.actions, undefined);
  assert.equal(JSON.stringify(before), snapshot);
});

test('删除失效关联仅清除绑定，不误删普通图层或包含触发器的祖先', () => {
  for (const targetId of ['missing', 'ordinary', 'ancestor']) {
    const before = [node('ancestor', 'form-panel', { show: false }, [node('source', 'cell')]), node('ordinary', 'button')];
    tree.findNode(before, 'source').node.actions = { click: { type: 'open-panel', targetId } };
    const snapshot = JSON.stringify(before);
    const next = interactions.removeAssociatedPanel(before, 'source', 'click');
    assert.deepEqual(tree.flattenNodes(next).map(({ id }) => id), ['ancestor', 'source', 'ordinary']);
    assert.equal(tree.findNode(next, 'source').node.actions, undefined);
    assert.equal(JSON.stringify(before), snapshot);
  }
});

test('缺失触发器、无关联或不支持的事件不会产生删除变更', () => {
  const before = interactions.bindPanel(fixture(), 'cell', 'click', 'radio');
  const snapshot = JSON.stringify(before);
  assert.equal(interactions.removeAssociatedPanel(before, 'missing', 'click'), null);
  assert.equal(interactions.removeAssociatedPanel(before, 'cell', 'search'), null);
  assert.equal(interactions.removeAssociatedPanel(fixture(), 'cell', 'click'), null);
  assert.equal(JSON.stringify(before), snapshot);
});

test('动作栏不同按钮可分别关联，删除面板自动清除失效关联，复制整组重连副本', () => {
  let nodes = [...fixture(), node('bar', 'bottom-action-bar')];
  nodes = interactions.bindPanel(nodes, 'bar', 'confirm', 'location');
  nodes = interactions.bindPanel(nodes, 'bar', 'secondary', 'radio');
  const removed = tree.removeNodes(nodes, ['location']);
  assert.equal(tree.findNode(removed, 'bar').node.actions.confirm, undefined);
  assert.equal(tree.findNode(removed, 'bar').node.actions.secondary.targetId, 'radio');
  assert.equal(tree.findNode(nodes, 'bar').node.actions.confirm.targetId, 'location');
  const grouped = [node('group', 'container-group', {}, nodes)];
  let count = 0;
  const copied = tree.duplicateNodes(grouped, ['group'], () => `copied-${++count}`);
  const newNodes = tree.findNode(copied.nodes, copied.selectedIds[0]).node.children;
  assert.equal(newNodes.find((item) => item.type === 'bottom-action-bar').actions.confirm.targetId, newNodes.find((item) => item.type === 'location-select').id);
});

test('展示层提取固定动作栏和关闭的弹层，保留原始索引、父级、插槽及文档', () => {
  const original = fixture();
  original[0].children.push(node('bar', 'bottom-action-bar', { fixed: true }));
  original.push(node('inline', 'bottom-action-bar', { fixed: false }));
  original.push(node('form-panel', 'form-panel', { show: false }, [node('field', 'field')]));
  const snapshot = JSON.stringify(original);
  const view = presentation.canvasPresentation(original);
  assert.deepEqual(view.flow.map((item) => item.id), ['background', 'inline']);
  assert.deepEqual(view.flow[0].children.map((item) => item.id), ['cell']);
  assert.equal(view.fixed[0].parentId, 'background');
  assert.equal(view.fixed[0].index, 1);
  assert.equal(view.panels.find((item) => item.node.id === 'form-panel').node.children[0].id, 'field');
  assert.equal(presentation.panelForSelection(original, 'field'), 'form-panel');
  assert.equal(presentation.panelForSelection(original, 'cell'), '');
  assert.equal(JSON.stringify(original), snapshot);
  assert(presentation.isFixedCanvasNode(node('default', 'bottom-action-bar')));
});

test('嵌套面板独立进入展示层，保留面板内的操作栏及原始文档结构', () => {
  const original = [node('outer', 'form-panel', { show: true }, [
    node('trigger', 'cell'),
    node('bar', 'bottom-action-bar', { fixed: true }),
    node('inner', 'radio-panel', { show: false }),
  ])];
  const snapshot = JSON.stringify(original);
  const view = presentation.canvasPresentation(original);
  assert.deepEqual(view.panels.map(({ node, parentId }) => [node.id, parentId]), [['outer', null], ['inner', 'outer']]);
  assert.deepEqual(view.panels[0].node.children.map((node) => node.id), ['trigger', 'bar']);
  assert.equal(view.fixed.length, 0);
  assert.equal(JSON.stringify(original), snapshot);
});

test('第二层面板不被先打开的面板挡住，关闭后恢复父面板，属性修改不重排层级', () => {
  let stack = presentation.reconcilePanelStack([], ['parent']);
  stack = presentation.reconcilePanelStack(stack, ['child', 'parent']);
  assert.deepEqual(stack, ['parent', 'child']);
  assert.deepEqual(presentation.reconcilePanelStack(stack, ['child', 'parent']), ['parent', 'child']);
  stack = presentation.reconcilePanelStack(stack, ['parent']);
  assert.deepEqual(stack, ['parent']);
  assert.deepEqual(presentation.reconcilePanelStack(stack, []), []);
});

test('固定导航栏进入顶部层，普通导航保留在文档流；嵌套父级和占位开关不被改写', () => {
  const original = [node('group', 'container-group', {}, [
    node('nav-fixed', 'nav-bar', { fixed: true, placeholder: false, title: '固定标题', safeAreaInsetTop: true }),
    node('nav-placeholder', 'nav-bar', { fixed: true, placeholder: true, title: '占位标题' }),
    node('nav-inline', 'nav-bar', { fixed: false, title: '普通标题' }),
    node('field', 'field', { label: '名称' }),
  ]), node('bar', 'bottom-action-bar', { fixed: true })];
  const snapshot = JSON.stringify(original);
  const view = presentation.canvasPresentation(original);
  assert.deepEqual(view.topFixed.map((item) => [item.node.id, item.parentId, item.index]), [['nav-fixed', 'group', 0], ['nav-placeholder', 'group', 1]]);
  assert.deepEqual(view.flow[0].children.map((item) => item.id), ['nav-placeholder', 'nav-inline', 'field']);
  assert.deepEqual(view.fixed.map((item) => item.node.id), ['bar']);
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(presentation.isTopFixedCanvasNode(node('default-nav', 'nav-bar')), false);
  const code = exports.toVueSfc('固定导航页面', original);
  assert(code.includes('fixed :placeholder="false" title="固定标题" safe-area-inset-top'));
  assert(code.includes('fixed placeholder title="占位标题"'));
  assert.deepEqual(JSON.parse(exports.toJson('固定导航页面', original)).components, original);
});

test('JSON 和可编译的 Vue 导出保留事件关联及默认收起状态', () => {
  const original = [node('button', 'button', { text: '编辑' }), node('panel', 'form-panel', { title: '编辑信息' }, [node('field', 'field', { label: '名称', modelValue: '' })])];
  const linked = interactions.bindPanel(original, 'button', 'click', 'panel');
  assert.deepEqual(JSON.parse(exports.toJson('交互页面', linked)).components, linked);
  const code = exports.toVueSfc('交互页面', linked);
  assert(code.includes('@click="state[\'panel:show\'] = true"'));
  assert(code.includes("'panel:show': false"));
  assert(code.includes('v-model:show="state[\'panel:show\']"'));
  const { descriptor, errors } = parse(code);
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: 'interactive-export' });
  const template = compileTemplate({ source: descriptor.template.content, filename: 'Export.vue', id: 'interactive-export', compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, []);
});

test('全量关联控件的导出使用真实 Vue 组件，保留关闭事件及插槽结构', async () => {
  const { associationControls } = await import('../shared/association-controls.mjs');
  const nodes = [node('trigger', 'cell', { title: '打开' }), ...associationControls.map(({ type, slot }) => node(type, type, { show: false }, slot ? [node(`${type}-child`, 'field', { label: '内容' })] : undefined))];
  nodes[0].actions = { click: { type: 'open-panel', targetId: 'popover' } };
  const code = exports.toVueSfc('全量关联', nodes);
  for (const { type } of associationControls) assert(code.includes(`v-model:show="state['${type}:show']"`), type);
  assert(code.includes('Dialog as DialogApi'));
  assert(code.includes('const Dialog = DialogApi.Component'));
  assert(code.includes("import Toast from 'persagy-vant/lib/toast/Toast'"));
  assert(code.includes('@blur="state[\'number-keyboard:show\'] = false"'));
  assert(code.includes("openAssociatedControl('popover', 'trigger')"));
  assert(code.includes('data-association-source="trigger"'));
  assert(code.includes('<template #reference>'));
  assert(code.includes("watch(() => state['notify:show']"));
  const { descriptor, errors } = parse(code);
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: 'all-control-export' });
  const template = compileTemplate({ source: descriptor.template.content, filename: 'AllControls.vue', id: 'all-control-export', compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, []);
  for (const { type, slot } of associationControls) assert.equal(tree.canHaveChildren(node(type, type)), !!slot, type);
});
