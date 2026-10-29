import { AccountError, createAccountService } from './account-core.mjs';

export function createAccountMiddleware(env, service = createAccountService(env)) {
  const attempts = new Map();
  const send = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(data));
  };
  const cookie = (value, secure) => `designer_admin=${value}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${value ? 28800 : 0}${secure ? '; Secure' : ''}`;
  async function middleware(req, res, next) {
    const route = new URL(req.url || '/', 'http://localhost').pathname;
    if (!route.startsWith('/api/account/') && !route.startsWith('/api/admin/') && !route.startsWith('/api/ai/')) return next();
    try {
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new AccountError('只接受同源请求。', 403);
      if (route.startsWith('/api/ai/')) { req.designerUser = await service.requireUser(req.headers.authorization); return next(); }
      if (route === '/api/account/config' && req.method === 'GET') return send(res, 200, service.config());
      if (route === '/api/admin/session' && req.method === 'GET') return send(res, 200, { authenticated: service.adminSession(req.headers.cookie) });
      // Same-origin JSON and HttpOnly/SameSite cookies protect mutations from CSRF.
      if (req.method !== 'GET' && req.headers['content-type']?.split(';')[0] !== 'application/json') throw new AccountError('请求必须使用 JSON。', 415);
      if (route !== '/api/admin/login' && !service.adminSession(req.headers.cookie)) throw new AccountError('请先登录管理后台。', 401);
      let body = {};
      if (req.method !== 'GET') {
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new AccountError('请求过大。', 413); chunks.push(chunk); }
        try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw new AccountError('请求格式不正确。'); }
      }
      const secure = req.socket.encrypted || env.DESIGNER_PUBLIC_URL?.startsWith('https://');
      if (route === '/api/admin/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress || 'unknown'; const time = Date.now();
        for (const [key, value] of attempts) if (value.until <= time) attempts.delete(key);
        const entry = attempts.get(ip) || { count: 0, until: time + 15 * 60 * 1000 };
        if (entry.count >= 10) throw new AccountError('登录尝试过多，请 15 分钟后重试。', 429);
        entry.count += 1; attempts.set(ip, entry);
        if (typeof body.username !== 'string' || typeof body.password !== 'string' || body.password.length > 256) throw new AccountError('账号或密码错误。', 401);
        const token = service.login(body.username, body.password); attempts.delete(ip);
        res.setHeader('Set-Cookie', cookie(token, secure)); return send(res, 200, { ok: true });
      }
      if (route === '/api/admin/logout' && req.method === 'POST') { res.setHeader('Set-Cookie', cookie('', secure)); return send(res, 200, { ok: true }); }
      if (route === '/api/admin/codes' && req.method === 'GET') return send(res, 200, await service.listCodes());
      if (route === '/api/admin/codes' && req.method === 'POST') return send(res, 201, await service.createCodes(body.count, body.note || ''));
      if (route.startsWith('/api/admin/codes/') && req.method === 'DELETE') return send(res, 200, await service.deleteCode(route.split('/').pop()));
      throw new AccountError('接口不存在。', 404);
    } catch (error) { send(res, error instanceof AccountError ? error.status : 500, { error: error instanceof AccountError ? error.message : '账号服务发生错误，请稍后重试。' }); }
  }
  return middleware;
}
