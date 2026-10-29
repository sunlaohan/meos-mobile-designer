// Real deployment checks use isolated accounts and remove every fixture in finally.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { loadEnv } from 'vite';
import { createAccountService } from '../server/account-core.mjs';
import { createGenerationJobs } from '../server/generation-jobs.mjs';

const origin = process.argv[2];
if (!origin?.startsWith('https://')) throw Error('Pass the HTTPS deployment URL.');
const env = loadEnv('development', process.cwd(), 'DESIGNER_');
const service = createAccountService(env), jobs = createGenerationJobs(env);
const key = env.DESIGNER_SUPABASE_SERVICE_KEY, anon = env.DESIGNER_SUPABASE_ANON_KEY;
const users = [], codes = [], suffix = randomBytes(8).toString('hex');
async function db(route, method = 'GET', body, token = key) {
  const response = await fetch(`${env.DESIGNER_SUPABASE_URL}${route}`, {
    method, headers: { apikey: token === key ? key : anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000),
  });
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}
async function site(path, body, token, method = body === undefined ? 'GET' : 'POST') {
  return fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(40000) });
}
try {
  const config = await (await site('/api/account/config')).json();
  assert.equal(config.configured, true); assert.equal(config.url, env.DESIGNER_SUPABASE_URL);
  assert.deepEqual(Object.keys(config).sort(), ['anonKey', 'configured', 'maxGenerationRequestBytes', 'url']);
  assert.equal((await site('/api/ai/models')).status, 401);
  assert.equal((await site('/api/admin/codes')).status, 401);
  const generatedCodes = await service.createCodes(2, `netlify-test:${suffix}`); codes.push(...generatedCodes.map(c => c.id));
  const tokens = [];
  for (let i = 0; i < 2; i++) {
    const email = `netlify-test-${suffix}-${i}@example.com`, password = `Test-${randomBytes(20).toString('hex')}`;
    const created = await db('/auth/v1/admin/users', 'POST', { email, password, email_confirm: true, user_metadata: { activation_code: generatedCodes[i].code } });
    if (created.data.id) users.push(created.data.id);
    assert.equal(created.status, 200);
    const login = await db('/auth/v1/token?grant_type=password', 'POST', { email, password }, anon);
    assert.equal(login.status, 200); tokens.push(login.data.access_token);
  }
  const a = tokens[0], b = tokens[1];
  const first = await jobs.enqueue(users[0], { prompt: 'first' });
  const second = await jobs.enqueue(users[1], { prompt: 'second' });
  await assert.rejects(jobs.enqueue(users[0], { prompt: 'third' }), error => error.status === 429);
  const hidden = await db(`/rest/v1/generation_jobs?id=eq.${first}&select=id,status`, 'GET', undefined, b); assert.deepEqual(hidden.data, []);
  const protectedInput = await db(`/rest/v1/generation_jobs?id=eq.${first}&select=request`, 'GET', undefined, a); assert(protectedInput.status >= 400);
  assert.equal(await jobs.cancel(first, users[1]), false);
  assert.deepEqual(await jobs.claim(first), { prompt: 'first' }); assert.equal(await jobs.claim(first), null);
  assert.equal((await db(`/rest/v1/generation_jobs?id=eq.${first}&select=request`)).data[0].request, null);
  await jobs.cancel(first, users[0]); await jobs.cancel(second, users[1]);
  const createdPage = await db('/rest/v1/design_pages', 'POST', { title: '线上保存检查', document: { version: 1, nodes: [] } }, a);
  assert.equal(createdPage.status, 201); const page = createdPage.data[0];
  const renamed = await db(`/rest/v1/design_pages?id=eq.${page.id}&updated_at=eq.${encodeURIComponent(page.updated_at)}`, 'PATCH', { title: '线上重命名成功' }, a); assert.equal(renamed.data[0].title, '线上重命名成功');
  assert.deepEqual((await db(`/rest/v1/design_pages?id=eq.${page.id}`, 'GET', undefined, b)).data, []);
  const recovery = await db('/auth/v1/admin/generate_link', 'POST', { type: 'recovery', email: `netlify-test-${suffix}-0@example.com`, redirect_to: 'https://compose-mobile-designer.netlify.app/?recovery=1' });
  assert.equal(recovery.status, 200); assert.equal(new URL(recovery.data.action_link).searchParams.get('redirect_to'), 'https://compose-mobile-designer.netlify.app/?recovery=1');
  const modelsResponse = await site('/api/ai/models', undefined, a); assert.equal(modelsResponse.status, 200); const models = await modelsResponse.json(); assert(models.models.length > 0);
  console.log('通过：生产配置无服务密钥、登录保护、任务并发限制、任务和页面跨账号隔离、附件清除、原子任务领取、页面保存重命名、线上找回密码回调、模型列表。');
  if (process.argv.includes('--ai')) {
    const response = await site('/api/ai/generate', { prompt: '生成一个极简的手机设备详情页，只需要导航栏和一个显示设备名称、运行状态的单元格，不需要图片。', model: models.defaultModel }, a);
    const started = await response.json(); assert.equal(response.status, 202, JSON.stringify(started));
    const until = Date.now() + 8 * 60 * 1000;
    while (Date.now() < until) {
      const state = await db(`/rest/v1/generation_jobs?id=eq.${started.jobId}&select=status,result,error`, 'GET', undefined, a);
      assert.equal(state.status, 200); const job = state.data[0]; assert(job);
      if (job.status === 'completed') { assert(Array.isArray(job.result.nodes) && job.result.nodes.length > 0); console.log(`通过：线上后台 AI 生成，返回 ${job.result.nodes.length} 个顶层节点。`); break; }
      if (job.status === 'failed') throw Error(`Online generation failed: ${job.error}`);
      assert(Date.now() + 5000 < until, '生成超时'); await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
} finally {
  for (const id of users) assert((await db(`/auth/v1/admin/users/${id}`, 'DELETE')).status < 300);
  for (const id of codes) assert((await db(`/rest/v1/activation_codes?id=eq.${id}`, 'DELETE')).status < 300);
  console.log('测试账号、激活码、页面和生成任务已清理。');
}
