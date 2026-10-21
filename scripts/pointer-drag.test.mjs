import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-pointer-drag-'));
const server = await createServer({ configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const { createPointerDrag } = await server.ssrLoadModule('/src/utils/pointerDrag.ts');
await server.close();
await rm(cacheDir, { recursive: true, force: true });

class Target {
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  fire(type, props = {}) {
    const event = { type, pointerId: 7, button: 0, buttons: 1, isPrimary: true, clientX: 10, clientY: 10, currentTarget: this, preventDefault() {}, stopPropagation() {}, ...props };
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
    return event;
  }
  get listenerCount() { return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0); }
}

function fixture({ onDrop, prepareDrop, captureFails = false } = {}) {
  const window = new Target();
  Object.assign(window, { innerWidth: 1329, innerHeight: 1236 });
  const document = Object.assign(new Target(), { defaultView: window, hidden: false });
  const capture = Object.assign(new Target(), {
    ownerDocument: document,
    captured: null,
    setPointerCapture(id) { if (captureFails) throw new Error('Pointer already ended'); this.captured = id; },
    hasPointerCapture(id) { return this.captured === id; },
    releasePointerCapture(id) { this.captured = null; this.fire('lostpointercapture', { pointerId: id }); },
  });
  let ghost = '';
  const drops = [];
  const drag = createPointerDrag({
    onMove(type) { ghost = type; },
    prepareDrop: prepareDrop ? (type, event) => prepareDrop(ghost, event) : undefined,
    onReset() { ghost = ''; },
    onDrop(type, event, prepared) { assert.equal(ghost, '', 'drop callbacks must see cleared visual state'); drops.push({ type, x: event.clientX, y: event.clientY }); onDrop?.(prepared); },
  });
  function start(props = {}, type = 'image') { drag.start(capture.fire('pointerdown', props), type); }
  function move(props = {}) { window.fire('pointermove', { clientX: 100, clientY: 100, ...props }); }
  function up(props = {}) { window.fire('pointerup', { buttons: 0, clientX: 200, clientY: 300, ...props }); }
  function clean() {
    assert.equal(ghost, '');
    assert.equal(capture.captured, null);
    assert.equal(window.listenerCount + document.listenerCount + capture.listenerCount, 0);
  }
  return { drag, window, document, capture, drops, start, move, up, clean, get ghost() { return ghost; } };
}

test('跨出卡片松手只投放一次，先清除浮标和捕获，并阻止随后点击重复添加', () => {
  const f = fixture();
  f.start(); f.move();
  assert.equal(f.ghost, 'image');
  f.up(); f.up();
  assert.deepEqual(f.drops, [{ type: 'image', x: 200, y: 300 }]);
  assert.equal(f.drag.allowsClick({ detail: 1 }), false);
  f.clean();
});

test('普通点击和键盘添加正常，下一次主动按下会解除上一次拖拽的点击抑制', () => {
  const f = fixture();
  f.start(); f.move(); f.up();
  assert.equal(f.drag.allowsClick({ detail: 1 }), false);
  assert.equal(f.drag.allowsClick({ detail: 0 }), true);
  f.start(); f.move({ clientX: 12, clientY: 11 }); f.up();
  assert.equal(f.drops.length, 1);
  assert.equal(f.drag.allowsClick({ detail: 1 }), true);
  f.clean();
});

for (const reason of ['pointercancel', 'Escape', 'blur', 'hidden', 'unmount']) {
  test(`${reason} 中断拖拽后不投放、无残留浮标或监听器，下一次拖拽正常`, () => {
    const f = fixture();
    f.start(); f.move();
    if (reason === 'Escape') f.window.fire('keydown', { key: 'Escape' });
    else if (reason === 'hidden') { f.document.hidden = true; f.document.fire('visibilitychange'); }
    else if (reason === 'unmount') f.drag.cancel();
    else f.window.fire(reason);
    f.up();
    assert.equal(f.drops.length, 0);
    assert.equal(f.drag.allowsClick({ detail: 1 }), false);
    f.clean();
    f.document.hidden = false;
    f.start(); f.move(); f.up();
    assert.equal(f.drops.length, 1);
    f.clean();
  });
}

test('真实松手顺序：先收到 buttons=0 的 pointermove，仍投放一次，后续 up 不得丢失或重复', () => {
  let received;
  const confirmed = { parentId: 'background', index: 4 };
  const f = fixture({ prepareDrop(ghost) { assert.equal(ghost, 'image'); return confirmed; }, onDrop(prepared) { received = prepared; } });
  f.start({ clientX: 206.992, clientY: 696.328 });
  f.move({ clientX: 618.096, clientY: 542.842 });
  f.move({ clientX: 617.373, clientY: 565.696 });
  f.move({ buttons: 0, clientX: 617.227, clientY: 565.695 });
  assert.deepEqual(f.drops, [{ type: 'image', x: 617.227, y: 565.695 }]);
  assert.deepEqual(received, confirmed);
  f.up({ clientX: 617.227, clientY: 565.695 });
  f.window.fire('mouseup', { buttons: 0 });
  assert.equal(f.drops.length, 1);
  assert.equal(f.drag.allowsClick({ detail: 1 }), false);
  f.clean();
});

test('没有位移的松手移动事件不吞掉普通点击', () => {
  const f = fixture();
  f.start(); f.move({ buttons: 0, clientX: 10, clientY: 10 }); f.up();
  assert.equal(f.drops.length, 0);
  assert.equal(f.drag.allowsClick({ detail: 1 }), true);
  f.clean();
});

test('在窗口外松手丢失 pointerup，返回时清理，不能在返回位置误投放', () => {
  const f = fixture();
  f.start(); f.move();
  f.move({ clientX: -20 });
  f.move({ buttons: 0 });
  f.up();
  assert.equal(f.drops.length, 0);
  f.clean();
});

test('在窗口外收到 buttons=0 的移动事件直接取消', () => {
  const f = fixture();
  f.start(); f.move(); f.move({ buttons: 0, clientY: 1400 }); f.up();
  assert.equal(f.drops.length, 0);
  f.clean();
});

test('其他指针的移动、松手和取消不会结束或覆盖正在进行的拖拽', () => {
  const f = fixture();
  f.start(); f.move();
  f.start({ pointerId: 8 }, 'button');
  f.move({ pointerId: 8, buttons: 0 });
  f.up({ pointerId: 8 });
  f.capture.fire('lostpointercapture', { pointerId: 8 });
  f.window.fire('pointercancel', { pointerId: 8 });
  assert.equal(f.ghost, 'image');
  assert.equal(f.drops.length, 0);
  f.up();
  assert.equal(f.drops[0].type, 'image');
  f.clean();
});

test('捕获提前丢失后继续使用全局松手事件，不能直接取消有效拖放', () => {
  const f = fixture();
  f.start(); f.move();
  f.capture.releasePointerCapture(7);
  f.up();
  assert.equal(f.drops.length, 1);
  f.clean();
});

test('pointerup 的释放事件优先于残留 buttons 标记，mouseup 不能重复添加', () => {
  const f = fixture();
  f.start(); f.move();
  f.up({ buttons: 1 });
  f.window.fire('mouseup', { buttons: 0 });
  assert.equal(f.drops.length, 1);
  f.clean();
});

test('原生鼠标只有 mouseup 时仍完成投放，触摸产生的兼容鼠标事件不会误投放', () => {
  const f = fixture();
  f.start({ pointerType: 'mouse' }); f.move();
  f.window.fire('mouseup', { buttons: 0 });
  assert.equal(f.drops.length, 1);
  f.up();
  assert.equal(f.drops.length, 1);
  f.clean();
  f.start({ pointerType: 'touch' }); f.move();
  f.window.fire('mouseup', { buttons: 0 });
  assert.equal(f.drops.length, 1);
  f.up();
  assert.equal(f.drops.length, 2);
  f.clean();
});

test('清理前锁定松手落点，清理和释放捕获不会使已确认的投放丢失', () => {
  const confirmed = { parentId: 'background', index: 4 };
  let received;
  const f = fixture({ prepareDrop(ghost) { assert.equal(ghost, 'image'); return confirmed; }, onDrop(prepared) { received = prepared; } });
  f.start(); f.move(); f.up();
  assert.deepEqual(received, confirmed);
  f.clean();
});

test('落点确认抛错也会释放状态，不能遗留浮标或随后补发重复投放', () => {
  const f = fixture({ prepareDrop() { throw new Error('target disappeared'); } });
  f.start(); f.move();
  assert.throws(() => f.up(), /target disappeared/);
  f.window.fire('mouseup', { buttons: 0 });
  assert.equal(f.drops.length, 0);
  f.clean();
});

test('右键和非主触点不能启动组件拖拽', () => {
  const f = fixture();
  f.start({ button: 2 }); f.move(); f.up();
  f.start({ isPrimary: false }); f.move(); f.up();
  assert.equal(f.drops.length, 0);
  f.clean();
});

test('捕获失败或投放回调抛错也会释放所有拖拽状态', () => {
  const failed = fixture({ captureFails: true });
  assert.doesNotThrow(() => failed.start());
  failed.clean();
  const f = fixture({ onDrop() { throw new Error('drop failed'); } });
  f.start(); f.move();
  assert.throws(() => f.up(), /drop failed/);
  f.clean();
});
