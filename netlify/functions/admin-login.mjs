import { createAccountMiddleware } from '../../server/account-http.mjs';
import { nodeMiddlewareHandler } from '../../server/web-adapter.mjs';
export default nodeMiddlewareHandler([createAccountMiddleware(process.env)]);
export const config = { path: '/api/admin/login', rateLimit: { windowLimit: 10, windowSize: 180, aggregateBy: ['ip', 'domain'] } };
