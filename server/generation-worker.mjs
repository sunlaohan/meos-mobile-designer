import { AiError } from './ai-core.mjs';
import { deployedAiService } from './deployed-ai.mjs';
import { createGenerationJobs, validWorkerToken } from './generation-jobs.mjs';

export function createGenerationWorker(env, options = {}) {
  const jobs = options.jobs || createGenerationJobs(env);
  const ai = options.ai || deployedAiService(env);
  return async request => {
    if (Number(request.headers.get('content-length')) > 1024) return;
    const input = await request.json().catch(() => null);
    const id = input?.jobId;
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id) || !validWorkerToken(id, request.headers.get('x-designer-worker'), env.DESIGNER_ADMIN_SESSION_SECRET)) return;
    const payload = await jobs.claim(id);
    if (!payload) return; // Retries and duplicate invocations never generate a second time.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7 * 60 * 1000);
    let polling = false;
    const poll = setInterval(async () => {
      if (polling) return; polling = true;
      try { if (await jobs.status(id) !== 'running') controller.abort(); }
      catch { /* The overall timeout bounds transient database outages. */ }
      finally { polling = false; }
    }, 3000);
    try { await jobs.complete(id, await (await ai()).generate(payload, controller.signal)); }
    catch (error) { await jobs.fail(id, controller.signal.aborted ? '生成已取消或超时，请重试。' : error instanceof AiError ? error.message : '生成服务暂时不可用，请重试。'); }
    finally { clearTimeout(timeout); clearInterval(poll); }
  };
}
