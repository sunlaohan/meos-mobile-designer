import test from 'node:test';
import assert from 'node:assert/strict';
import { createNetlifyHandler } from '../server/netlify-api.mjs';
import { createGenerationWorker } from '../server/generation-worker.mjs';
import { workerToken, validWorkerToken } from '../server/generation-jobs.mjs';
import { AccountError } from '../server/account-core.mjs';

const id = 'ab000000-0000-4000-8000-000000000001';
const secret = 'test-session-secret';
const environment = { DEPLOY_URL: 'https://deploy.example', DESIGNER_ADMIN_SESSION_SECRET: secret };
const accountService = {
  config: () => ({ enabled: true }),
  requireUser: async token => { if (token !== 'Bearer valid') throw new AccountError('请先登录。', 401); return { id: 'owner' }; },
  adminSession: cookie => cookie === 'designer_admin=test-session',
  login: (username, password) => { if (username !== 'admin' || password !== 'correct') throw new AccountError('账号或密码错误。', 401); return 'test-session'; },
  listCodes: async () => [{ id: 'code' }],
};
function request(path, body, extra = {}) {
  return new Request(`https://public.example${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer valid', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
test('Web adapter preserves authenticated account routes, secure cookies and origin checks', async () => {
  const handler = createNetlifyHandler(environment, { accountService });
  assert.equal((await handler(request('/api/admin/codes'))).status, 401);
  assert.equal((await handler(request('/api/admin/login', {}, { Origin: 'https://other.example' }))).status, 403);
  const login = await handler(request('/api/admin/login', { username: 'admin', password: 'correct' }));
  assert.equal(login.status, 200);
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Path=\/api\/admin; Max-Age=28800; Secure/);
  const codes = await handler(request('/api/admin/codes', undefined, { Cookie: 'designer_admin=test-session' }));
  assert.deepEqual(await codes.json(), [{ id: 'code' }]);
  const unauthorized = new Request('https://public.example/api/ai/models');
  assert.equal((await handler(unauthorized)).status, 401);
});
test('Generation launch is signed and uses the configured deploy origin', async () => {
  const calls = [];
  const handler = createNetlifyHandler(environment, { accountService,
    jobs: { enqueue: async (owner, payload) => { calls.push([owner, payload]); return id; } },
    fetcher: async (url, options) => {
      assert.equal(url, 'https://deploy.example/internal/designer-generate');
      assert.deepEqual(JSON.parse(options.body), { jobId: id });
      assert(validWorkerToken(id, options.headers['X-Designer-Worker'], secret));
      return new Response(null, { status: 202 });
    },
  });
  const response = await handler(request('/api/ai/generate', { prompt: '生成页面' }));
  assert.equal(response.status, 202); assert.deepEqual(await response.json(), { jobId: id });
  assert.deepEqual(calls, [['owner', { prompt: '生成页面' }]]);
});
test('Invalid and oversized requests never enter the queue; launch failures clear queued input', async () => {
  const failed = []; let enqueued = 0;
  const handler = createNetlifyHandler(environment, { accountService,
    jobs: { enqueue: async () => { enqueued++; return id; }, fail: async (...args) => failed.push(args) },
    fetcher: async () => new Response(null, { status: 503 }),
  });
  assert.equal((await handler(request('/api/ai/generate', { prompt: '' }))).status, 400);
  assert.equal((await handler(request('/api/ai/generate', { extra: 'a'.repeat(5 * 1024 * 1024) }))).status, 413);
  assert.equal(enqueued, 0);
  assert.equal((await handler(request('/api/ai/generate', { prompt: '页面' }))).status, 503);
  assert.equal(failed[0][0], id);
});
test('Preview requests invoke the worker from trusted deploy metadata', async () => {
  const handler = createNetlifyHandler(environment, { accountService,
    jobs: { enqueue: async () => id },
    fetcher: async url => { assert.equal(url, 'https://aaaaaaaaaaaaaaaaaaaaaaaa--designer.netlify.app/internal/designer-generate'); return new Response(null, { status: 202 }); },
  });
  const response = await handler(request('/api/ai/generate', { prompt: '页面' }), { deploy: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa' }, site: { name: 'designer' } });
  assert.equal(response.status, 202);
});
test('Worker tokens reject tampering, different jobs, expired and excessive lifetimes', () => {
  const now = Date.now(); const token = workerToken(id, secret, now + 1000);
  assert(validWorkerToken(id, token, secret, now));
  assert(!validWorkerToken(id.replace('ab', 'ac'), token, secret, now));
  assert(!validWorkerToken(id, token + 'x', secret, now));
  assert(!validWorkerToken(id, token, secret, now + 2000));
  assert(!validWorkerToken(id, workerToken(id, secret, now + 200000), secret, now));
});
test('Worker rejects unsigned input and atomically claims each generation once', async () => {
  let claims = 0, generated = 0; const results = [];
  const worker = createGenerationWorker(environment, {
    jobs: { claim: async () => (++claims === 1 ? { prompt: 'test' } : null), complete: async (...args) => results.push(args), status: async () => 'running' },
    ai: async () => ({ generate: async payload => { generated++; return { title: payload.prompt, nodes: [] }; } }),
  });
  const unsigned = request('/internal/designer-generate', { jobId: id }); await worker(unsigned); assert.equal(claims, 0);
  for (let i = 0; i < 2; i++) await worker(request('/internal/designer-generate', { jobId: id }, { 'X-Designer-Worker': workerToken(id, secret) }));
  assert.equal(generated, 1); assert.deepEqual(results, [[id, { title: 'test', nodes: [] }]]);
});
