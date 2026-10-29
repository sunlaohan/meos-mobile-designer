import fs from 'node:fs/promises';
import path from 'node:path';
import { AiError, createAiService } from './ai-core.mjs';

export function deployedAiService(env) {
  let service;
  return async () => {
    if (service) return service;
    const pack = JSON.parse(await fs.readFile(path.join(process.cwd(), 'server/deploy-assets.json'), 'utf8'));
    service = createAiService({
      baseUrl: env.DESIGNER_LLM_BASE_URL || 'https://sandbox.meos.center/bill-token-server/v1', apiKey: env.DESIGNER_LLM_API_KEY || '',
      preferredModel: env.DESIGNER_LLM_DEFAULT_MODEL || 'gemini-3.8-flash', catalog: pack.catalog,
      loadSkill: async () => pack.skill,
      loadComponentDocs: async types => types.map(type => {
        if (!Object.hasOwn(pack.components, type)) throw new AiError('生成所需的组件文档不存在。');
        return pack.components[type];
      }).join('\n\n'),
    });
    return service;
  };
}
