import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc';

const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'designer-node-tree-'));
const server = await createServer({ configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
const tree = await server.ssrLoadModule('/src/utils/nodeTree.ts');
const exports = await server.ssrLoadModule('/src/utils/exportDesign.ts');
const tokens = await server.ssrLoadModule('/src/utils/designTokens.ts');
await server.close();
await rm(cacheDir, { recursive: true, force: true });

test('规范选择器显示具体参数，保留单位、颜色和表达式语义', () => {
  assert.equal(tokens.tokenDisplayValue('var(--van-padding-md)', 'spacing'), '16px');
  assert.equal(tokens.tokenDisplayValue(0, 'spacing'), '0px');
  assert.equal(tokens.tokenDisplayValue('0', 'radius'), '0px');
  assert.equal(tokens.tokenDisplayValue(14, 'font-size'), '14px');
  assert.equal(tokens.tokenDisplayValue(-8, 'spacing'), '-8px');
  assert.equal(tokens.tokenDisplayValue('1rem', 'dimension'), '1rem');
  assert.equal(tokens.tokenDisplayValue('calc(100% - 16px)', 'dimension'), 'calc(100% - 16px)');
  assert.equal(tokens.tokenDisplayValue('1.5', 'line-height'), '1.5');
  assert.equal(tokens.tokenDisplayValue('transparent', 'color'), 'transparent');
  assert.equal(tokens.tokenDisplayValue('#246FE5', 'color'), '#246FE5');
});

function fixture() {
  return [
    { id: 'a', type: 'title-bar', props: { title: '设备信息' } },
    { id: 'b', type: 'progress', props: { percentage: 72 } },
    { id: 'c', type: 'field', props: { modelValue: '原始值', label: '名称' } },
    { id: 'd', type: 'button', props: { text: '提交' } },
  ];
}

test('编组保持页面顺序、节点标识及透明零间距默认值，不修改源文档', () => {
  const original = fixture();
  const result = tree.groupNodes(original, ['c', 'b'], 'g');
  assert.deepEqual(result.nodes.map((node) => node.id), ['a', 'g', 'd']);
  assert.deepEqual(result.group.children.map((node) => node.id), ['b', 'c']);
  assert.equal(result.group.props.fill, 'transparent');
  for (const key of ['borderRadius', 'gap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft']) {
    assert.equal(result.group.props[key], 0);
  }
  assert.equal(original.length, 4);
  assert(!original.some((node) => node.children));
});

test('非连续选择按画布顺序编组，不丢失未选中的图层', () => {
  const result = tree.groupNodes(fixture(), ['d', 'b'], 'g');
  assert.deepEqual(result.nodes.map((node) => node.id), ['a', 'g', 'c']);
  assert.deepEqual(result.group.children.map((node) => node.id), ['b', 'd']);
});

test('单个组件可创建父级容器，保持位置、标识和属性，解组后完整还原', () => {
  const original = fixture();
  assert.equal(tree.canGroupNodes(original, ['c']), true);
  const result = tree.groupNodes(original, ['c'], 'single');
  assert.deepEqual(result.nodes.map((node) => node.id), ['a', 'b', 'single', 'd']);
  assert.deepEqual(result.group.children, [original[2]]);
  assert.notEqual(result.group.children[0], original[2]);
  assert.equal(tree.findNode(result.nodes, 'c').parentId, 'single');
  assert.equal(result.group.props.fill, 'transparent');
  assert.equal(result.group.props.gap, 0);
  assert.deepEqual(tree.ungroupNode(result.nodes, 'single').nodes, original);
  assert.deepEqual(original.map((node) => node.id), ['a', 'b', 'c', 'd']);
});

test('组内单个组件及已有容器均可再嵌套父级容器，解组保留原层级', () => {
  const outer = tree.groupNodes(fixture(), ['b', 'c'], 'outer');
  const inner = tree.groupNodes(outer.nodes, ['c'], 'inner');
  assert.equal(tree.findNode(inner.nodes, 'inner').parentId, 'outer');
  assert.equal(tree.findNode(inner.nodes, 'c').parentId, 'inner');
  const nested = tree.groupNodes(inner.nodes, ['inner'], 'wrapper');
  assert.equal(tree.findNode(nested.nodes, 'wrapper').parentId, 'outer');
  assert.equal(tree.findNode(nested.nodes, 'inner').parentId, 'wrapper');
  const unwrapped = tree.ungroupNode(nested.nodes, 'wrapper');
  assert.deepEqual(unwrapped.nodes, inner.nodes);
  assert.deepEqual(tree.ungroupNode(unwrapped.nodes, 'inner').nodes, outer.nodes);
});

test('支持在容器内嵌套编组和解组', () => {
  const outer = tree.groupNodes(fixture(), ['a', 'b', 'c'], 'outer');
  const nested = tree.groupNodes(outer.nodes, ['b', 'c'], 'inner');
  assert.equal(tree.findNode(nested.nodes, 'inner').parentId, 'outer');
  const ungrouped = tree.ungroupNode(nested.nodes, 'inner');
  assert.deepEqual(ungrouped.childIds, ['b', 'c']);
  assert.deepEqual(tree.findNode(ungrouped.nodes, 'outer').node.children.map((node) => node.id), ['a', 'b', 'c']);
  assert.deepEqual(tree.ungroupNode(ungrouped.nodes, 'outer').nodes, fixture());
});

test('不同父级及父子混选不会生成无效分组', () => {
  const grouped = tree.groupNodes(fixture(), ['b', 'c'], 'g');
  assert.equal(tree.groupNodes(grouped.nodes, ['a', 'b'], 'bad'), null);
  assert.equal(tree.groupNodes(grouped.nodes, ['g', 'b'], 'bad'), null);
  assert.equal(tree.groupNodes(grouped.nodes, [], 'bad'), null);
  assert.equal(tree.groupNodes(grouped.nodes, ['missing'], 'bad'), null);
  assert.equal(tree.groupNodes(grouped.nodes, ['a', 'missing'], 'bad'), null);
  assert.equal(tree.groupNodes(grouped.nodes, ['a', 'a'], 'bad'), null);
});

test('拖入容器、拖到根级和同级排序保持唯一节点及属性', () => {
  const grouped = tree.groupNodes(fixture(), ['b', 'c'], 'g');
  const into = tree.moveNode(grouped.nodes, 'a', 1, 'g');
  assert.deepEqual(tree.findNode(into, 'g').node.children.map((node) => node.id), ['b', 'a', 'c']);
  const out = tree.moveNode(into, 'a', into.length, null);
  assert.deepEqual(out.map((node) => node.id), ['g', 'd', 'a']);
  assert.equal(tree.findNode(out, 'a').parentId, null);
  assert.deepEqual(tree.moveNode(out, 'a', 0).map((node) => node.id), ['a', 'g', 'd']);
  const ids = tree.flattenNodes(out).map((node) => node.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(tree.findNode(out, 'c').node.props.modelValue, '原始值');
});

test('容器不能拖入自身、子分组或普通组件', () => {
  const outer = tree.groupNodes(fixture(), ['a', 'b', 'c'], 'outer');
  const nested = tree.groupNodes(outer.nodes, ['b', 'c'], 'inner');
  assert.equal(tree.moveNode(nested.nodes, 'outer', 0, 'outer'), null);
  assert.equal(tree.moveNode(nested.nodes, 'outer', 0, 'inner'), null);
  assert.equal(tree.moveNode(nested.nodes, 'd', 0, 'a'), null);
  assert.equal(tree.moveNode(nested.nodes, 'missing', 0), null);
});

test('复制嵌套组为每个后代生成新标识，删除子图层不影响其他节点', () => {
  const grouped = tree.groupNodes(fixture(), ['b', 'c'], 'g');
  let count = 0;
  const copied = tree.duplicateNodes(grouped.nodes, ['g'], () => `copy-${++count}`);
  assert.equal(copied.selectedIds.length, 1);
  const all = tree.flattenNodes(copied.nodes);
  assert.equal(new Set(all.map((node) => node.id)).size, all.length);
  assert.equal(all.filter((node) => node.type === 'field').length, 2);
  const removed = tree.removeNodes(grouped.nodes, ['c']);
  assert.deepEqual(tree.findNode(removed, 'g').node.children.map((node) => node.id), ['b']);
  assert.deepEqual(tree.removeNodes(grouped.nodes, ['g']).map((node) => node.id), ['a', 'd']);
});

test('布局样式覆盖透明填充、圆角、四向内外边距和间距', () => {
  const { group } = tree.groupNodes(fixture(), ['b', 'c'], 'g');
  Object.assign(group.props, { fill: '#eef4ff', borderRadius: 12, paddingTop: 8, paddingRight: 16, paddingBottom: 24, paddingLeft: 32, marginLeft: -4, gap: 10 });
  const style = tree.getContainerStyle(group);
  assert.equal(style.background, '#eef4ff');
  assert.equal(style.borderRadius, '12px');
  assert.equal(style.paddingLeft, '32px');
  assert.equal(style.paddingBottom, '24px');
  assert.equal(style.marginLeft, '-4px');
  assert.equal(style.gap, '10px');
  assert.equal(style.flexDirection, 'column');
});

test('保存和 JSON 导出完整保留分组、嵌套组件属性及样式', () => {
  const grouped = tree.groupNodes(fixture(), ['b', 'c'], 'g');
  const design = { version: 1, title: '测试', nodes: grouped.nodes };
  const restored = JSON.parse(JSON.stringify(design));
  assert.deepEqual(tree.ungroupNode(restored.nodes, 'g').nodes, fixture());
  assert.deepEqual(JSON.parse(exports.toJson('测试', grouped.nodes)).components, grouped.nodes);
});

test('背景的颜色、间距及四向边距在保存和导出后仍然生效，恢复默认保留主题', () => {
  const background = {
    id: 'page-bg', type: 'background',
    props: { theme: 'gray', fill: 'var(--van-white)', gap: 'var(--van-padding-sm)', borderRadius: 8,
      paddingTop: 12, paddingRight: 16, paddingBottom: 20, paddingLeft: 24,
      marginTop: 4, marginRight: 8, marginBottom: 12, marginLeft: -4 },
    children: fixture(),
  };
  const original = JSON.stringify(background);
  const style = tree.getBackgroundStyle(background);
  assert.equal(style.background, 'var(--van-white)');
  assert.equal(style.gap, 'var(--van-padding-sm)');
  assert.equal(style.marginLeft, '-4px');
  assert.deepEqual(tree.getBackgroundProps(background), { theme: 'gray' });
  const restored = JSON.parse(exports.toJson('背景设置', [background])).components;
  assert.deepEqual(restored, [background]);
  const code = exports.toVueSfc('背景设置', restored);
  assert.match(code, /<Background theme="gray" :style=/);
  assert(code.includes('"background":"var(--van-white)"'));
  assert(code.includes('"gap":"var(--van-padding-sm)"'));
  assert(code.includes('"paddingBottom":"20px"'));
  assert(!code.includes(' fill=') && !code.includes(' margin-left='), '布局属性转为样式，不作为原生组件参数输出');
  const { descriptor, errors } = parse(code);
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: 'background-export' });
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: 'BackgroundExport.vue', id: 'background-export', compilerOptions: { bindingMetadata: script.bindings } }).errors, []);
  assert.match(exports.toMarkdown('背景设置', restored), /组件间距 var\(--van-padding-sm\)/);
  const reset = { ...background, props: { ...background.props, fill: undefined } };
  assert(!('background' in tree.getBackgroundStyle(reset)), '默认颜色继续由原生主题决定');
  assert.equal(tree.getBackgroundProps(reset).theme, 'gray');
  assert.equal(JSON.stringify(background), original);
});

test('Vue 导出递归保留布局和子组件状态，不导入虚构容器组件', () => {
  const outer = tree.groupNodes(fixture(), ['a', 'b', 'c'], 'outer');
  const nested = tree.groupNodes(outer.nodes, ['b', 'c'], 'inner');
  tree.findNode(nested.nodes, 'inner').node.props.fill = "var(--card, 'white')";
  tree.findNode(nested.nodes, 'inner').node.props.gap = 12;
  const code = exports.toVueSfc('测试页面', nested.nodes);
  assert.equal((code.match(/class="designer-container"/g) || []).length, 2);
  assert(code.includes('"gap":"12px"'));
  assert(code.includes("v-model=\"state['c']\""));
  assert(code.includes("'c': \"原始值\""));
  assert(!code.includes('ContainerGroup'));
  const { descriptor, errors } = parse(code);
  assert.deepEqual(errors, []);
  const script = compileScript(descriptor, { id: 'group-export' });
  const template = compileTemplate({ source: descriptor.template.content, filename: 'Export.vue', id: 'group-export', compilerOptions: { bindingMetadata: script.bindings } });
  assert.deepEqual(template.errors, []);
});

test('说明文档包含父子结构，链接只指向真实业务组件', () => {
  const grouped = tree.groupNodes(fixture(), ['b', 'c'], 'g');
  const markdown = exports.toMarkdown('测试', grouped.nodes);
  assert(markdown.includes('容器组（2）'));
  assert(markdown.includes('| 2.1 |'));
  assert(markdown.includes('https://meri-mobile.netlify.app/#/zh-CN/field'));
  assert(!markdown.includes('/zh-CN/container-group'));
});
