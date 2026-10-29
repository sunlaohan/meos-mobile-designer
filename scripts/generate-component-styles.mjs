import fs from 'node:fs';
import path from 'node:path';
import { babelParse, compileTemplate, parse as parseSfc } from '@vue/compiler-sfc';
import * as library from 'persagy-vant';
import { canvasPanelTypes } from '../shared/association-controls.mjs';

const root = '/Users/sunlei/Component/persagy-vant/packages/persagy-mobile/src';
const camel = (name) => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
const components = new Map(Object.values(library).flatMap((entry) => {
  const component = entry?.Component || entry;
  return component?.name && (component.props || component.setup || component.render) ? [[component.name.replace(/^van-/, ''), component]] : [];
}));
const aliases = { tab: 'tabs', col: 'row' };
const blocked = new Set(['__proto__', 'prototype', 'constructor', 'url', 'to', 'href', 'noteUrl', 'noteTo', 'teleport', 'class', 'style']);
function literal(node, symbols) {
  if (!node) return undefined;
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type)) return node.value;
  if (node.type === 'NullLiteral') return null;
  if (node.type === 'Identifier') return Object.hasOwn(symbols, node.name) ? symbols[node.name] : undefined;
  if (node.type === 'MemberExpression') {
    const key = node.computed ? literal(node.property, symbols) : node.property.name;
    if (['__proto__', 'constructor', 'prototype'].includes(key)) return undefined;
    const object = node.object.type === 'Identifier' && ['_ctx', '$setup'].includes(node.object.name) ? symbols : literal(node.object, symbols);
    return object && Object.hasOwn(object, key) ? object[key] : undefined;
  }
  if (node.type === 'UnaryExpression' && node.operator === '-') { const value = literal(node.argument, symbols); return typeof value === 'number' ? -value : undefined; }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = literal(node.left, symbols), right = literal(node.right, symbols);
    if (['string', 'number'].includes(typeof left) && ['string', 'number'].includes(typeof right)) return left + right;
  }
  if (node.type === 'ArrayExpression') {
    const values = node.elements.map((item) => literal(item, symbols));
    return values.every((value) => value !== undefined) ? values : undefined;
  }
  if (node.type === 'ObjectExpression') {
    const value = {};
    for (const property of node.properties) {
      if (property.type !== 'ObjectProperty' || property.computed) continue;
      const key = property.key.name ?? property.key.value;
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
      const entry = literal(property.value, symbols);
      if (entry !== undefined) value[key] = entry;
    }
    return value;
  }
  if (node.type === 'CallExpression' && ['ref', 'reactive'].includes(node.callee.name)) return literal(node.arguments[0], symbols);
  if (node.type === 'TemplateLiteral') {
    const values = node.expressions.map((expression) => literal(expression, symbols));
    if (values.some((value) => value === undefined)) return undefined;
    return node.quasis.map((quasi, index) => quasi.value.cooked + (values[index] ?? '')).join('');
  }
  return undefined;
}
function expression(source, symbols) {
  try { return literal(babelParse(`(${source})`, { plugins: ['typescript'] }).program.body[0]?.expression, symbols); }
  catch { return undefined; }
}
function readSymbols(source, initial = {}) {
  const symbols = { ...initial };
  try {
    const tree = babelParse(source, { sourceType: 'module', plugins: ['typescript'] });
    for (let pass = 0; pass < 3; pass += 1) for (const statement of tree.program.body) {
      if (statement.type === 'VariableDeclaration') for (const declaration of statement.declarations) {
        if (declaration.id.type !== 'Identifier') continue;
        const value = literal(declaration.init, symbols);
        if (value !== undefined) symbols[declaration.id.name] = value;
      }
      if (statement.type === 'ExportDefaultDeclaration' && statement.declaration.type === 'ObjectExpression') {
        for (const method of statement.declaration.properties.filter((property) => property.type === 'ObjectMethod' && ['data', 'setup'].includes(property.key.name))) {
          for (const child of method.body.body) {
            if (child.type === 'VariableDeclaration') for (const declaration of child.declarations) {
              if (declaration.id.type !== 'Identifier') continue;
              const value = literal(declaration.init, symbols);
              if (value !== undefined) symbols[declaration.id.name] = value;
            }
            if (child.type === 'ReturnStatement') Object.assign(symbols, literal(child.argument, symbols) || {});
          }
        }
      }
    }
  } catch { /* Code samples may be fragments. Never execute them. */ }
  return symbols;
}
function nativeNode(element, symbols, loop = true) {
  if (element.type === 11) {
    const value = expression(element.source.content, symbols);
    const items = typeof value === 'number' ? Array.from({ length: Math.min(6, value) }, (_, index) => index + 1) : Array.isArray(value) ? value.slice(0, 6) : [];
    return items.flatMap((item, index) => (element.children || []).flatMap((child) => nativeNode(child, { ...symbols, [element.valueAlias.content]: item, ...(element.keyAlias ? { [element.keyAlias.content]: index } : {}) })));
  }
  if (element.type === 9) {
    const branch = element.branches.find((branch) => !branch.condition || expression(branch.condition.content, symbols) !== false);
    return (branch?.children || []).flatMap((child) => nativeNode(child, symbols));
  }
  if (element.type !== 1) return [];
  const iteration = element.props.find((prop) => prop.type === 7 && prop.name === 'for');
  if (loop && iteration?.exp) {
    const match = iteration.exp.content.match(/^\s*\(?\s*(\w+)(?:\s*,\s*(\w+))?\s*\)?\s+(?:in|of)\s+([\s\S]+)$/);
    const items = match && expression(match[3], symbols);
    const values = typeof items === 'number' ? Array.from({ length: Math.min(6, items) }, (_, index) => index + 1) : Array.isArray(items) ? items.slice(0, 6) : [];
    return match ? values.flatMap((value, index) => nativeNode(element, { ...symbols, [match[1]]: value, ...(match[2] ? { [match[2]]: index } : {}) }, false)) : [];
  }
  const type = element.tag.replace(/^van-/, '');
  const component = components.get(type);
  if (!component && element.tag === 'img') {
    const src = element.props.find((prop) => prop.type === 6 && prop.name === 'src' || prop.type === 7 && prop.name === 'bind' && prop.arg?.content === 'src');
    const value = src?.type === 6 ? src.value?.content : src?.exp ? expression(src.exp.content, symbols) : undefined;
    return value ? [{ type: 'image', props: { src: value, height: 140, width: '100%', fit: 'cover' } }] : [];
  }
  if (!component) return (element.children || []).flatMap((child) => nativeNode(child, symbols));
  const props = {};
  for (const prop of element.props) {
    const name = prop.type === 6 ? prop.name : prop.type === 7 && prop.name === 'bind' ? prop.arg?.content : prop.type === 7 && prop.name === 'model' ? prop.arg?.content || 'model-value' : '';
    const key = camel(name || '');
    if (!key || blocked.has(key) || !(key in (component.props || {}))) continue;
    const descriptor = component.props[key];
    const value = prop.type === 6 ? prop.value?.content ?? true : expression(prop.exp?.content || prop.exp?.loc?.source || '', symbols);
    if (value !== undefined) props[key] = (descriptor === Boolean || descriptor?.type === Boolean) && value === '' ? true : value;
  }
  if ('show' in props && canvasPanelTypes.includes(type)) props.show = false;
  const children = (element.children || []).flatMap((child) => nativeNode(child, symbols));
  const text = (child) => child.type === 2 ? child.content.trim() : child.type === 5 ? expression(child.content.content || child.content.loc?.source || '', symbols) ?? '' : child.type === 12 ? text(child.content) : child.type === 8 ? child.children.filter((part) => typeof part === 'object').map(text).join('') : child.type === 1 && !child.tag.startsWith('van-') ? (child.children || []).map(text).filter(Boolean).join(' ') : '';
  const content = (element.children || []).map(text).filter(Boolean).join(' ');
  return [{ type, props, ...(children.length ? { children } : {}), ...(content ? { content } : {}) }];
}

const result = {};
// Keep data modes (single/multiple/cascading columns, disabled items) distinct
// while deduplicating examples that differ only in business copy.
function dataShape(value) {
  if (Array.isArray(value)) return [...new Set(value.map((entry) => JSON.stringify(dataShape(entry))))].sort();
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, dataShape(entry)]));
  return typeof value === 'boolean' ? value : typeof value;
}
function childShape(node) {
  return [node.type, Object.fromEntries(Object.entries(node.props).map(([key, value]) => [key, /title|label|text|message|description|placeholder|location|content/i.test(key) ? dataShape(value) : value])), node.children?.map(childShape), !!node.content];
}
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const readme = path.join(root, entry.name, 'README.zh-CN.md');
  if (!fs.existsSync(readme)) continue;
  const target = aliases[entry.name] || entry.name;
  if (!components.has(target)) continue;
  const source = fs.readFileSync(readme, 'utf8').split(/\n## API\b/)[0];
  let demoSymbols = {};
  const demo = path.join(root, entry.name, 'demo/index.vue');
  if (fs.existsSync(demo)) {
    const { descriptor } = parseSfc(fs.readFileSync(demo, 'utf8'));
    demoSymbols = readSymbols(descriptor.scriptSetup?.content || descriptor.script?.content || '');
  }
  const styles = []; const seen = new Set();
  for (const section of source.split(/\n(?=### )/)) {
    const name = section.match(/^### (.+)/)?.[1] || '基础用法';
    if (['介绍', '引入', '页面导航', '跳转路由', '动态设置选项', '异步加载选项', '父级异步加载', '异步切换', '选项过滤器', '格式化输入内容'].includes(name)) continue;
    const blocks = [...section.matchAll(/```(?:html|vue|js|javascript|ts)?\s*\n([\s\S]*?)```/g)].map((match) => match[1]);
    const symbols = blocks.reduce((values, block) => readSymbols(block.replace(/<script[^>]*>([\s\S]*?)<\/script>/g, '$1'), values), demoSymbols);
    for (const block of blocks.filter((code) => code.includes('<van-'))) {
      const template = block.match(/<template[^>]*>([\s\S]*?)<\/template>/)?.[1] || block.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
      let tree;
      try { tree = compileTemplate({ source: template, filename: 'Example.vue', id: 'documented-style' }).ast; } catch { continue; }
      function visit(elements) {
        for (const element of elements || []) {
          if (element.type !== 1) { visit(element.children || element.branches?.flatMap((branch) => branch.children)); continue; }
          if (element.tag === `van-${target}`) {
            const native = nativeNode(element, symbols)[0];
            if (!native) continue;
            const seedKeys = new Set(Object.keys(native.props).filter((key) => (typeof native.props[key] !== 'boolean' && (/^(?:title|label|text|value|message|description|placeholder|location|content)$/i.test(key) || /Text$/.test(key))) || (key === 'modelValue' && typeof native.props[key] !== 'boolean') || Array.isArray(native.props[key]) || (native.props[key] && typeof native.props[key] === 'object')));
            const props = Object.fromEntries(Object.entries(native.props).filter(([key]) => !seedKeys.has(key)));
            const seeds = Object.fromEntries(Object.entries(native.props).filter(([key]) => seedKeys.has(key)));
            const signature = JSON.stringify([props, dataShape(seeds), native.children?.map(childShape), !!native.content]);
            if (seen.has(signature)) continue;
            seen.add(signature);
            styles.push({ id: `docs-${styles.length + 1}`, name, props, seeds, ...(native.children ? { children: native.children } : {}), ...(native.content ? { content: native.content } : {}) });
          } else visit(element.children);
        }
      }
      visit(tree?.children);
    }
  }
  if (!styles.length) continue;
  const counts = {};
  for (const style of styles) counts[style.name] = (counts[style.name] || 0) + 1;
  const indices = {};
  for (const style of styles) if (counts[style.name] > 1) style.name += ` ${indices[style.name] = (indices[style.name] || 0) + 1}`;
  const keys = new Set(styles.flatMap((style) => Object.keys(style.props)));
  const reset = Object.fromEntries([...keys].map((key) => [key, null]));
  result[target] = { reset, items: styles, docsPath: entry.name };
  if (entry.name === 'tab') result[entry.name] = { ...result[target], nativeType: target };
}
const out = new URL('../src/data/generatedComponentStyles.json', import.meta.url);
const content = JSON.stringify(result, null, 2) + '\n';
if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== content) fs.writeFileSync(out, content);
console.log(`Generated documented styles for ${Object.keys(result).length} component types.`);
