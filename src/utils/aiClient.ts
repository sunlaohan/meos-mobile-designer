import type { AiModel, GeneratedPage, PageBuildRequest } from '../types';

async function readResponse<T>(response: Response): Promise<T> {
  let body;
  try { body = await response.json(); }
  catch { throw new Error('页面生成服务不可用，请确认使用 pnpm dev 或 pnpm preview 启动。'); }
  if (!response.ok) throw new Error(body.error || `请求失败（HTTP ${response.status}）。`);
  return body as T;
}

export async function fetchAiModels(refresh = false) {
  return readResponse<{ models: AiModel[]; defaultModel: string }>(await fetch(`/api/ai/models${refresh ? '?refresh=1' : ''}`, { signal: AbortSignal.timeout(20000) }));
}

export async function generatePageWithAi(request: PageBuildRequest, signal: AbortSignal) {
  return readResponse<GeneratedPage>(await fetch('/api/ai/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal,
  }));
}
