import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

const source = await fs.readFile(new URL('../src/utils/theme.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ES2022 } }).outputText;
const { createThemeController, THEME_STORAGE_KEY } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function browser({ saved = null, dark = false, blocked = false } = {}) {
  const events = new Map(), system = new Map();
  const media = { matches: dark, addEventListener: (name, fn) => system.set(name, fn), removeEventListener: name => system.delete(name) };
  const storage = new Map(saved === null ? [] : [[THEME_STORAGE_KEY, saved]]);
  return {
    host: {
      matchMedia: () => media,
      get localStorage() { if (blocked) throw Error('Storage blocked'); return { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }; },
      addEventListener: (name, fn) => events.set(name, fn), removeEventListener: name => events.delete(name),
    },
    storage,
    changeSystem(value) { media.matches = value; system.get('change')?.(); },
    externalChange(value, key = THEME_STORAGE_KEY) { events.get('storage')?.({ key, newValue: value }); },
    listenerCount: () => events.size + system.size,
  };
}

test('首次访问跟随系统，未选择时响应系统模式变化', () => {
  for (const dark of [true, false]) {
    const env = browser({ dark }), applied = [];
    const manager = createThemeController(env.host, theme => applied.push(theme));
    assert.equal(manager.theme, dark ? 'dark' : 'light');
    env.changeSystem(!dark);
    assert.deepEqual(applied, dark ? ['dark', 'light'] : ['light', 'dark']);
    manager.dispose(); assert.equal(env.listenerCount(), 0);
  }
});
test('手动切换跨页面保存，后续系统变化不会覆盖用户选择', () => {
  const env = browser({ saved: 'light', dark: true });
  const manager = createThemeController(env.host, () => {});
  assert.equal(manager.theme, 'light'); manager.toggle();
  assert.equal(manager.theme, 'dark'); assert.equal(env.storage.get(THEME_STORAGE_KEY), 'dark');
  env.changeSystem(false); assert.equal(manager.theme, 'dark'); manager.dispose();
  const nextPage = createThemeController(env.host, () => {}); assert.equal(nextPage.theme, 'dark'); nextPage.dispose();
});
test('浏览器标签页同步主题，清除选择后恢复跟随系统', () => {
  const env = browser({ saved: 'dark' });
  const manager = createThemeController(env.host, () => {});
  env.externalChange('light'); assert.equal(manager.theme, 'light');
  env.externalChange('dark', 'unrelated'); assert.equal(manager.theme, 'light');
  env.externalChange(null); env.changeSystem(true); assert.equal(manager.theme, 'dark');
  manager.dispose();
});
test('无效偏好与不可用的浏览器存储均不影响主题切换', () => {
  for (const options of [{ saved: 'invalid' }, { blocked: true }]) {
    const env = browser(options), manager = createThemeController(env.host, () => {});
    assert.equal(manager.theme, 'light'); assert.doesNotThrow(() => manager.toggle());
    assert.equal(manager.theme, 'dark'); manager.dispose();
  }
});
