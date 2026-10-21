import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-icons-'));
const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
let icons;
let catalog;
let Picker;
try {
  icons = await server.ssrLoadModule('/src/utils/iconCatalog.ts');
  catalog = await server.ssrLoadModule('/src/data/componentCatalog.ts');
  Picker = (await server.ssrLoadModule('/src/components/IconPickerControl.vue')).default;
} finally {
  await server.close();
  await rm(cacheDir, { recursive: true, force: true });
}

test('选择列表仅使用真实加载的图标字体、SVG 和 GIF，完整且不重复', async () => {
  const root = path.dirname(createRequire(import.meta.url).resolve('persagy-vant/package.json'));
  const css = await readFile(path.join(root, 'lib/index.css'), 'utf8');
  const expected = new Set([...css.matchAll(/\.van-icon-([\w-]+):{1,2}before\b/g)].map((match) => match[1]));
  const { iconGifs } = await import(pathToFileURL(path.join(root, 'es/icon/gif.mjs')).href);
  for (const name of Object.keys(iconGifs)) expected.add(name);
  assert.deepEqual(new Set(icons.iconNames), expected);
  assert.equal(icons.iconNames.length, expected.size);
  for (const name of ['arrow', 'apps-o', 'copy', 'loading-building']) assert(icons.isBuiltinIcon(name));
});

test('支持英文、中文、组合关键词和空结果搜索，不要求用户输入完整名称', () => {
  assert(icons.searchIcons('ARROW').includes('arrow-left'));
  assert(icons.searchIcons('箭头 左').includes('arrow-left'));
  assert(icons.searchIcons('搜索').includes('search'));
  assert(icons.searchIcons('删除').includes('delete-o'));
  assert.equal(icons.searchIcons('').length, icons.iconNames.length);
  assert.deepEqual(icons.searchIcons('no-such-icon-123456'), []);
});

test('覆盖组件内图标和独立图标组件，不误处理尺寸、前缀、位置、开关及数据数组', () => {
  const property = (component, key) => catalog.getDefinition(component).properties.find((item) => item.key === key);
  for (const [component, key] of [['cell', 'rightIcon'], ['cell', 'labelIcon'], ['button', 'icon'], ['nav-bar', 'rightPopoverIcon'], ['icon', 'name'], ['steps', 'finishIcon']]) {
    assert(icons.isIconProperty(component, property(component, key)), `${component}.${key}`);
  }
  for (const [component, key] of [['cell', 'showIcon'], ['cell', 'iconPrefix'], ['button', 'iconPosition'], ['grid', 'iconSize'], ['grid', 'iconColor'], ['stepper', 'name']]) {
    assert(!icons.isIconProperty(component, property(component, key)), `${component}.${key}`);
  }
  assert(!icons.isIconProperty('custom', { key: 'icon', label: '图标', control: 'json' }));
});

test('选择框回显缩略图及原始参数，兼容图片和自定义名称，默认与无图标互相独立', async () => {
  const render = (modelValue) => renderToString(createSSRApp(Picker, { id: 'icon-field', label: '右侧图标', modelValue }));
  const html = await render('arrow');
  assert.match(html, /选择右侧图标/);
  assert.match(html, /van-icon-arrow/);
  assert.match(html, />arrow<\/span>/);
  assert.match(await render(undefined), />默认<\/span>/);
  assert.match(await render(''), />无图标<\/span>/);
  assert.match(await render('/assets/example.svg'), /src="\/assets\/example.svg"/);
  assert.match(await render('my-custom-icon'), /my-custom-icon/);
});

test('自定义入口保留安全图片与图标名，不接受脚本或 HTML', () => {
  for (const value of ['my-custom-icon', 'https://example.com/icon.png', '/assets/icon.svg', 'data:image/png;base64,YQ==']) assert(icons.validCustomIcon(value));
  for (const value of ['', 'javascript:alert(1)', 'data:text/html,hello', '<svg onload=alert(1)>']) assert(!icons.validCustomIcon(value));
});
