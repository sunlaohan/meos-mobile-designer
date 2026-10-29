import { createNetlifyHandler } from '../../server/netlify-api.mjs';
export default createNetlifyHandler(process.env);
export const config = { path: ['/api/account/*', '/api/admin/*', '/api/ai/*'], excludedPath: ['/api/admin/login'] };
