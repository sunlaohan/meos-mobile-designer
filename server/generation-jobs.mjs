import { createHmac, timingSafeEqual } from 'node:crypto';
import { AccountError } from './account-core.mjs';

export function workerToken(id, secret, expires = Date.now() + 120000) {
  const value = `${id}:${expires}`;
  return `${expires}.${createHmac('sha256', secret).update(`designer-generation:${value}`).digest('base64url')}`;
}
export function validWorkerToken(id, token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !secret) return false;
  const [expires, signature, extra] = token.split('.');
  if (extra !== undefined || !/^\d{13}$/.test(expires) || !/^[A-Za-z0-9_-]{43}$/.test(signature) || Number(expires) < now || Number(expires) > now + 180000) return false;
  const expected = workerToken(id, secret, Number(expires));
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
export function createGenerationJobs(env, fetcher = fetch) {
  async function db(route, method = 'GET', body) {
    const key = env.DESIGNER_SUPABASE_SERVICE_KEY;
    let response;
    try {
      response = await fetcher(`${env.DESIGNER_SUPABASE_URL}/rest/v1/${route}`, {
        method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
      });
    } catch { throw new AccountError('生成任务连接失败，请稍后重试。', 503); }
    if (!response.ok) {
      const message = (await response.json().catch(() => ({}))).message || '';
      if (message.includes('正在处理其他生成请求')) throw new AccountError(message, 429);
      throw new AccountError('生成任务服务不可用，请稍后重试。', 502);
    }
    return response.status === 204 ? null : response.json();
  }
  return {
    enqueue: (userId, request) => db('rpc/enqueue_generation', 'POST', { p_user_id: userId, p_request: request }),
    claim: id => db('rpc/claim_generation', 'POST', { p_id: id }),
    async status(id) { return (await db(`generation_jobs?id=eq.${id}&select=status`))[0]?.status; },
    async cancel(id, userId) {
      const rows = await db(`generation_jobs?id=eq.${id}&user_id=eq.${userId}&status=in.(queued,running)`, 'PATCH', { status: 'cancelled', request: null });
      return rows.length > 0;
    },
    complete: (id, result) => db(`generation_jobs?id=eq.${id}&status=eq.running`, 'PATCH', { status: 'completed', result }),
    fail: (id, error) => db(`generation_jobs?id=eq.${id}&status=in.(queued,running)`, 'PATCH', { status: 'failed', request: null, error }),
    async cleanup() {
      const stale = encodeURIComponent(new Date(Date.now() - 10 * 60 * 1000).toISOString());
      await db(`generation_jobs?status=in.(queued,running)&created_at=lt.${stale}`, 'PATCH', { status: 'failed', request: null, error: '生成已超时，请重新生成。' });
      const old = encodeURIComponent(new Date(Date.now() - 60 * 60 * 1000).toISOString());
      await db(`generation_jobs?created_at=lt.${old}`, 'DELETE');
    },
  };
}
