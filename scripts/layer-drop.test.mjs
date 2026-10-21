import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-layer-drop-'));
const server = await createServer({ configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const drop = await server.ssrLoadModule('/src/utils/layerDrop.ts');
const tree = await server.ssrLoadModule('/src/utils/nodeTree.ts');
await server.close();
await rm(cacheDir, { recursive: true, force: true });

const node = (id, type, children) => ({ id, type, props: { name: id, modelValue: id }, ...(children ? { children } : {}) });
function fixture() {
  return [node('title', 'nav-bar'), node('a', 'container-group', [node('a1', 'cell'), node('inner', 'container-group', [node('nested', 'field')]), node('a3', 'progress')]), node('b', 'form-panel', [node('b1', 'cell'), node('b2', 'field')]), node('footer', 'bottom-action-bar')];
}
function project(nodes, source, hover, position, depth, collapsed = new Set()) {
  return drop.projectLayerDrop(nodes, drop.flattenLayers(nodes, collapsed), source, hover, position, depth);
}
function moved(nodes, target, source) { assert(target); return tree.moveNode(nodes, source, target.index, target.parentId); }

test('图层列表不再保留底部移出分组入口和旧投放处理器', async () => {
  const library = await readFile(new URL('../src/components/ComponentLibrary.vue', import.meta.url), 'utf8');
  const canvasDrag = await readFile(new URL('../src/utils/canvasDrag.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(library, /root-drop-zone|rootDropActive|dropAtRoot|拖到这里移出分组/);
  assert.doesNotMatch(canvasDrag, /root-drop-zone|kind: 'root'/);
});

test('扁平可视树保留原始父级和索引；拖动时不压缩原树，折叠不丢失子树', () => {
  const nodes = fixture();
  assert.equal(drop.flattenLayers(nodes, new Set()).find((row) => row.node.id === 'nested').depth, 2);
  assert(!drop.flattenLayers(nodes, new Set(['a'])).some((row) => row.node.id === 'nested'));
  const dragging = drop.flattenLayers(nodes, new Set());
  assert(dragging.some((row) => row.node.id === 'nested'));
  assert.equal(dragging.find((row) => row.node.id === 'a3').index, 2);
  assert.equal(tree.findNode(nodes, 'inner').node.children[0].id, 'nested');
});

test('深层图层可直接跨到另一个组的首项、中间和末尾，无需先移回根级', () => {
  const nodes = fixture();
  for (const [hover, position, expected] of [['b1', 'before', 0], ['b1', 'after', 1], ['b', 'inside', 2]]) {
    const target = project(nodes, 'nested', hover, position, 1);
    assert.equal(target.parentId, 'b');
    assert.equal(target.index, expected);
    const result = moved(nodes, target, 'nested');
    assert.equal(tree.findNode(result, 'nested').parentId, 'b');
    assert.equal(tree.findNode(result, 'b').node.children[expected].id, 'nested');
  }
});

test('同一个垂直落点可通过左右移动放入父组或直接移出多层到页面根级', () => {
  const nodes = fixture();
  const parent = project(nodes, 'nested', 'a3', 'after', 1);
  const root = project(nodes, 'nested', 'a3', 'after', 0);
  assert.equal(parent.parentId, 'a');
  assert.equal(parent.depth, 1);
  assert.equal(root.parentId, null);
  assert.equal(root.depth, 0);
  const result = moved(nodes, root, 'nested');
  assert.deepEqual(result.map((row) => row.id), ['title', 'a', 'nested', 'b', 'footer']);
  assert.equal(tree.findNode(result, 'nested').node.props.modelValue, 'nested');
});

test('可以拖过展开组的整个子树，并根据水平位置放在该组之后', () => {
  const nodes = fixture();
  const target = project(nodes, 'b1', 'a', 'after', 0);
  assert.equal(target.parentId, null);
  const result = moved(nodes, target, 'b1');
  assert.deepEqual(result.map((row) => row.id), ['title', 'a', 'b1', 'b', 'footer']);
});

test('整组跨组、折叠组接收子图层和同组排序保留标识、属性和原文档', () => {
  const nodes = fixture();
  const snapshot = JSON.stringify(nodes);
  const result = moved(nodes, project(nodes, 'inner', 'b', 'inside', 1, new Set(['b'])), 'inner');
  assert.equal(tree.findNode(result, 'inner').parentId, 'b');
  assert.equal(tree.findNode(result, 'nested').parentId, 'inner');
  const ordered = moved(nodes, project(nodes, 'a1', 'a3', 'after', 1), 'a1');
  assert.deepEqual(tree.findNode(ordered, 'a').node.children.map((row) => row.id), ['inner', 'a3', 'a1']);
  assert.equal(JSON.stringify(nodes), snapshot);
  assert.equal(new Set(tree.flattenNodes(result).map((row) => row.id)).size, tree.flattenNodes(nodes).length);
});

test('拒绝组拖入自身和后代、普通组件作为父级、缺失源与无效目标', () => {
  const nodes = fixture();
  assert.equal(project(nodes, 'a', 'inner', 'inside', 2), null);
  assert.equal(project(nodes, 'a', 'a', 'inside', 0), null);
  assert.equal(project(nodes, 'b1', 'a1', 'inside', 1), null);
  assert.equal(project(nodes, 'missing', 'a', 'inside', 1), null);
  assert.equal(project(nodes, 'b1', 'missing', 'before', 0), null);
  assert.equal(project(nodes, 'b1', 'title', 'before', 99).depth, 0);
});

test('边缘滚动速度渐进，中心停止，离开列表后停止，两边速度对称', () => {
  assert.equal(drop.layerScrollVelocity(300, 100, 500), 0);
  assert.equal(drop.layerScrollVelocity(20, 100, 500), 0);
  assert.equal(drop.layerScrollVelocity(600, 100, 500), 0);
  assert.equal(drop.layerScrollVelocity(100, 100, 500), -640);
  assert.equal(drop.layerScrollVelocity(500, 100, 500), 640);
  assert(Math.abs(drop.layerScrollVelocity(140, 100, 500)) < Math.abs(drop.layerScrollVelocity(120, 100, 500)));
  assert.equal(drop.layerScrollVelocity(120, 100, 500), -drop.layerScrollVelocity(480, 100, 500));
});

test('悬停达到展开时间才触发，移开或换组会重置，取消后不沿用上次计时', () => {
  let state = drop.advanceLayerHover({ id: '', since: 0 }, 'a', 100);
  assert.equal(state.ready, false);
  assert.equal(drop.advanceLayerHover(state.hover, 'a', 649).ready, false);
  assert.equal(drop.advanceLayerHover(state.hover, 'a', 650).ready, true);
  state = drop.advanceLayerHover(state.hover, 'b', 700);
  assert.equal(state.ready, false);
  assert.equal(drop.advanceLayerHover(state.hover, 'b', 1249).ready, false);
  state = drop.advanceLayerHover(state.hover, '', 1300);
  assert.equal(state.ready, false);
  state = drop.advanceLayerHover(state.hover, 'a', 1800);
  assert.equal(state.ready, false);
  assert.equal(drop.advanceLayerHover(state.hover, 'a', 2350).ready, true);
});
