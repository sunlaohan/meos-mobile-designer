import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { parse, compileTemplate } from '@vue/compiler-sfc';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'compose-generation-input-'));
const server = await createServer({ configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
let createGenerationComposer;
try { ({ createGenerationComposer } = await server.ssrLoadModule('/src/utils/generationComposer.ts')); }
finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }); }

test('默认需求生成；切换模式独立保留描述和附件，只提交当前草稿', () => {
  const state = createGenerationComposer('巡检任务列表');
  assert.equal(state.inputMode.value, 'requirements');
  assert.equal(state.hasInput.value, true);
  const document = { id: 'prd', name: '需求.md', kind: 'code', mimeType: 'text/plain', size: 3, content: 'PRD' };
  state.attachments.value = [document];
  state.prompt.value = '工单页面';
  state.inputMode.value = 'image';
  assert.equal(state.prompt.value, ''); assert.equal(state.attachments.value.length, 0);
  assert.equal(state.hasInput.value, false);
  state.prompt.value = '保留字段';
  assert.equal(state.hasInput.value, false, '只有文字不能绕过图片要求');
  const image = { ...document, id: 'image', name: '页面.png', kind: 'image' };
  state.attachments.value = [image];
  assert.equal(state.hasInput.value, true);
  const submitted = state.request('vision-model');
  assert.equal(submitted.inputMode, 'image'); assert.equal(submitted.imageAction, 'beautify');
  assert.deepEqual(submitted.attachments, [image]);
  state.attachments.value[0].name = '更改.png';
  assert.equal(submitted.attachments[0].name, '页面.png', '提交后草稿不能更改正在生成的请求');
  state.inputMode.value = 'requirements';
  assert.equal(state.prompt.value, '工单页面'); assert.deepEqual(state.attachments.value, [document]);
  assert.equal(state.request('model').imageAction, undefined);
  state.inputMode.value = 'image';
  assert.equal(state.prompt.value, '保留字段'); assert.equal(state.request('vision').imageAction, 'beautify');
});

test('清空描述后仍可按 PRD 或纯图片生成，移除最后一张图片后不能提交', () => {
  const state = createGenerationComposer('');
  assert.equal(state.hasInput.value, false);
  state.attachments.value = [{ id: 'prd', name: '需求.md', kind: 'code', mimeType: 'text/plain', size: 3, content: 'PRD' }];
  assert.equal(state.hasInput.value, true);
  state.inputMode.value = 'image';
  state.attachments.value = [{ id: 'img', name: '页面.png', kind: 'image', mimeType: 'image/png', size: 1, content: 'image' }];
  assert.equal(state.hasInput.value, true); assert.equal(state.request('vision').prompt, '');
  assert.equal(state.request('vision').imageAction, 'beautify');
  state.attachments.value = [];
  assert.equal(state.hasInput.value, false);
});

test('生成面板移除底部冗余说明，两种模式保留操作和构建状态', async () => {
  const source = await readFile(new URL('../src/components/ComponentLibrary.vue', import.meta.url), 'utf8');
  const { descriptor, errors } = parse(source);
  assert.deepEqual(errors, []);
  const template = descriptor.template.content;
  assert.ok(!template.includes('保留主要内容，优化排版与信息层级'));
  assert.ok(!template.includes('use-persagy-vant · 组件规范'));
  assert.match(template, /<span v-if="generating" role="status">/);
  assert.match(template, /取消生成/);
  assert.match(template, /send-button--image/);
  assert.deepEqual(compileTemplate({ source: template, filename: 'ComponentLibrary.vue', id: 'composer-copy' }).errors, []);
});
