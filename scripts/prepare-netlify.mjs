import fs from 'node:fs/promises';
import path from 'node:path';

// Snapshot only the component docs needed by the AI. Runtime never follows the local symlink.
const catalog = JSON.parse(await fs.readFile('server/component-catalog.json', 'utf8'));
const library = await fs.realpath('node_modules/persagy-vant');
const skillRoot = path.join(library, 'skills/use-persagy-vant');
const files = [...catalog.skill.sourceFiles, 'references/public-style-system.md', 'references/element-component-matching.md', 'references/business-component-catalog.md', 'references/component-catalog.md'];
const skill = (await Promise.all(files.map(async file => `FILE ${file}\n${await fs.readFile(path.join(skillRoot, file), 'utf8')}`))).join('\n\n');
const components = Object.fromEntries(await Promise.all(catalog.components.map(async item => {
  const directory = path.join(library, 'src', item.docsPath);
  const readme = await fs.readFile(path.join(directory, 'README.zh-CN.md'), 'utf8');
  const extra = await Promise.all(['demo/index.vue', 'types.ts', 'var.less'].map(async file => {
    try { return `FILE ${item.type}/${file}\n${await fs.readFile(path.join(directory, file), 'utf8')}`; }
    catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  }));
  return [item.type, `FILE ${item.type}/README.zh-CN.md\n${readme}\n${extra.join('\n')}`];
})));
await fs.writeFile('server/deploy-assets.json', JSON.stringify({ catalog, skill, components }));
console.log(`Prepared Netlify AI documentation for ${catalog.components.length} components.`);
