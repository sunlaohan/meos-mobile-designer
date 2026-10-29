import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-panel-search-'));
const server = await createServer({ configFile: false, plugins: [vue()], cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
let search, catalog, styles, helpers, Search, Highlight;
try {
  search = await server.ssrLoadModule('/src/utils/panelSearch.ts');
  catalog = await server.ssrLoadModule('/src/data/componentCatalog.ts');
  styles = (await server.ssrLoadModule('/src/data/componentStyles.ts')).componentStyles;
  helpers = await server.ssrLoadModule('/src/utils/componentStyles.ts');
  Search = (await server.ssrLoadModule('/src/components/PanelSearch.vue')).default;
  Highlight = (await server.ssrLoadModule('/src/components/SearchHighlight.vue')).default;
} finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }); }

test('样式搜索覆盖折叠区域外的全部变体，支持中英文名称和属性名', () => {
  assert(styles.field.items.findIndex(({ id }) => id === 'unit') >= 6);
  assert(search.filterComponentStyles(styles.field.items, '单位').some(({ id }) => id === 'unit'));
  assert(search.filterComponentStyles(styles.field.items, 'PASSWORD').some(({ id }) => id === 'password'));
  assert(search.filterComponentStyles(styles.field.items, '多行 文本').some(({ id }) => id === 'textarea'));
  assert(search.filterComponentStyles(styles.field.items, 'left-icon').some(({ id }) => id === 'icon'));
  assert(search.filterComponentStyles(styles.button.items, 'round button').some(({ id }) => id === 'round'));
  assert.deepEqual(search.filterComponentStyles(styles.field.items, '没有这种样式-491'), []);
});

test('状态搜索支持中文、英文、组合关键词及属性命名形式，并遵守原有显隐依赖', () => {
  const node = catalog.createNode('cell');
  const schemas = helpers.visibleComponentProperties(node, catalog.getDefinition('cell')).filter(({ group }) => group === '状态');
  assert(search.filterPropertySchemas(schemas, '标签').some(({ key }) => key === 'showWrapTags'));
  assert(search.filterPropertySchemas(schemas, 'SHOW_WRAP_TAGS').some(({ key }) => key === 'showWrapTags'));
  assert(search.filterPropertySchemas(schemas, '三行 boolean').some(({ key }) => key === 'threeLine'));
  assert(!search.filterPropertySchemas(schemas, 'description-clickable').length);
  const field = catalog.createNode('field');
  const states = helpers.visibleComponentProperties(field, catalog.getDefinition('field')).filter(({ group }) => group === '状态');
  assert(search.filterPropertySchemas(states, 'READ-ONLY').some(({ key }) => key === 'readonly'));
  assert(search.filterPropertySchemas(states, '清除').some(({ key }) => key === 'clearable'));
  assert.deepEqual(search.filterPropertySchemas(states, '没有这种状态-491'), []);
});

test('空搜索恢复全部数据，筛选不修改样式、属性或当前业务数据', () => {
  assert.deepEqual(search.filterComponentStyles(styles.field.items, '  '), styles.field.items);
  const before = styles.field.items.find(({ id }) => id === 'unit');
  assert.equal(search.filterComponentStyles(styles.field.items, '单位').find(({ id }) => id === 'unit'), before);
  const schemas = catalog.getDefinition('field').properties;
  assert.deepEqual(search.filterPropertySchemas(schemas, ''), schemas);
  assert.equal(search.matchesPanelSearch('RＥＡＤ-ＯＮＬＹ', ['readonly']), true);
});

test('搜索框提供可访问名称、独立清空按钮及已输入内容', async () => {
  const html = await renderToString(createSSRApp(Search, { modelValue: '标签', label: '搜索组件样式', placeholder: '搜索样式名称或英文属性' }));
  assert.match(html, /type="search"/);
  assert.match(html, /aria-label="搜索组件样式"/);
  assert.match(html, /value="标签"/);
  assert.match(html, /aria-label="清除搜索组件样式"/);
  const empty = await renderToString(createSSRApp(Search, { modelValue: '', label: '搜索状态', placeholder: '搜索状态名称或英文属性' }));
  assert.match(empty, /aria-label="搜索状态"/);
  assert.doesNotMatch(empty, /aria-label="清除搜索状态"/);
});

test('匹配文字高亮覆盖重复、组合和重叠关键词，保持原始文字完整', () => {
  const text = '单元格与三行单元格';
  const parts = search.highlightPanelSearch(text, '单元格 三行');
  assert.equal(parts.map(({ text }) => text).join(''), text);
  assert.deepEqual(parts.filter(({ matched }) => matched).map(({ text }) => text), ['单元格', '三行单元格']);
  assert.deepEqual(search.highlightPanelSearch('图标', '图 图标'), [{ text: '图标', matched: true }]);
});

test('高亮沿用搜索的大小写及命名归一化规则，兼容全角、组合字符和字面符号', () => {
  const marked = (text, query) => search.highlightPanelSearch(text, query).filter(({ matched }) => matched).map(({ text }) => text);
  assert.deepEqual(marked('show-wrap-tags · boolean', 'SHOW_WRAP'), ['show-wrap']);
  assert.deepEqual(marked('Readonly / readonly', 'READ_ONLY'), ['Readonly', 'readonly']);
  assert.deepEqual(marked('ＡＢＣ é e\u0301', 'abc é'), ['ＡＢＣ', 'é', 'e\u0301']);
  assert.deepEqual(marked('前缀 a+b.[x] 后缀', 'a+b.[x]'), ['a+b.[x]']);
});

test('清空或没有命中时恢复普通文本，高亮不解释搜索词或内容中的 HTML', async () => {
  assert.deepEqual(search.highlightPanelSearch('只读', '  '), [{ text: '只读', matched: false }]);
  assert.deepEqual(search.highlightPanelSearch('只读', '不存在'), [{ text: '只读', matched: false }]);
  const html = await renderToString(createSSRApp(Highlight, { text: '<img src=x onerror=alert(1)>只读', query: '<img 只读' }));
  assert.match(html, /class="panel-search-match"/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img\b/);
  assert.match(html, />只读<\/mark>/);
  const cleared = await renderToString(createSSRApp(Highlight, { text: '只读', query: '' }));
  assert.doesNotMatch(cleared, /<mark/);
});
