import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-canvas-drop-'));
const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const { projectCanvasDrop, confirmCanvasDrop } = await server.ssrLoadModule('/src/utils/canvasDrop.ts');
const { componentDragState } = await server.ssrLoadModule('/src/utils/componentDragState.ts');
const { default: Overlay } = await server.ssrLoadModule('/src/components/ComponentDragOverlay.vue');
const { moveNode } = await server.ssrLoadModule('/src/utils/nodeTree.ts');
await server.close();
await rm(cacheDir, { recursive: true, force: true });

const node = (id, type = 'cell', children) => ({ id, type, props: {}, ...(children ? { children } : {}) });
const rect = (id, top, height, left = 100, width = 300) => ({ id, left, top, width, height });

test('普通组件的上半区插在前面，下半区插在后面，落点保留所属容器', () => {
  const nodes = [node('group', 'container-group', [node('a'), node('b')])];
  const rects = [rect('group', 100, 200), rect('a', 110, 50), rect('b', 180, 50)];
  assert.deepEqual(projectCanvasDrop(nodes, rects, { hoveredId: 'b', y: 185 }), { parentId: 'group', index: 1, anchorId: 'b', position: 'before' });
  assert.deepEqual(projectCanvasDrop(nodes, rects, { hoveredId: 'b', y: 220 }), { parentId: 'group', index: 2, anchorId: 'b', position: 'after' });
});

test('容器中部接收子组件，边缘允许插在整个容器前后', () => {
  const nodes = [node('a'), node('group', 'container-group', [node('b')]), node('c')];
  const rects = [rect('a', 50, 40), rect('group', 100, 200), rect('b', 150, 50), rect('c', 320, 40)];
  assert.deepEqual(projectCanvasDrop(nodes, rects, { hoveredId: 'group', y: 105 }), { parentId: null, index: 1, anchorId: 'group', position: 'before' });
  assert.deepEqual(projectCanvasDrop(nodes, rects, { hoveredId: 'group', y: 130 }), { parentId: 'group', index: 0, anchorId: 'b', position: 'before' });
  assert.deepEqual(projectCanvasDrop(nodes, rects, { hoveredId: 'group', y: 240 }), { parentId: 'group', index: 1, anchorId: 'b', position: 'append' });
  assert.deepEqual(projectCanvasDrop(nodes, rects, { hoveredId: 'group', y: 295 }), { parentId: null, index: 2, anchorId: 'group', position: 'after' });
});

test('容器空白和子组件间距按相邻组件定位，不再全部追加到末尾', () => {
  const nodes = [node('group', 'container-group', [node('a'), node('b'), node('c')])];
  const rects = [rect('group', 100, 300), rect('a', 120, 40), rect('b', 200, 40), rect('c', 300, 40)];
  assert.deepEqual(projectCanvasDrop(nodes, rects, { hoveredId: 'group', y: 180 }), { parentId: 'group', index: 1, anchorId: 'b', position: 'before' });
  assert.deepEqual(projectCanvasDrop(nodes, rects, { hoveredId: 'group', y: 370 }), { parentId: 'group', index: 3, anchorId: 'c', position: 'append' });
});

test('嵌套组和面板插槽使用原始父级及索引，不修改设计数据', () => {
  const nodes = [node('outer', 'container-group', [node('inner', 'container-group', [node('a'), node('b')])]), node('panel', 'form-panel', [node('field', 'field')])];
  const snapshot = JSON.stringify(nodes);
  const rects = [rect('inner', 100, 200), rect('a', 110, 50), rect('b', 180, 50), rect('field', 420, 50)];
  assert.equal(projectCanvasDrop(nodes, rects, { hoveredId: 'b', y: 225 }).parentId, 'inner');
  assert.deepEqual(projectCanvasDrop(nodes, rects, { parentId: 'panel', y: 460 }), { parentId: 'panel', index: 1, anchorId: 'field', position: 'after' });
  assert.equal(JSON.stringify(nodes), snapshot);
});

test('空画布与空容器给出首个插入位置，缺失或不支持子组件的父级不可投放', () => {
  assert.deepEqual(projectCanvasDrop([], [], { y: 150 }), { parentId: null, index: 0, anchorId: '', position: 'inside' });
  const nodes = [node('empty', 'container-group', []), node('leaf')];
  assert.deepEqual(projectCanvasDrop(nodes, [rect('empty', 100, 60)], { hoveredId: 'empty', y: 130 }), { parentId: 'empty', index: 0, anchorId: 'empty', position: 'inside' });
  assert.equal(projectCanvasDrop(nodes, [], { parentId: 'missing', y: 100 }), null);
  assert.equal(projectCanvasDrop(nodes, [], { parentId: 'leaf', y: 100 }), null);
});

test('固定栏和关闭面板不参与流式落点，但文档中的索引不丢失', () => {
  const nodes = [node('panel', 'form-panel'), node('a'), { ...node('bar', 'bottom-action-bar'), props: { fixed: true } }, node('b')];
  const rects = [rect('a', 100, 50), rect('bar', 650, 60), rect('b', 180, 50)];
  assert.deepEqual(projectCanvasDrop(nodes, rects, { y: 80 }), { parentId: null, index: 1, anchorId: 'a', position: 'before' });
  assert.deepEqual(projectCanvasDrop(nodes, rects, { y: 600 }), { parentId: null, index: 4, anchorId: 'b', position: 'append' });
});

test('背景末尾整片空白与最底部边缘都追加到背景内部，不切到背景外', () => {
  const nodes = [node('background', 'background', [node('form', 'form', [node('field', 'field')]), node('contacts', 'container-group', [node('phone', 'field')])]), { ...node('bar', 'bottom-action-bar'), props: { fixed: true } }];
  const rects = [rect('background', 100, 700), rect('form', 110, 250), rect('contacts', 390, 100), rect('phone', 430, 44)];
  for (const y of [520, 650, 795, Infinity]) {
    assert.deepEqual(projectCanvasDrop(nodes, rects, { hoveredId: 'background', y }), { parentId: 'background', index: 2, anchorId: 'contacts', position: 'append' });
  }
});

test('追加到末尾保留末尾隐藏控件的文档顺序，后续组件追加在它们之后', () => {
  const nodes = [node('background', 'background', [node('cell'), node('panel', 'form-panel')])];
  const rects = [rect('background', 100, 700), rect('cell', 120, 44)];
  assert.deepEqual(projectCanvasDrop(nodes, rects, { hoveredId: 'background', y: 650 }), { parentId: 'background', index: 2, anchorId: 'cell', position: 'append' });
});

test('松手轻微抖动保持已经预览的背景末尾，大幅移动和无效落点则按实际位置处理', () => {
  const nodes = [node('background', 'background', [node('cell')]), node('other')];
  const target = { parentId: 'background', index: 1, anchorId: 'cell', position: 'append' };
  const current = { parentId: null, index: 2, anchorId: 'other', position: 'after' };
  const preview = { target, x: 150, y: 400 };
  assert.deepEqual(confirmCanvasDrop(nodes, preview, current, 153, 404), target);
  assert.deepEqual(confirmCanvasDrop(nodes, preview, current, 180, 460), current);
  assert.equal(confirmCanvasDrop(nodes, preview, null, 153, 404), null);
  assert.deepEqual(confirmCanvasDrop(nodes, { ...preview, target: { ...target, parentId: 'removed' } }, current, 153, 404), current);
});

test('缩放和滚动后的坐标仍解析到相同父级与插入索引', () => {
  const nodes = [node('group', 'container-group', [node('a'), node('b')])];
  const rects = [rect('group', 100, 200), rect('a', 110, 50), rect('b', 180, 50)];
  const original = projectCanvasDrop(nodes, rects, { hoveredId: 'group', y: 175 });
  for (const scale of [0.5, 0.75, 1.5]) {
    const shifted = rects.map((box) => ({ ...box, top: box.top * scale - 20, height: box.height * scale }));
    assert.deepEqual(projectCanvasDrop(nodes, shifted, { hoveredId: 'group', y: 175 * scale - 20, edgeSize: 12 * scale }), original);
  }
});

test('内部排序排除拖拽源，但向前、向后及末尾投放保留原始索引', () => {
  const nodes = [node('group', 'container-group', [node('a'), node('b'), node('c')])];
  const rects = [rect('group', 100, 260), rect('a', 120, 44), rect('b', 164, 44), rect('c', 208, 44)];
  for (const [sourceId, hoveredId, y, expected] of [
    ['a', 'c', 240, ['b', 'c', 'a']],
    ['c', 'a', 125, ['c', 'a', 'b']],
    ['a', 'group', 320, ['b', 'c', 'a']],
    ['b', 'b', 190, ['a', 'b', 'c']],
  ]) {
    const target = projectCanvasDrop(nodes, rects, { sourceId, hoveredId, y });
    assert.notEqual(target.anchorId, sourceId);
    assert.deepEqual(moveNode(nodes, sourceId, target.index, target.parentId)[0].children.map(({ id }) => id), expected);
  }
});

test('拖动容器时自身子树不可作为父级，跨容器和空容器仍能接收', () => {
  const nodes = [node('source', 'container-group', [node('inner', 'container-group', [node('a')])]), node('empty', 'container-group', [])];
  const rects = [rect('source', 100, 200), rect('inner', 110, 180), rect('a', 140, 44), rect('empty', 350, 80)];
  assert.equal(projectCanvasDrop(nodes, rects, { sourceId: 'source', parentId: 'inner', y: 160 }), null);
  const self = projectCanvasDrop(nodes, rects, { sourceId: 'source', hoveredId: 'a', y: 160 });
  assert.equal(self.parentId, null);
  assert.deepEqual(moveNode(nodes, 'source', self.index, self.parentId), nodes);
  assert.deepEqual(projectCanvasDrop(nodes, rects, { sourceId: 'a', hoveredId: 'empty', y: 380 }), { parentId: 'empty', index: 0, anchorId: 'empty', position: 'inside' });
  assert.equal(projectCanvasDrop(nodes, rects, { sourceId: 'removed', y: 380 }), null);
});

test('松手不能沿用已经删除或指向自身子树的排序预览', () => {
  const nodes = [node('group', 'container-group', [node('a')]), node('b')];
  const current = { parentId: null, index: 2, anchorId: 'b', position: 'after' };
  const previous = { parentId: 'group', index: 1, anchorId: 'a', position: 'after' };
  assert.deepEqual(confirmCanvasDrop(nodes, { target: previous, x: 100, y: 200 }, current, 101, 200, 'group'), current);
  assert.equal(confirmCanvasDrop(nodes, { target: current, x: 100, y: 200 }, previous, 101, 200, 'group'), null);
  assert.equal(confirmCanvasDrop(nodes, { target: current, x: 100, y: 200 }, current, 101, 200, 'removed'), null);
});

test('落点预览渲染插入线、容器边框和具体位置提示，取消后全部消失', async () => {
  const nodes = [{ ...node('group', 'container-group', [node('field', 'field')]), props: { name: '联系人信息' } }];
  Object.assign(componentDragState, { type: 'image', x: 150, y: 200, target: { parentId: 'group', index: 1, anchorId: 'field', position: 'after', mode: 'flow', indicator: { left: 100, top: 220, width: 300, labelBelow: false }, highlight: { left: 100, top: 100, width: 300, height: 200 } } });
  const render = async () => {
    const context = {};
    await renderToString(createSSRApp(Overlay, { nodes }), context);
    return context.teleports?.body || '';
  };
  try {
    const html = await render();
    assert.match(html, /canvas-drop-indicator/);
    assert.match(html, /canvas-drop-highlight/);
    assert.match(html, /data-drop-parent-id="group" data-drop-index="1"/);
    assert.match(html, /插入「输入框」之后/);
    assert.match(html, /放入「联系人信息」/);
    componentDragState.target.position = 'append';
    componentDragState.target.appendZone = { left: 100, top: 223, width: 300, height: 80 };
    const append = await render();
    assert.match(append, /添加到「联系人信息」末尾/);
    assert.match(append, /canvas-drop-append-zone/);
    assert.match(append, /松手添加到末尾/);
    componentDragState.sourceId = 'field';
    const reorder = await render();
    assert.match(reorder, /移动到「联系人信息」末尾/);
    assert.match(reorder, /松手移动到末尾/);
    assert.match(reorder, /translate3d\(164px, 214px, 0\)/);
    componentDragState.type = '';
    componentDragState.target = null;
    assert.doesNotMatch(await render(), /canvas-drop-indicator|canvas-drop-highlight|component-drag-ghost/);
  } finally { Object.assign(componentDragState, { type: '', sourceId: '', x: 0, y: 0, associationId: '', target: null }); }
});
