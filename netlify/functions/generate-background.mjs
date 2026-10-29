import { createGenerationWorker } from '../../server/generation-worker.mjs';
export default createGenerationWorker(process.env);
export const config = { background: true, path: '/internal/designer-generate', rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
