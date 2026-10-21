import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-layer-selection-'));
const server = await createServer({ configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const { selectLayerInterval: select } = await server.ssrLoadModule('/src/utils/layerSelection.ts');
const { flattenLayers } = await server.ssrLoadModule('/src/utils/layerDrop.ts');
const tree = await server.ssrLoadModule('/src/utils/nodeTree.ts');
await server.close();
await rm(cacheDir, { recursive: true, force: true });
const node = (id, children) => ({ id, type: children ? 'container-group' : 'cell', props: {}, ...(children ? { children } : {}) });
const flat = ['a', 'b', 'c', 'd', 'e'].map((id) => node(id));
const ids = (nodes, collapsed = new Set()) => flattenLayers(nodes, collapsed).map(({ node }) => node.id);

test('单击建立起点，Shift 选择首尾之间所有图层，正向与反向相同', () => {
  const first = select(flat, ids(flat), [], '', 'b');
  assert.deepEqual(first, { selectedIds: ['b'], anchorId: 'b' });
  assert.deepEqual(select(flat, ids(flat), first.selectedIds, first.anchorId, 'e', { shift: true }), { selectedIds: ['b', 'c', 'd', 'e'], anchorId: 'b' });
  assert.deepEqual(select(flat, ids(flat), ['e'], 'e', 'b', { shift: true }), { selectedIds: ['b', 'c', 'd', 'e'], anchorId: 'e' });
});

test('连续 Shift 扩展、缩小、跨过原始起点，起点保持不变', () => {
  let result = select(flat, ids(flat), ['c'], 'c', 'e', { shift: true });
  result = select(flat, ids(flat), result.selectedIds, result.anchorId, 'd', { shift: true });
  assert.deepEqual(result, { selectedIds: ['c', 'd'], anchorId: 'c' });
  result = select(flat, ids(flat), result.selectedIds, result.anchorId, 'a', { shift: true });
  assert.deepEqual(result, { selectedIds: ['a', 'b', 'c'], anchorId: 'c' });
});

test('⌘/Ctrl 逐个加选和取消，Shift 追加范围不丢失原选择，普通单击重新建立起点', () => {
  let result = select(flat, ids(flat), ['a'], 'a', 'c', { toggle: true });
  assert.deepEqual(result, { selectedIds: ['a', 'c'], anchorId: 'c' });
  result = select(flat, ids(flat), result.selectedIds, result.anchorId, 'e', { shift: true, toggle: true });
  assert.deepEqual(result.selectedIds, ['a', 'c', 'd', 'e']);
  result = select(flat, ids(flat), result.selectedIds, result.anchorId, 'd', { toggle: true });
  assert.deepEqual(result.selectedIds, ['a', 'c', 'e']);
  assert.deepEqual(select(flat, ids(flat), result.selectedIds, result.anchorId, 'b'), { selectedIds: ['b'], anchorId: 'b' });
});

test('嵌套范围遵循可见顺序，不重复选择父子；折叠组的隐藏子图层不单独加入', () => {
  const nodes = [node('a'), node('group', [node('g1'), node('g2')]), node('d'), node('e')];
  const snapshot = JSON.stringify(nodes);
  const inside = select(nodes, ids(nodes), ['g1'], 'g1', 'd', { shift: true });
  assert.deepEqual(inside.selectedIds, ['g1', 'g2', 'd']);
  assert.equal(tree.canGroupNodes(nodes, inside.selectedIds), false);
  const whole = select(nodes, ids(nodes), ['a'], 'a', 'e', { shift: true });
  assert.deepEqual(whole.selectedIds, ['a', 'group', 'd', 'e']);
  assert.equal(tree.canGroupNodes(nodes, whole.selectedIds), true);
  const collapsed = ids(nodes, new Set(['group']));
  assert.deepEqual(select(nodes, collapsed, ['a'], 'a', 'd', { shift: true }).selectedIds, ['a', 'group', 'd']);
  assert.deepEqual(select(nodes, collapsed, ['g1'], 'g1', 'd', { shift: true }), { selectedIds: ['d'], anchorId: 'd' });
  assert.equal(JSON.stringify(nodes), snapshot);
});

test('逐个选择父子层会去除冲突，不会让复制和删除重复处理子树', () => {
  const nodes = [node('group', [node('child')]), node('sibling')];
  const child = select(nodes, ids(nodes), ['group', 'sibling'], 'group', 'child', { toggle: true });
  assert.deepEqual(child.selectedIds, ['child', 'sibling']);
  assert.deepEqual(select(nodes, ids(nodes), child.selectedIds, child.anchorId, 'group', { toggle: true }).selectedIds, ['group', 'sibling']);
});

test('起点被删除或未选择起点时安全降级，排序后按最新图层顺序选择', () => {
  assert.deepEqual(select(flat, ids(flat), [], '', 'c', { shift: true }), { selectedIds: ['c'], anchorId: 'c' });
  assert.deepEqual(select(flat, ids(flat), ['b'], 'missing', 'd', { shift: true }).selectedIds, ['b', 'c', 'd']);
  assert.deepEqual(select(flat, ids(flat), ['a'], 'a', 'missing', { shift: true }), { selectedIds: ['a'], anchorId: 'a' });
  const moved = tree.moveNode(flat, 'e', 1);
  assert.deepEqual(select(moved, ids(moved), ['a'], 'a', 'c', { shift: true }).selectedIds, ['a', 'e', 'b', 'c']);
});
