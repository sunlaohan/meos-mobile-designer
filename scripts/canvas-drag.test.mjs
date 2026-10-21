import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-canvas-drag-'));
const server = await createServer({ configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const { createCanvasDrag, canvasScrollVelocity, scrollCanvasAt } = await server.ssrLoadModule('/src/utils/canvasDrag.ts');
const { componentDragState: state } = await server.ssrLoadModule('/src/utils/componentDragState.ts');
await server.close();
await rm(cacheDir, { recursive: true, force: true });

class Target {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  fire(type, values = {}) {
    const event = { pointerId: 7, button: 0, buttons: 1, isPrimary: true, clientX: 250, clientY: 120, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...values };
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
    return event;
  }
  get listenerCount() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}

function fixture(t, { clipped = false } = {}) {
  const window = Object.assign(new Target(), { innerWidth: 800, innerHeight: clipped ? 600 : 900 });
  const document = Object.assign(new Target(), { defaultView: window, hidden: false });
  let measurements = 0; let nextFrame = 0;
  const frames = new Map();
  class Element extends Target {
    children = []; dataset = {}; captured = null; parentElement = null;
    classes = new Set();
    classList = { add: (name) => this.classes.add(name), remove: (name) => this.classes.delete(name), contains: (name) => this.classes.has(name) };
    ownerDocument = document; offsetWidth = 390; scrollHeight = 0; clientHeight = 0; overflowY = 'visible'; value = 0;
    constructor(classes, box, dataset = {}) { super(); classes.split(' ').forEach((name) => this.classes.add(name)); this.box = box; this.dataset = dataset; }
    append(child) { child.parentElement = this; this.children.push(child); return child; }
    matches(selector) {
      return selector.split(',').some((part) => {
        const s = part.trim();
        if (s.includes(':not')) return this.classes.has('phone-frame') && !this.classes.has('phone-frame--preview');
        if (s.startsWith('.')) return this.classes.has(s.slice(1));
        const attribute = s.match(/^\[data-([\w-]+)(?:="([^"]*)")?\]$/);
        if (!attribute) return false;
        const key = attribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        return key in this.dataset && (attribute[2] === undefined || this.dataset[key] === attribute[2]);
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) { return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    hasAttribute(name) { return this.matches(`[${name}]`); }
    getBoundingClientRect() {
      measurements += 1;
      const top = this.box.top - (this.closest('.canvas-node') ? content.scrollTop : 0) - outer.scrollTop;
      return { ...this.box, top, right: this.box.left + this.box.width, bottom: top + this.box.height };
    }
    get scrollTop() { return this.value; }
    set scrollTop(value) { this.value = Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight)); }
    setPointerCapture(id) { this.captured = id; }
    hasPointerCapture(id) { return this.captured === id; }
    releasePointerCapture() { this.captured = null; }
  }
  const box = (top, height) => ({ left: 100, top, width: 390, height });
  const outer = new Element('canvas-scroll', box(0, clipped ? 600 : 900));
  Object.assign(outer, { overflowY: 'auto', scrollHeight: clipped ? 900 : 900, clientHeight: clipped ? 600 : 900 });
  const phone = outer.append(new Element('phone-frame', box(0, 844)));
  const content = phone.append(new Element('phone-content', box(34, 774)));
  Object.assign(content, { overflowY: 'auto', scrollHeight: 1200, clientHeight: 774 });
  const background = content.append(new Element('canvas-node', box(34, 1100), { nodeId: 'bg' }));
  const body = background.append(new Element('body', box(34, 1100), { canvasChildren: 'bg' }));
  const rows = ['a', 'b', 'c'].map((id, index) => body.append(new Element('canvas-node', box(100 + index * 44, 44), { nodeId: id })));
  const footer = phone.append(new Element('phone-fixed-layer', box(748, 60)));
  const root = new Element('html', box(0, 900));
  document.documentElement = root;
  document.elementFromPoint = (x, y) => {
    if (x < 100 || x >= 490 || y < 34 || y >= window.innerHeight) return null;
    if (y >= 748 - outer.scrollTop) return footer;
    return [...rows].reverse().find((row) => { const b = row.getBoundingClientRect(); return y >= b.top && y < b.bottom; }) || body;
  };
  const nodes = [{ id: 'bg', type: 'background', props: {}, children: ['a', 'b', 'c'].map((id) => ({ id, type: 'cell', props: {} })) }];
  const original = JSON.stringify(nodes);
  const globals = {
    window, document, CSS: { escape: (id) => id },
    getComputedStyle: (element) => ({ overflowY: element.overflowY, paddingLeft: '0', paddingRight: '0', paddingTop: '0' }),
    requestAnimationFrame: (callback) => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: (id) => frames.delete(id),
  };
  const previous = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  const drops = [];
  const drag = createCanvasDrag({ nodes: () => nodes, onDrop: (item, intent) => drops.push({ item, intent }) });
  t.after(() => {
    drag.cancel();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    drag, rows, content, outer, drops, document, window,
    get measurements() { return measurements; }, get pending() { return frames.size; },
    start() { drag.start(phone.fire('pointerdown'), { type: 'cell', sourceId: 'a' }, rows[0]); },
    move(x = 250, y = 170) { window.fire('pointermove', { clientX: x, clientY: y }); },
    frame(time = 16) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(time)); },
    up(x = 250, y = 170) { window.fire('pointerup', { buttons: 0, clientX: x, clientY: y }); },
    clean() {
      assert.equal(frames.size, 0); assert.equal(window.listenerCount + document.listenerCount, 0);
      assert.equal(rows[0].captured, null); assert.equal(state.type, ''); assert.equal(state.sourceId, '');
      assert.equal(state.target, null); assert.equal(root.classList.contains('is-canvas-dragging'), false);
      assert.equal(JSON.stringify(nodes), original, 'dragging must not edit the document before a confirmed drop');
    },
  };
}

test('画布拖动通过源节点捕获指针，同一帧的多次移动只测量一次并显示最后位置', (t) => {
  const f = fixture(t); f.start();
  assert.equal(f.rows[0].captured, 7);
  for (let x = 200; x <= 250; x += 1) f.move(x);
  assert.equal(f.pending, 1);
  assert.equal(f.measurements, 0);
  f.frame();
  assert.equal(state.sourceId, 'a'); assert.equal(state.x, 250);
  assert.equal(state.target.parentId, 'bg'); assert.equal(state.target.index, 2);
  assert.equal(state.target.indicator.top, 188);
  assert.equal(f.pending, 0, 'stationary pointers away from edges must not run an idle animation loop');
  const measured = f.measurements;
  f.move(260); f.move(270);
  assert.equal(f.measurements, measured);
  f.up(270);
  const { parentId, index, anchorId, position } = f.drops[0].intent.target;
  assert.deepEqual({ parentId, index, anchorId, position }, { parentId: 'bg', index: 2, anchorId: 'b', position: 'after' });
  f.clean();
});

test('快速松手发生在首帧之前也完成一次排序，不遗留延迟浮标', (t) => {
  const f = fixture(t); f.start(); f.move(); f.up();
  assert.equal(f.drops.length, 1);
  assert.equal(f.drops[0].intent.target.index, 2);
  assert.equal(f.drops[0].intent.target.parentId, 'bg');
  f.frame(); f.clean();
});

test('指针停在底部边缘时继续平滑滚动，取消后停止所有帧和监听', (t) => {
  const f = fixture(t); f.start(); f.move(250, 735); f.frame();
  const first = f.content.scrollTop;
  assert.ok(first > 0); assert.equal(f.pending, 1);
  f.frame(32); assert.ok(f.content.scrollTop > first);
  f.drag.cancel(); f.frame(48); f.up(250, 735);
  assert.equal(f.drops.length, 0); f.clean();
});

test('模拟器被外层裁切时先滚动画板揭示底部；离开画板或固定栏不会误滚动', (t) => {
  const f = fixture(t, { clipped: true });
  assert.equal(scrollCanvasAt(250, 590, 16), true);
  assert.ok(f.outer.scrollTop > 0); assert.equal(f.content.scrollTop, 0);
  const outerTop = f.outer.scrollTop;
  assert.equal(scrollCanvasAt(700, 590, 16), false);
  assert.equal(f.outer.scrollTop, outerTop);
});

test('边缘滚动渐进加速，中间与可见区域外保持静止', () => {
  assert.equal(canvasScrollVelocity(400, 100, 700), 0);
  assert.equal(canvasScrollVelocity(99, 100, 700), 0);
  assert.equal(canvasScrollVelocity(701, 100, 700), 0);
  assert.equal(canvasScrollVelocity(400, 400, 400), 0);
  assert.ok(canvasScrollVelocity(699, 100, 700) > canvasScrollVelocity(670, 100, 700));
  assert.ok(canvasScrollVelocity(101, 100, 700) < canvasScrollVelocity(130, 100, 700));
  assert.ok(Math.abs(canvasScrollVelocity(700, 100, 700)) <= 560);
});
