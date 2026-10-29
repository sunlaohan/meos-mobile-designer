import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountService, passwordHash, verifyPassword } from '../server/account-core.mjs';

const env = { DESIGNER_SUPABASE_URL: 'https://test.supabase.co', DESIGNER_SUPABASE_SERVICE_KEY: 'server-only-secret', DESIGNER_SUPABASE_ANON_KEY: 'public-key', DESIGNER_ADMIN_USERNAME: 'admin', DESIGNER_ADMIN_PASSWORD_HASH: passwordHash('test-password'), DESIGNER_ADMIN_SESSION_SECRET: 'test-secret-with-at-least-32-characters' };

test('管理员密码哈希可验证，错误密码与无效哈希拒绝登录', () => {
  assert.equal(verifyPassword('test-password', env.DESIGNER_ADMIN_PASSWORD_HASH), true);
  assert.equal(verifyPassword('wrong', env.DESIGNER_ADMIN_PASSWORD_HASH), false);
  assert.equal(verifyPassword('test-password', ''), false);
  const service = createAccountService(env);
  assert.throws(() => service.login('admin', 'wrong'), { status: 401 });
  assert.throws(() => service.login('other', 'test-password'), { status: 401 });
});
test('管理会话校验签名、过期时间，不接受伪造 Cookie', () => {
  let time = 1000000;
  const service = createAccountService(env, undefined, () => time);
  const token = service.login('admin', 'test-password');
  assert.equal(service.adminSession(`other=x; designer_admin=${token}`), true);
  assert.equal(service.adminSession(`designer_admin=${token}x`), false);
  assert.equal(service.adminSession(`designer_admin=${token}.extra`), false);
  assert.equal(service.adminSession(`designer_admin=${token.split('.').slice(0, 2).join('.')}.${'中'.repeat(43)}`), false);
  assert.equal(service.adminSession('designer_admin=9999999999999.fake.signature'), false);
  time += 8 * 60 * 60 * 1000;
  assert.equal(service.adminSession(`designer_admin=${token}`), false);
});
test('管理员缺少安全配置时不能登录，公开配置中不包含服务密钥', () => {
  const config = createAccountService(env).config();
  assert.deepEqual(config, { configured: true, url: env.DESIGNER_SUPABASE_URL, anonKey: 'public-key' });
  assert.throws(() => createAccountService({ ...env, DESIGNER_ADMIN_SESSION_SECRET: '' }).login('admin', 'test-password'), { status: 503 });
  assert.equal(createAccountService({}).config().configured, false);
});
test('激活码使用强随机数，限制批次和备注，服务端密钥仅传向配置的 Supabase', async () => {
  const calls = [];
  const service = createAccountService(env, async (url, options) => { calls.push({ url, options }); return Response.json(JSON.parse(options.body)); });
  const codes = await service.createCodes(100, '  测试领取人  ');
  assert.equal(new Set(codes.map(code => code.code)).size, 100);
  assert(codes.every(code => /^MEOS-[A-F0-9]{8}-[A-F0-9]{8}$/.test(code.code) && code.note === '测试领取人'));
  assert.equal(calls[0].url, 'https://test.supabase.co/rest/v1/activation_codes');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer server-only-secret');
  for (const count of [0, 101, -1, 1.5, '2']) await assert.rejects(service.createCodes(count, ''), { status: 400 });
  await assert.rejects(service.createCodes(1, 'x'.repeat(201)), { status: 400 });
});
test('删除仅软删除指定激活码，保留使用记录；无效编号不可注入查询', async () => {
  let call;
  const service = createAccountService(env, async (url, options) => { call = { url, options }; return Response.json([{ id: 'existing' }]); });
  await service.deleteCode('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal(call.options.method, 'PATCH');
  assert.equal(call.url, 'https://test.supabase.co/rest/v1/activation_codes?id=eq.aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&deleted_at=is.null');
  assert.deepEqual(Object.keys(JSON.parse(call.options.body)), ['deleted_at']);
  await assert.rejects(service.deleteCode('x&or=(id.neq.null)'), { status: 400 });
});
test('AI 接口要求 Supabase 验证过的用户且有激活资料，拒绝伪造令牌', async () => {
  let callCount = 0;
  const service = createAccountService(env, async (url, options) => {
    callCount += 1;
    if (url.endsWith('/auth/v1/user')) { assert.equal(options.headers.Authorization, 'Bearer user-jwt'); return Response.json({ id: 'user-id' }); }
    return Response.json([{ id: 'user-id' }]);
  });
  await assert.rejects(service.requireUser(), { status: 401 });
  assert.equal(callCount, 0);
  assert.equal((await service.requireUser('Bearer user-jwt')).id, 'user-id');
  await assert.rejects(createAccountService(env, async () => new Response('', { status: 401 })).requireUser('Bearer forged'), { status: 401 });
  const unactivated = createAccountService(env, async url => Response.json(url.endsWith('/auth/v1/user') ? { id: 'user-id' } : []));
  await assert.rejects(unactivated.requireUser('Bearer user-jwt'), { status: 403 });
});
test('云端不可用时返回可重试错误并隐藏内部响应', async () => {
  await assert.rejects(createAccountService(env, async () => { throw new Error('secret-internal-details'); }).listCodes(), { status: 503, message: '云端连接失败，请稍后重试。' });
  await assert.rejects(createAccountService(env, async () => new Response('secret', { status: 500 })).listCodes(), { status: 502, message: '云端数据操作失败，请检查项目数据库配置。' });
});
