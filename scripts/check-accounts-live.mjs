// Isolated fixtures in the configured project; all fixtures are removed in finally.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { loadEnv } from 'vite';
import { createAccountService } from '../server/account-core.mjs';
const env = { ...loadEnv('development', process.cwd(), 'DESIGNER_'), ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('DESIGNER_'))) };
const base = env.DESIGNER_SUPABASE_URL;
const serviceKey = env.DESIGNER_SUPABASE_SERVICE_KEY;
const anon = env.DESIGNER_SUPABASE_ANON_KEY;
const service = createAccountService(env);
const suffix = randomBytes(7).toString('hex');
const ids = [], codeIds = [];
const password = `Test-${randomBytes(20).toString('hex')}`;
async function api(route, method = 'GET', body, token = serviceKey) {
  const response = await fetch(`${base}${route}`, { method, headers: { apikey: token === serviceKey ? serviceKey : anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: response.status === 204 ? null : await response.json() };
}
async function makeUser(code, letter) {
  const result = await api('/auth/v1/admin/users', 'POST', { email: `designer-test-${suffix}-${letter}@example.com`, password, email_confirm: true, user_metadata: { activation_code: code } });
  if (result.data.id) ids.push(result.data.id);
  return result;
}
try {
  const codes = await service.createCodes(3, `automated-test:${suffix}`); codeIds.push(...codes.map(code => code.id));
  const noCode = await makeUser('', 'invalid'); assert(noCode.status >= 400, '必须拒绝没有激活码的注册');
  const concurrent = await Promise.all([makeUser(codes[0].code, 'race-a'), makeUser(codes[0].code, 'race-b')]);
  assert.equal(concurrent.filter(result => result.status < 300).length, 1, '并发注册只能核销一次');
  const first = concurrent.find(result => result.status < 300).data;
  const reused = await makeUser(codes[0].code, 'reuse'); assert(reused.status >= 400, '必须拒绝已使用的激活码');
  await service.deleteCode(codes[2].id);
  const removed = await makeUser(codes[2].code, 'deleted'); assert(removed.status >= 400, '必须拒绝被删除的激活码');
  const secondResult = await makeUser(codes[1].code, 'second'); assert.equal(secondResult.status, 200); const second = secondResult.data;
  const consumed = (await service.listCodes()).find(code => code.id === codes[0].id);
  assert(consumed.used_at && consumed.used_email === first.email && consumed.used_by === first.id);
  const firstState = await api(`/auth/v1/admin/users/${first.id}`);
  assert(!firstState.data.user_metadata.activation_code, '不能在账号元数据中保留激活码');
  async function login(email) { const result = await api('/auth/v1/token?grant_type=password', 'POST', { email, password }, anon); assert.equal(result.status, 200); return result.data.access_token; }
  const a = await login(first.email), b = await login(second.email);
  const unauth = await api('/rest/v1/activation_codes?select=*', 'GET', null, anon); assert(unauth.status >= 400);
  const userCodes = await api('/rest/v1/activation_codes?select=*', 'GET', null, a); assert(userCodes.status >= 400);
  for (const document of [{}, { version: 1 }, { nodes: [] }, { version: 1, nodes: {} }]) {
    const invalid = await api('/rest/v1/design_pages', 'POST', { title: '无效结构', document }, a);
    assert(invalid.status >= 400, '数据库必须拒绝缺失版本或节点数组的文档');
  }
  const page = await api('/rest/v1/design_pages', 'POST', { title: '隔离验证', document: { version: 1, nodes: [] } }, a); assert.equal(page.status, 201); const doc = page.data[0];
  const bRead = await api(`/rest/v1/design_pages?id=eq.${doc.id}`, 'GET', null, b); assert.deepEqual(bRead.data, []);
  const bWrite = await api(`/rest/v1/design_pages?id=eq.${doc.id}`, 'PATCH', { title: '越权修改' }, b); assert.deepEqual(bWrite.data, []);
  const bInsert = await api('/rest/v1/design_pages', 'POST', { user_id: first.id, title: '越权创建' }, b); assert(bInsert.status >= 400);
  const update = await api(`/rest/v1/design_pages?id=eq.${doc.id}&updated_at=eq.${encodeURIComponent(doc.updated_at)}`, 'PATCH', { title: '重命名成功' }, a); assert.equal(update.data[0].title, '重命名成功');
  const stale = await api(`/rest/v1/design_pages?id=eq.${doc.id}&updated_at=eq.${encodeURIComponent(doc.updated_at)}`, 'PATCH', { title: '旧版本覆盖' }, a); assert.deepEqual(stale.data, []);
  const recovery = await api('/auth/v1/admin/generate_link', 'POST', { type: 'recovery', email: first.email, redirect_to: 'http://localhost:4173/?recovery=1' });
  assert.equal(recovery.status, 200);
  const verified = await api('/auth/v1/verify', 'POST', { token_hash: recovery.data.hashed_token, type: 'recovery' }, anon);
  assert.equal(verified.status, 200);
  const nextPassword = `Recovered1-${randomBytes(16).toString('hex')}`;
  const reset = await api('/auth/v1/user', 'PUT', { password: nextPassword }, verified.data.access_token); assert.equal(reset.status, 200);
  const oldLogin = await api('/auth/v1/token?grant_type=password', 'POST', { email: first.email, password }, anon); assert(oldLogin.status >= 400);
  const newLogin = await api('/auth/v1/token?grant_type=password', 'POST', { email: first.email, password: nextPassword }, anon); assert.equal(newLogin.status, 200);
  const publicAi = await fetch('http://localhost:4173/api/ai/models'); assert.equal(publicAi.status, 401);
  const privateAdmin = await fetch('http://localhost:4173/api/admin/codes'); assert.equal(privateAdmin.status, 401);
  const crossOrigin = await fetch('http://localhost:4173/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: '{}' }); assert.equal(crossOrigin.status, 403);
  console.log('通过：无激活码拒绝、并发一次核销、已用/删除拒绝、使用记录、邮箱密码登录、激活码访问隔离、跨账号文档读写隔离、新建/重命名/保存冲突、重设密码令牌与新旧密码验证、未登录 AI/管理员拒绝、跨站请求拒绝。');
} finally {
  for (const id of ids) { const result = await api(`/auth/v1/admin/users/${id}`, 'DELETE'); assert(result.status < 300, '测试账号清理失败'); }
  for (const id of codeIds) { const result = await api(`/rest/v1/activation_codes?id=eq.${id}`, 'DELETE'); assert(result.status < 300, '测试激活码清理失败'); }
  console.log('测试账号、文档和激活码已清理。');
}
