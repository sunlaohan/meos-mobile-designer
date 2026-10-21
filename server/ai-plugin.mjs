import fs from 'node:fs/promises';
import path from 'node:path';
import { loadEnv } from 'vite';
import { AiError, createAiService } from './ai-core.mjs';
import { ATTACHMENT_LIMITS } from '../shared/attachments.mjs';

export function designerAiPlugin(mode) {
  const root = process.cwd();
  const environment = { ...loadEnv(mode, root, 'DESIGNER_LLM_'), ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('DESIGNER_LLM_'))) };
  let service;
  let active = 0;
  async function getService() {
    if (service) return service;
    const catalog = JSON.parse(await fs.readFile(path.join(root, 'server/component-catalog.json'), 'utf8'));
    const library = await fs.realpath(path.join(root, 'node_modules/persagy-vant'));
    const skillRoot = path.join(library, 'skills/use-persagy-vant');
    const read = async (filename) => fs.readFile(filename, 'utf8');
    service = createAiService({
      baseUrl: environment.DESIGNER_LLM_BASE_URL || 'https://sandbox.meos.center/bill-token-server/v1',
      apiKey: environment.DESIGNER_LLM_API_KEY || '',
      preferredModel: environment.DESIGNER_LLM_DEFAULT_MODEL || 'gemini-3.8-flash', catalog,
      loadSkill: async () => {
        const files = [...catalog.skill.sourceFiles, 'references/public-style-system.md', 'references/element-component-matching.md', 'references/business-component-catalog.md', 'references/component-catalog.md'];
        return (await Promise.all(files.map(async (file) => `FILE ${file}\n${await read(path.join(skillRoot, file))}`))).join('\n\n');
      },
      loadComponentDocs: async (types) => (await Promise.all(types.map(async (type) => {
        const component = catalog.components.find((item) => item.type === type);
        const folder = path.join(library, 'src', component.docsPath);
        const readme = await read(path.join(folder, 'README.zh-CN.md'));
        const extra = await Promise.all(['demo/index.vue', 'types.ts', 'var.less'].map(async (file) => {
          try { return `FILE ${type}/${file}\n${await read(path.join(folder, file))}`; }
          catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
        }));
        return `FILE ${type}/README.zh-CN.md\n${readme}\n${extra.join('\n')}`;
      }))).join('\n\n'),
    });
    return service;
  }
  const send = (response, status, body) => {
    if (response.destroyed) return;
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify(body));
  };
  async function middleware(request, response, next) {
    const url = new URL(request.url || '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/ai/')) return next();
    const controller = new AbortController();
    response.on('close', () => { if (!response.writableEnded) controller.abort(); });
    try {
      if (request.headers.origin && new URL(request.headers.origin).host !== request.headers.host) throw new AiError('只接受同源请求。', 403);
      if (request.method === 'GET' && url.pathname === '/api/ai/models') {
        const result = await (await getService()).models(url.searchParams.get('refresh') === '1');
        return send(response, 200, result);
      }
      if (request.method !== 'POST' || url.pathname !== '/api/ai/generate') throw new AiError('接口不存在。', 404);
      if (!request.headers['content-type']?.startsWith('application/json')) throw new AiError('请求必须使用 JSON。', 415);
      if (active >= 2) throw new AiError('正在处理其他生成请求，请稍后再试。', 429);
      if (Number(request.headers['content-length']) > ATTACHMENT_LIMITS.requestBytes) { request.resume(); throw new AiError('附件请求过大，请减少图片或代码文件。', 413); }
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > ATTACHMENT_LIMITS.requestBytes) throw new AiError('附件请求过大，请减少图片或代码文件。', 413);
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AiError('请求 JSON 格式不正确。', 400); }
      active += 1;
      try { send(response, 200, await (await getService()).generate(body, controller.signal)); }
      finally { active -= 1; }
    } catch (error) {
      send(response, error instanceof AiError ? error.status : 500, { error: error instanceof AiError ? error.message : '页面生成服务发生错误，请检查服务端组件文档和配置。' });
    }
  }
  return {
    name: 'designer-ai-server',
    configureServer(server) { server.middlewares.use(middleware); },
    configurePreviewServer(server) { server.middlewares.use(middleware); },
  };
}
