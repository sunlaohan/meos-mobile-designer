import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('云端保存保留版本条件，丢响应只认领相同内容，不重试覆盖他人修改；鉴权及网络失败正确分类', async () => {
  const cacheDir = await mkdtemp(path.join(os.tmpdir(), 'compose-autosave-cloud-'));
  const server = await createServer({ configFile: false, cacheDir, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
  const originalFetch = globalThis.fetch;
  const calls = [];
  let mode = 'lost-response', currentSignal;
  const document = { version: 1, title: '我的页面', updatedAt: 'local-time', nodes: [{ id: 'a', type: 'cell', props: { title: '人员', value: '测试' } }] };
  const page = { id: 'page-test', title: '原始页面', created_at: 'base', updated_at: 'base', document };
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url === '/api/account/config') return Response.json({ configured: true, url: 'https://autosave.example.test', anonKey: 'unit-public-key' });
    assert(url.startsWith('https://autosave.example.test/rest/v1/design_pages'));
    calls.push({ url, options }); currentSignal = options.signal;
    if (mode === 'network') throw new TypeError('Failed to fetch');
    if (mode === 'auth') return Response.json({ message: 'JWT expired', code: 'PGRST301' }, { status: 401 });
    if (options.method === 'PATCH') return Response.json(null);
    return Response.json({ ...page, title: document.title, updated_at: 'new-revision', document: mode === 'other-window' ? { ...document, nodes: [] } : { ...document, updatedAt: 'server-time', nodes: [{ props: { value: '测试', title: '人员' }, type: 'cell', id: 'a' }] } });
  };
  let client;
  try {
    const account = await server.ssrLoadModule('/src/utils/accountClient.ts');
    client = await account.initAccounts();
    const signal = new AbortController().signal;
    const acknowledged = await account.savePageDesign(page, document, signal);
    assert.equal(acknowledged.updated_at, 'new-revision'); assert.equal(calls.length, 2);
    assert(calls[0].url.includes('updated_at=eq.base')); assert.equal(calls[0].options.method, 'PATCH'); assert(currentSignal);
    mode = 'other-window'; calls.length = 0;
    await assert.rejects(account.savePageDesign(page, document), error => error.kind === 'conflict');
    assert.equal(calls.filter(call => call.options.method === 'PATCH').length, 1);
    mode = 'auth'; await assert.rejects(account.savePageDesign(page, document), error => error.kind === 'auth');
    mode = 'network'; await assert.rejects(account.savePageDesign(page, document), error => error.kind === 'network');
  } finally {
    await client?.auth.stopAutoRefresh(); globalThis.fetch = originalFetch;
    await server.close(); await rm(cacheDir, { recursive: true, force: true });
  }
});
