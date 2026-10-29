import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

async function importTypeScript(file) {
  const source = await fs.readFile(new URL(file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}
const { isProductUrl, workspaceUrl } = await importTypeScript('../src/utils/siteRouting.ts');
const { websiteCopy } = await importTypeScript('../src/marketing/content.ts');

test('官网入口与产品入口分离，保留既有管理、页面和邮件回调链接', () => {
  for (const path of ['/', '/?lang=en', '/#workflow', '/#showcase', '/#faq']) assert.equal(isProductUrl(new URL(path, 'https://designer.example')), false, path);
  for (const path of ['/login', '/login/', '/login?register=1', '/app', '/app?page=abc', '/?admin=1', '/?page=abc', '/?recovery=1', '/?error_description=expired', '/#access_token=token&refresh_token=refresh', '/#error_description=expired', '/#type=recovery', '/?code=authorization-code']) assert.equal(isProductUrl(new URL(path, 'https://designer.example')), true, path);
  assert.equal(isProductUrl(new URL('/?admin=0', 'https://designer.example')), false);
});
test('云端页面导航使用可刷新的产品路径，页面 ID 被正确编码', () => {
  assert.equal(workspaceUrl(), '/app');
  assert.equal(workspaceUrl('document-id'), '/app?page=document-id');
  assert.equal(new URL(workspaceUrl('a&admin=1'), 'https://designer.example').searchParams.get('page'), 'a&admin=1');
  assert.equal(new URL(workspaceUrl('a&admin=1'), 'https://designer.example').searchParams.has('admin'), false);
});
test('中英文文案字段、场景数量、功能和 FAQ 完整对应', () => {
  function compare(a, b, path = 'copy') {
    assert.equal(typeof a, typeof b, path);
    if (typeof a === 'string') { assert(a.trim().length > 0, path); assert(b.trim().length > 0, path); return; }
    assert.deepEqual(Object.keys(a), Object.keys(b), path);
    for (const key of Object.keys(a)) compare(a[key], b[key], `${path}.${key}`);
  }
  compare(websiteCopy.zh, websiteCopy.en);
  assert.equal(websiteCopy.zh.galleryCards.length, 6);
  assert.equal(websiteCopy.en.features.length, 6);
  assert.equal(websiteCopy.zh.faqs.length, 6);
});
