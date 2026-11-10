import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'compose-select-'));
const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const { nextEnabledOption, selectedOptionIndex, selectMenuPosition } = await server.ssrLoadModule('/src/utils/selectOptions.ts');
const { default: Select } = await server.ssrLoadModule('/src/components/EditorSelect.vue');
await server.close(); await rm(cacheDir, { recursive: true, force: true });

test('选择项保持数字和字符串的真实类型，同时兼容旧文档中的数字字符串', () => {
  const options = [{ value: 1, label: '数字一' }, { value: '1', label: '字符串一' }, { value: 0, label: '零' }];
  assert.equal(selectedOptionIndex(options, 1), 0);
  assert.equal(selectedOptionIndex(options, '1'), 1);
  assert.equal(selectedOptionIndex(options, '0'), 2);
  assert.equal(selectedOptionIndex(options, undefined), -1);
  assert.equal(selectedOptionIndex(options, '不支持的值'), -1);
});

test('键盘导航跳过禁用项并支持循环，空列表和全部禁用时没有活动项', () => {
  const options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }, { value: 'c', label: 'C' }];
  assert.equal(nextEnabledOption(options, 0, 1), 2);
  assert.equal(nextEnabledOption(options, 2, 1), 0);
  assert.equal(nextEnabledOption(options, 0, -1), 2);
  assert.equal(nextEnabledOption(options, -1, 1), 0);
  assert.equal(nextEnabledOption([], -1, 1), -1);
  assert.equal(nextEnabledOption(options.map(option => ({ ...option, disabled: true })), -1, 1), -1);
});

test('展开面板跟随触发框，底部自动上翻，视口边缘和窄屏不会溢出', () => {
  const viewport = { width: 1000, height: 700 };
  const below = selectMenuPosition({ left: 100, top: 100, bottom: 136, width: 240 }, viewport, 200);
  assert.equal(below.top, 142); assert.equal(below.left, 100); assert.equal(below.width, 240); assert.equal(below.upwards, false);
  const above = selectMenuPosition({ left: 880, top: 640, bottom: 676, width: 200 }, viewport, 250);
  assert.equal(above.upwards, true); assert.equal(above.top, 384); assert.ok(above.left + above.width <= 992);
  const narrow = selectMenuPosition({ left: -10, top: 30, bottom: 66, width: 300 }, { width: 160, height: 140 }, 500);
  assert.equal(narrow.left, 8); assert.equal(narrow.width, 144); assert.ok(narrow.top + narrow.maxHeight <= 132);
});

test('选择器保留关联标签、选中项与禁用状态，选项文案作为纯文本显示', async () => {
  const html = await renderToString(createSSRApp(Select, { id: 'select-example', ariaLabelledby: 'field-label', modelValue: 0, options: [{ value: 0, label: '<设备名称>' }] }));
  assert.match(html, /role="combobox"/); assert.match(html, /aria-labelledby="field-label"/);
  assert.match(html, /aria-expanded="false"/); assert.match(html, /&lt;设备名称&gt;/); assert.ok(!html.includes('<select'));
  const disabled = await renderToString(createSSRApp(Select, { ariaLabel: '正在加载', options: [], placeholder: '读取选项中' }));
  assert.match(disabled, /disabled/); assert.match(disabled, /读取选项中/);
});
