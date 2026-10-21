import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const componentRoot = '/Users/sunlei/Component/persagy-vant/packages/persagy-mobile/src';
const outputFile = path.join(projectDir, 'src/data/generatedComponentMetadata.json');

function writeJson(file, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) fs.writeFileSync(file, content);
}

function splitMarkdownRow(line) {
  const cells = [];
  let current = '';
  let escaped = false;
  for (const character of line.trim().replace(/^\|/, '').replace(/\|$/, '')) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
      current += character;
    } else if (character === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

function plain(value) {
  return value
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/^_([^_]*)_$/, '$1')
    .replace(/\\\|/g, '|')
    .trim();
}

function readProps(readmePath) {
  const lines = fs.readFileSync(readmePath, 'utf8').split(/\r?\n/);
  const attributes = new Map();

  for (let index = 0; index < lines.length - 2; index += 1) {
    if (!lines[index].trim().startsWith('|')) continue;
    const header = splitMarkdownRow(lines[index]);
    if (plain(header[0]) !== '参数') continue;
    if (!/^\s*\|?\s*:?-+/.test(lines[index + 1])) continue;

    for (let row = index + 2; row < lines.length && lines[row].trim().startsWith('|'); row += 1) {
      const cells = splitMarkdownRow(lines[row]);
      if (cells.length < 4) continue;
      const name = plain(cells[0]).replace(/\s+v\d[\d.]*$/, '').trim();
      if (!name || name === '参数') continue;
      attributes.set(name, {
        name,
        description: plain(cells[1]),
        type: plain(cells[2]),
        default: cells[3].trim(),
      });
    }
  }

  return [...attributes.values()];
}

const metadata = {};
for (const entry of fs.readdirSync(componentRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const readmePath = path.join(componentRoot, entry.name, 'README.zh-CN.md');
  if (!fs.existsSync(readmePath)) continue;
  metadata[entry.name] = { attributes: readProps(readmePath) };
}

writeJson(outputFile, metadata);
console.log(`Generated component metadata for ${Object.keys(metadata).length} component directories.`);

// Use the documentation's own navigation rather than maintaining another category list.
const { default: libraryConfig } = await import(pathToFileURL(path.resolve(componentRoot, '../vant.config.mjs')).href);
const navigation = libraryConfig.site.locales['zh-CN'].nav
  .filter((group) => group.title.endsWith('组件'))
  .map(({ title, items }) => ({ title, items: items.map(({ path: docsPath, title: itemTitle }) => ({ path: docsPath, title: itemTitle })) }));
writeJson(path.join(projectDir, 'src/data/generatedComponentNavigation.json'), navigation);
console.log(`Generated ${navigation.length} component categories from the documentation navigation.`);

// Read the stylesheet actually loaded by the designer, so every offered variable exists at runtime.
const css = fs.readFileSync(path.resolve(componentRoot, '../lib/index.css'), 'utf8');
const iconNames = new Set([...css.matchAll(/\.van-icon-([\w-]+):{1,2}before\b/g)].map((match) => match[1]));
const { iconGifs } = await import(pathToFileURL(path.resolve(componentRoot, '../es/icon/gif.mjs')).href);
for (const name of Object.keys(iconGifs)) iconNames.add(name);
writeJson(path.join(projectDir, 'src/data/generatedIconNames.json'), [...iconNames].sort());
console.log(`Generated ${iconNames.size} available icon names from the installed icon styles and GIF registry.`);
const publicVariables = fs.readFileSync(path.join(componentRoot, 'style/css-variables.less'), 'utf8').split(':root.van-theme-dark')[0];
const publicNames = new Set([...publicVariables.matchAll(/(--van-[\w-]+)\s*:/g)].map((match) => match[1]));
const variables = new Map();
for (const rule of css.matchAll(/:root\s*\{([^}]+)\}/g)) {
  for (const match of rule[1].matchAll(/(--van-[\w-]+)\s*:\s*([^;]+);?/g)) {
    variables.set(match[1], match[2].trim());
  }
}

function resolveVariable(value, seen = new Set()) {
  return value.replace(/var\((--van-[\w-]+)\)/g, (reference, name) => {
    if (seen.has(name) || !variables.has(name)) return reference;
    return resolveVariable(variables.get(name), new Set([...seen, name]));
  });
}

function tokenKind(name, value) {
  if (/font-size(?:-(?:xs|sm|md|lg|xl))?$/.test(name)) return 'font-size';
  if (/line-height(?:-(?:xs|sm|md|lg|xl))?$/.test(name)) return 'line-height';
  if (/radius/.test(name)) return 'radius';
  if (/border-width/.test(name)) return 'border-width';
  if (/padding|margin|gap|gutter/.test(name) && !/auto/.test(value)) return 'spacing';
  if (/^(?:#|rgba?\(|hsla?\(|(?:repeating-)?(?:linear|radial)-gradient\(|transparent$|white$|black$)/i.test(resolveVariable(value))) return 'color';
  if (/(?:width|height|size)(?:-(?:base|xs|sm|md|lg|xl))?$/.test(name) && /^(?:\d*\.?\d+(?:px|rem|em|%)?|var\(|calc\()/.test(value)) return 'dimension';
  return null;
}

const componentNames = Object.keys(metadata).sort((a, b) => b.length - a.length);
const tokens = [...variables].flatMap(([name, value]) => {
  const kind = tokenKind(name, value);
  if (!kind) return [];
  const scope = publicNames.has(name) ? 'public' : componentNames.find((component) => name.startsWith(`--van-${component}-`));
  return scope ? [{ name, value, kind, scope }] : [];
});
writeJson(path.join(projectDir, 'src/data/generatedDesignTokens.json'), tokens);
console.log(`Generated ${tokens.length} public and component design tokens from the installed stylesheet.`);
