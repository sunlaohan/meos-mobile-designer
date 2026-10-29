import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

// Resolve the same definitions used by the editor, including its curated overrides.
const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'designer-ai-catalog-'));
const server = await createServer({ configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
try {
  const { componentCatalog } = await server.ssrLoadModule('/src/data/componentCatalog.ts');
  const { skillRulebook } = await server.ssrLoadModule('/src/data/skillRules.ts');
  await fs.mkdir('server', { recursive: true });
  await fs.writeFile('server/component-catalog.json', `${JSON.stringify({
    skill: skillRulebook,
    components: componentCatalog.map(({ type, name, docsPath, properties, previewMode }) => ({ type, name, docsPath, properties, previewMode })),
  }, null, 2)}\n`);
  console.log(`Generated AI catalog for ${componentCatalog.length} editor components.`);
} finally { await server.close(); await fs.rm(cacheDir, { recursive: true, force: true }); }
