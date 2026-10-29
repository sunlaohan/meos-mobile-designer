import { loadEnv } from 'vite';
import { createAccountMiddleware } from './account-http.mjs';

export function designerAccountPlugin(mode) {
  const env = { ...loadEnv(mode, process.cwd(), 'DESIGNER_'), ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('DESIGNER_'))) };
  const middleware = createAccountMiddleware(env);
  return { name: 'designer-accounts', configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
