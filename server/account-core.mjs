import { randomBytes, timingSafeEqual, scryptSync, createHmac } from 'node:crypto';

export class AccountError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function passwordHash(password, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function verifyPassword(password, encoded = '') {
  const [salt, hash] = encoded.split(':');
  if (!salt || !hash || !/^[a-f0-9]{128}$/.test(hash)) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}

export function createAccountService(env, fetcher = fetch, now = Date.now) {
  const url = env.DESIGNER_SUPABASE_URL?.replace(/\/$/, '');
  const key = env.DESIGNER_SUPABASE_SERVICE_KEY;
  const secret = env.DESIGNER_ADMIN_SESSION_SECRET;
  const configured = Boolean(url && key && env.DESIGNER_SUPABASE_ANON_KEY);
  const ready = () => { if (!configured) throw new AccountError('账号服务尚未配置，请联系管理员。', 503); };
  async function db(route, options = {}) {
    ready();
    let response;
    try {
      response = await fetcher(`${url}/rest/v1/${route}`, {
        ...options, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...options.headers },
        signal: AbortSignal.timeout(15000),
      });
    } catch { throw new AccountError('云端连接失败，请稍后重试。', 503); }
    if (!response.ok) throw new AccountError('云端数据操作失败，请检查项目数据库配置。', 502);
    return response.status === 204 ? null : response.json();
  }
  function sign(value) { return createHmac('sha256', secret).update(value).digest('base64url'); }
  function adminSession(cookie = '') {
    if (!secret) return false;
    const token = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('designer_admin='))?.slice(15);
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [expires, nonce, signature] = parts;
    if (!/^\d{1,16}$/.test(expires) || !/^[A-Za-z0-9_-]{32}$/.test(nonce) || !/^[A-Za-z0-9_-]{43}$/.test(signature) || Number(expires) <= now()) return false;
    const expected = sign(`${expires}.${nonce}`);
    return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }
  return {
    config: () => ({ configured, url: configured ? url : '', anonKey: configured ? env.DESIGNER_SUPABASE_ANON_KEY : '', ...(env.DESIGNER_ASYNC_AI === '1' ? { maxGenerationRequestBytes: 5 * 1024 * 1024 } : {}) }),
    adminSession,
    login(username, password) {
      if (!secret || secret.length < 32 || !env.DESIGNER_ADMIN_PASSWORD_HASH) throw new AccountError('管理员登录尚未配置。', 503);
      if (username !== (env.DESIGNER_ADMIN_USERNAME || 'admin') || !verifyPassword(password, env.DESIGNER_ADMIN_PASSWORD_HASH)) throw new AccountError('账号或密码错误。', 401);
      const value = `${now() + 8 * 60 * 60 * 1000}.${randomBytes(24).toString('base64url')}`;
      return `${value}.${sign(value)}`;
    },
    async requireUser(token) {
      ready();
      if (!token?.startsWith('Bearer ')) throw new AccountError('请先登录账号。', 401);
      let response;
      try { response = await fetcher(`${url}/auth/v1/user`, { headers: { apikey: env.DESIGNER_SUPABASE_ANON_KEY, Authorization: token }, signal: AbortSignal.timeout(10000) }); }
      catch { throw new AccountError('登录验证服务暂时不可用。', 503); }
      if (!response.ok) throw new AccountError('登录已过期，请重新登录。', 401);
      const user = await response.json();
      const profile = await db(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id`);
      if (!profile.length) throw new AccountError('此账号尚未激活。', 403);
      return user;
    },
    listCodes: () => db('activation_codes?deleted_at=is.null&select=*&order=created_at.desc&limit=1000'),
    async createCodes(count, note) {
      if (!Number.isInteger(count) || count < 1 || count > 100 || typeof note !== 'string' || note.length > 200) throw new AccountError('每次可生成 1–100 个激活码，备注最多 200 字。');
      const codes = Array.from({ length: count }, () => {
        const raw = randomBytes(8).toString('hex').toUpperCase();
        return { code: `MEOS-${raw.slice(0, 8)}-${raw.slice(8)}`, note: note.trim() };
      });
      return db('activation_codes', { method: 'POST', body: JSON.stringify(codes) });
    },
    async deleteCode(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AccountError('激活码编号不正确。');
      const result = await db(`activation_codes?id=eq.${id}&deleted_at=is.null`, { method: 'PATCH', body: JSON.stringify({ deleted_at: new Date(now()).toISOString() }) });
      if (!result.length) throw new AccountError('激活码不存在或已删除。', 404);
      return { ok: true };
    },
  };
}
