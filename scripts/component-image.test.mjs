import assert from 'node:assert/strict';
import test from 'node:test';
import { File } from 'node:buffer';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { parse } from '@vue/compiler-sfc';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-component-image-'));
const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
let images, exports;
try {
  images = await server.ssrLoadModule('/src/utils/componentImage.ts');
  exports = await server.ssrLoadModule('/src/utils/exportDesign.ts');
} finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }); }

test('本地图片拒绝不支持格式、超大文件和解码失败的内容', async () => {
  await assert.rejects(images.readComponentImage(new File(['hello'], 'code.txt', { type: 'text/plain' })), /请选择.*图片/);
  await assert.rejects(images.readComponentImage(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })), /单张图片不能超过 5MB/);
  const previous = global.createImageBitmap;
  global.createImageBitmap = async () => { throw Error('Invalid image'); };
  try { await assert.rejects(images.readComponentImage(new File(['not an image'], 'broken.png', { type: 'image/png' })), /不是可读取的图片/); }
  finally { if (previous) global.createImageBitmap = previous; else delete global.createImageBitmap; }
});

test('每次随机切换使用新种子，选定地址可以持久化且不会在重开页面时再次随机', () => {
  const first = images.randomImageSource(), second = images.randomImageSource();
  assert.notEqual(first, second);
  assert.equal(images.randomImageSource('saved-seed'), 'https://picsum.photos/seed/saved-seed/720/320');
  assert.equal(new URL(first).hostname, 'picsum.photos');
});

test('网络图片成功加载才应用，错误和取消都会清理加载任务', async () => {
  const previous = global.Image;
  let instance;
  global.Image = class {
    constructor() { instance = this; }
    set src(value) { this.currentSrc = value; }
    removeAttribute(name) { if (name === 'src') this.currentSrc = ''; }
  };
  try {
    const success = images.loadComponentImage('https://example.com/photo.jpg', new AbortController().signal);
    instance.onload(); await success;
    assert.equal(instance.onload, null); assert.equal(instance.onerror, null);
    const failure = images.loadComponentImage('https://example.com/broken.jpg', new AbortController().signal);
    instance.onerror(); await assert.rejects(failure, /网络图片加载失败/);
    assert.equal(instance.currentSrc, '');
    const controller = new AbortController();
    const cancelled = images.loadComponentImage('https://example.com/pending.jpg', controller.signal);
    controller.abort(); await assert.rejects(cancelled, { name: 'AbortError' });
    assert.equal(instance.onload, null); assert.equal(instance.onerror, null); assert.equal(instance.currentSrc, '');
    await assert.rejects(images.loadComponentImage('https://example.com/unused.jpg', controller.signal), { name: 'AbortError' });
  } finally { if (previous) global.Image = previous; else delete global.Image; }
});

test('嵌入的本地图片和随机网络地址完整保留在 JSON、重新打开的节点和 Vue 导出中', () => {
  const src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jg1kAAAAASUVORK5CYII=';
  const online = images.randomImageSource('persistent-photo');
  const nodes = [{ id: 'group', type: 'container-group', props: {}, children: [src, online].map((value, index) => ({ id: `image-${index}`, type: 'image', props: { src: value, width: '100%' } })) }];
  const reopened = JSON.parse(exports.toJson('图片测试', nodes)).components;
  assert.deepEqual(reopened, nodes);
  const code = exports.toVueSfc('图片测试', reopened);
  assert(code.includes(`src="${src}"`)); assert(code.includes(`src="${online}"`));
  assert.deepEqual(parse(code).errors, []);
});
