import type { AiModel, GeneratedPage, PageBuildRequest } from '../types';
import { accounts, authHeaders, generationRequestLimit } from './accountClient';

async function readResponse<T>(response: Response): Promise<T> {
  let body;
  try { body = await response.json(); }
  catch { throw new Error(response.status === 413 ? '本次附件合计过大，请压缩图片或减少附件后重试。' : response.status === 429 ? '请求过于频繁，请稍后重试。' : '页面生成服务暂时不可用，请稍后重试。'); }
  if (!response.ok) throw new Error(body.error || `请求失败（HTTP ${response.status}）。`);
  return body as T;
}

export async function fetchAiModels(refresh = false) {
  return readResponse<{ models: AiModel[]; defaultModel: string }>(await fetch(`/api/ai/models${refresh ? '?refresh=1' : ''}`, { headers: await authHeaders(), signal: AbortSignal.timeout(20000) }));
}

export async function generatePageWithAi(request: PageBuildRequest, signal: AbortSignal) {
  const body = JSON.stringify(request);
  if (new TextEncoder().encode(body).byteLength > generationRequestLimit()) throw new Error('本次附件合计过大，请压缩图片或减少附件后重试。');
  const headers = { 'Content-Type': 'application/json', ...await authHeaders() };
  const response = await fetch('/api/ai/generate', { method: 'POST', headers, body, signal });
  if (response.status !== 202) return readResponse<GeneratedPage>(response);
  const { jobId } = await readResponse<{ jobId: string }>(response);
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('生成任务返回格式不正确，请重试。');
  const started = Date.now(); let failures = 0;
  try {
    while (Date.now() - started < 10 * 60 * 1000) {
      signal.throwIfAborted();
      const { data, error } = await accounts().from('generation_jobs').select('status,result,error').eq('id', jobId).abortSignal(signal).maybeSingle();
      signal.throwIfAborted();
      if (error) { if (++failures >= 3) throw new Error('读取生成进度失败，请检查网络后重试。'); }
      else {
        failures = 0;
        if (!data) throw new Error('生成任务已失效，请重新生成。');
        if (data.status === 'completed') return data.result as GeneratedPage;
        if (data.status === 'failed' || data.status === 'cancelled') throw new Error(data.error || '生成已取消，请重新生成。');
      }
      await pause(1500, signal);
    }
    throw new Error('生成等待超时，请重新生成。');
  } catch (error) {
    // A cancelled or abandoned request must release the shared generation slot.
    void fetch(`/api/ai/jobs/${jobId}`, { method: 'DELETE', headers, keepalive: true }).catch(() => undefined);
    throw error;
  }
}

function pause(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancelled = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', cancelled); resolve(); }, milliseconds);
    signal.addEventListener('abort', cancelled, { once: true });
    if (signal.aborted) cancelled();
  });
}
