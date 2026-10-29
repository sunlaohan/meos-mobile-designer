import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const designer = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const account = await readFile(new URL('../src/account.css', import.meta.url), 'utf8');
const rule = (css, selector) => {
  const start = css.startsWith(`${selector} {`) ? 0 : css.indexOf(`\n${selector} {`) + 1;
  assert(css.slice(start).startsWith(`${selector} {`), `缺少样式规则：${selector}`);
  return css.slice(start, css.indexOf('}', start) + 1);
};

test('产品主题色集中定义为 #246FE5，透明色和派生状态共享同一来源', () => {
  const root = rule(designer, ':root');
  assert.match(root, /--accent:\s*#246FE5;/);
  assert.match(root, /--accent-rgb:\s*36 111 229;/);
  assert.match(root, /--accent-2:\s*var\(--accent\);/);
  for (const token of ['hover', 'text', 'soft', 'muted']) {
    assert.match(root, new RegExp(`--accent-${token}: color-mix\\(in srgb, var\\(--accent\\)`));
  }
  assert.doesNotMatch(designer + account, /#(?:4d8dff|2f74ea|3e82f3|7667f5|4a85ed|6197f5)|rgb\((?:77 141 255|118 103 245)\s*\//i);
});

test('主要操作、开关、画布选中态和账号页面统一使用主题变量', () => {
  for (const selector of ['.brand-mark', '.send-button', '.export-button', '.canvas-node.selected', '.selection-label', '.property-switch.checked']) {
    assert.match(rule(designer, selector), /var\(--accent\)/);
  }
  assert.match(rule(designer, '.primary-toolbar-button'), /var\(--accent-2\)/);
  assert.match(rule(account, '.account-primary'), /background: var\(--accent\)/);
  assert.match(rule(account, '.account-primary:hover:not(:disabled)'), /var\(--accent-hover\)/);
});

test('焦点与拖拽高亮使用相同主题色，不引入覆盖设计稿组件的全局主题', () => {
  for (const selector of ['.search-box:focus-within', '.canvas-drop-highlight', '.layer-row.drop-inside']) {
    assert.match(rule(designer, selector), /var\(--accent\)/);
  }
  assert.match(rule(designer, '.layer-row.selected'), /rgb\(var\(--accent-rgb\)\s*\//);
  assert.doesNotMatch(rule(designer, ':root'), /--van-(?:primary-color|blue):/);
});
