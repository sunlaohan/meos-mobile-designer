import { createAccountMiddleware } from './account-http.mjs';
import { AccountError } from './account-core.mjs';
import { AiError } from './ai-core.mjs';
import { deployedAiService } from './deployed-ai.mjs';
import { createGenerationJobs, workerToken } from './generation-jobs.mjs';
import { nodeMiddlewareHandler } from './web-adapter.mjs';
import { validateAttachments } from '../shared/attachments.mjs';

const MAX_REQUEST = 5 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createNetlifyHandler(environment, options = {}) {
  const env = { ...environment, DESIGNER_ASYNC_AI: '1' };
  const ai = options.ai || deployedAiService(env);
  const jobs = options.jobs || createGenerationJobs(env);
  const fetcher = options.fetcher || fetch;
  const send = (response, status, data) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify(data));
  };
  return nodeMiddlewareHandler([createAccountMiddleware(env, options.accountService), async (request, response, next) => {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/ai/')) return next();
    try {
      if (request.method === 'GET' && url.pathname === '/api/ai/models') return send(response, 200, await (await ai()).models(url.searchParams.get('refresh') === '1'));
      const id = url.pathname.slice('/api/ai/jobs/'.length);
      if (request.method === 'DELETE' && url.pathname.startsWith('/api/ai/jobs/') && uuid.test(id)) {
        await jobs.cancel(id, request.designerUser.id); return send(response, 200, { ok: true });
      }
      if (url.pathname !== '/api/ai/generate' || request.method !== 'POST') throw new AccountError('接口不存在。', 404);
      if (!request.headers['content-type']?.startsWith('application/json')) throw new AccountError('请求必须使用 JSON。', 415);
      const chunks = []; let bytes = 0;
      for await (const chunk of request) { bytes += chunk.length; if (bytes > MAX_REQUEST) throw new AccountError('本次附件合计过大，请压缩图片或减少附件后重试。', 413); chunks.push(chunk); }
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AccountError('请求 JSON 格式不正确。'); }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload) || (payload.prompt !== undefined && typeof payload.prompt !== 'string') || (payload.prompt?.length || 0) > 4000) throw new AccountError('请填写最多 4000 字的页面需求。');
      try { validateAttachments(payload.attachments); } catch (error) { throw new AccountError(error.message); }
      if (!payload.prompt?.trim() && !payload.attachments?.length) throw new AccountError('请填写页面需求或添加参考附件。');
      const deployment = request.netlifyContext?.deploy?.id;
      const siteName = request.netlifyContext?.site?.name;
      // Use trusted platform context so previews and rollbacks invoke their own worker.
      const origin = /^[a-f0-9]{24}$/i.test(deployment || '') && /^[a-z0-9-]+$/.test(siteName || '')
        ? `https://${deployment}--${siteName}.netlify.app`
        : env.DEPLOY_URL || env.URL || env.DESIGNER_PUBLIC_URL;
      if (!origin?.startsWith('https://') || !env.DESIGNER_ADMIN_SESSION_SECRET) throw new AccountError('生成任务尚未配置。', 503);
      const jobId = await jobs.enqueue(request.designerUser.id, payload);
      try {
        const launched = await fetcher(`${new URL(origin).origin}/internal/designer-generate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Designer-Worker': workerToken(jobId, env.DESIGNER_ADMIN_SESSION_SECRET) },
          body: JSON.stringify({ jobId }), signal: AbortSignal.timeout(15000),
        });
        if (launched.status !== 202) throw new Error('Worker unavailable');
      } catch {
        await jobs.fail(jobId, '生成任务启动失败，请重新生成。');
        throw new AccountError('生成任务启动失败，请稍后重试。', 503);
      }
      return send(response, 202, { jobId });
    } catch (error) { send(response, error instanceof AccountError || error instanceof AiError ? error.status : 500, { error: error instanceof AccountError || error instanceof AiError ? error.message : '页面生成服务发生错误，请稍后重试。' }); }
  }]);
}
