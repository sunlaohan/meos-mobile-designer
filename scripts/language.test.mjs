import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import { createServer } from 'vite';

const source = await fs.readFile(new URL('../src/utils/language.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ES2022 } }).outputText;
const { createLanguageController, LANGUAGE_STORAGE_KEY, LEGACY_LANGUAGE_STORAGE_KEY } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
function browser({ url = '/app', saved, legacy, locale = 'zh-CN', blocked = false } = {}) {
  const listeners = new Map(), storage = new Map();
  if (saved !== undefined) storage.set(LANGUAGE_STORAGE_KEY, saved);
  if (legacy !== undefined) storage.set(LEGACY_LANGUAGE_STORAGE_KEY, legacy);
  const host = {
    location: new URL(url, 'https://compose.example'), navigator: { language: locale },
    history: { state: { pageId: 'preserved' }, replaceState(state, _, url) { this.state = state; host.location = new URL(url, host.location); } },
    get localStorage() { if (blocked) throw Error('Storage blocked'); return { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }; },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
  };
  return { host, storage, external: (value, key = LANGUAGE_STORAGE_KEY) => listeners.get('storage')?.({ key, newValue: value }), listeners };
}

test('语言链接优先于已保存偏好，同时兼容官网旧偏好与浏览器语言', () => {
  for (const [options, expected] of [
    [{ url: '/login?lang=en', saved: 'zh' }, 'en'],
    [{ saved: 'zh', locale: 'en-US' }, 'zh'],
    [{ legacy: 'en' }, 'en'],
    [{ locale: 'en-GB' }, 'en'],
    [{ locale: 'fr-FR' }, 'zh'],
    [{ url: '/app?lang=invalid', saved: 'en' }, 'en'],
  ]) {
    const env = browser(options), manager = createLanguageController(env.host, () => {});
    assert.equal(manager.language, expected); manager.dispose();
  }
});
test('切换语言保留页面、管理员、注册、邮件回调参数和历史状态', () => {
  for (const url of ['/app?page=abc&preview=1', '/?admin=1', '/login?register=1', '/?recovery=1&code=callback#type=recovery']) {
    const env = browser({ url }); const before = new URL(env.host.location);
    const manager = createLanguageController(env.host, () => {}); manager.setLanguage('en');
    assert.equal(env.host.location.searchParams.get('lang'), 'en');
    for (const [key, value] of before.searchParams) assert.equal(env.host.location.searchParams.get(key), value);
    assert.equal(env.host.location.hash, before.hash);
    assert.deepEqual(env.host.history.state, { pageId: 'preserved' });
    assert.equal(env.storage.get(LANGUAGE_STORAGE_KEY), 'en'); manager.dispose();
    assert.equal(createLanguageController(env.host, () => {}).language, 'en');
  }
});
test('跨标签同步语言，忽略无关或无效值，存储不可用时仍可切换', () => {
  const env = browser(), applied = [];
  const manager = createLanguageController(env.host, value => applied.push(value));
  env.external('en'); env.external('bad'); env.external('zh', 'other');
  assert.deepEqual(applied, ['zh', 'en']);
  manager.dispose(); assert.equal(env.listeners.size, 0);
  const privateMode = browser({ blocked: true });
  const temporary = createLanguageController(privateMode.host, () => {});
  assert.doesNotThrow(() => temporary.setLanguage('en')); assert.equal(temporary.language, 'en'); temporary.dispose();
});
test('翻译提示并保留插入的页面名称、文档字段和属性原值', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  const previous = { window: global.window, document: global.document, location: global.location };
  try {
    const env = browser({ url: '/app?lang=en' });
    const i18n = await server.ssrLoadModule('/src/utils/i18n.ts');
    global.window = env.host; global.location = env.host.location; global.document = { documentElement: { dataset: {} }, title: '' };
    i18n.initializeLanguage('product');
    assert.equal(i18n.t('我的页面'), 'My pages');
    assert.equal(i18n.t('已创建 3 个激活码，可复制后下发。'), 'Created 3 activation codes. Copy them to share.');
    const title = '我的页面 · {1} · 原始中文';
    assert.equal(i18n.t('“{0}”将从你的页面列表移除。', [title]), `“${title}” will be removed from your page list.`);
    const definition = { name: '未收录组件', englishName: 'CustomWidget' }, schema = { label: '未收录属性', key: 'safeAreaInsetBottom' };
    assert.equal(i18n.componentName(definition), 'Custom Widget'); assert.equal(i18n.propertyName(schema), 'Safe Area Inset Bottom');
    assert.equal(definition.name, '未收录组件'); assert.equal(schema.label, '未收录属性');
    i18n.useI18n().setLanguage('zh'); assert.equal(i18n.t('我的页面'), '我的页面');
    assert.equal(i18n.t('“{0}”将从你的页面列表移除。', [title]), `“${title}”将从你的页面列表移除。`);
  } finally { Object.assign(global, previous); await server.close(); }
});
