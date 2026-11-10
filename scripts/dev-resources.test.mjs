import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import ts from 'typescript';

// Exported code templates and ?raw renderer sources contain import *text* too.
// Only follow syntax-level imports, not strings/comments inside handoff files.
function moduleImports(source) {
  const imports = [];
  const tree = ts.createSourceFile('browser-module.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))) imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(tree); return imports;
}

test('模块检查保留真实静态/动态导入，不跟随导出模板或原始源码字符串', () => {
  assert.deepEqual(moduleImports('import x from "./real.js"; export { x } from "./reexport.js"; import("./lazy.js"); const raw = `import Foo from "./not-real.vue"`; const text = "import(\'./also-not-real.js\')";'), ['./real.js', './reexport.js', './lazy.js']);
});

test('冷启动后编辑器完整模块链可加载，链接组件库及异步入口不返回失效的优化依赖', { timeout: 60000 }, async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'compose-dev-resources-'));
  const libraryRoot = await realpath(path.join(process.cwd(), 'node_modules/persagy-vant'));
  // Use the real dev configuration, with an isolated cache and an ephemeral port.
  // Build/SSR checks alone do not exercise browser dependency optimization.
  const server = await createServer({ cacheDir, logLevel: 'silent', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null, fs: { allow: [process.cwd(), libraryRoot, cacheDir] } } });
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const queue = ['/src/product-entry.ts'];
    const visited = new Set(queue);
    const failures = [];
    while (queue.length) {
      assert.ok(visited.size < 2000, '模块链应保持有界');
      await Promise.all(queue.splice(0, 10).map(async module => {
        const response = await fetch(origin + module, { signal: AbortSignal.timeout(20000) });
        const source = (await response.text()).split('//# sourceMappingURL=')[0];
        if (!response.ok || !/javascript|json/.test(response.headers.get('content-type') || '')) {
          failures.push(`${module}: ${response.status} ${response.statusText}`); return;
        }
        for (const specifier of moduleImports(source)) {
          if (!specifier.startsWith('/') && !specifier.startsWith('.')) continue;
          const target = new URL(specifier, origin + module);
          if (target.origin !== origin) continue;
          const next = target.pathname + target.search;
          if (!visited.has(next)) { visited.add(next); queue.push(next); }
        }
      }));
    }
    assert.deepEqual(failures, [], '所有静态及字面量异步导入均应返回有效模块');
    assert.ok([...visited].some(module => module.includes('supabase')), '检查应覆盖账号服务依赖');
    assert.ok([...visited].some(module => module.includes('persagy-vant')), '检查应覆盖链接组件库');
  } finally {
    await server.close();
    await rm(cacheDir, { recursive: true, force: true });
  }
});
