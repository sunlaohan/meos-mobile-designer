import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const block = (selector) => {
  const index = styles.indexOf(`\n${selector}`);
  assert(index >= 0, `缺少模拟器样式：${selector}`);
  return styles.slice(index, styles.indexOf('}', index) + 1);
};

test('人员面板以手机高度而非桌面 100vh 计算，并限制在关联编辑区域内', () => {
  const frame = block('.phone-frame {');
  assert.match(frame, /--phone-screen-height:\s*844px;/);
  assert.match(frame, /height:\s*var\(--phone-screen-height\)/);
  assert.match(frame, /--phone-viewport-height:\s*calc\(var\(--phone-screen-height\)/);
  const panels = block('.phone-panel-layer .van-single-person-select,');
  assert.match(panels, /\.phone-panel-layer \.van-multi-person-select\s*\{/);
  assert.match(panels, /height:\s*calc\(var\(--phone-screen-height\) - 96px\)/);
  assert.match(panels, /max-height:\s*100%/);
  assert.doesNotMatch(panels, /\d(?:d|s|l)?vh/);
  assert.match(block('.phone-frame--editing-associated .phone-panel-layer'), /top:\s*calc\(var\(--phone-status-bar-height\) \+ var\(--phone-associated-bar-height\)\)/);
});

test('多人已选面板同样使用手机视口，人员列表滚动不传递给外部画布', () => {
  assert.match(block('.phone-panel-layer .van-multi-person-select__selected-panel'), /max-height:\s*min\(340px, calc\(var\(--phone-viewport-height\) - 156px\)\)/);
  const bodies = block('.phone-panel-layer .van-single-person-select__body,');
  assert.match(bodies, /\.phone-panel-layer \.van-multi-person-select__body/);
  assert.match(bodies, /overscroll-behavior-y:\s*contain/);
});

test('修正仅作用于模拟器，不修改原始面板属性及导出的真实移动页面', async () => {
  const renderer = await readFile(new URL('../src/components/DynamicPanelRenderer.vue', import.meta.url), 'utf8');
  assert.match(renderer, /\.\.\.props\.node\.props/);
  assert.doesNotMatch(renderer, /(?:single|multi)-person-select.*(?:height|style)/);
  const exports = await readFile(new URL('../src/utils/exportDesign.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(exports, /phone-screen-height|phone-panel-layer/);
});
