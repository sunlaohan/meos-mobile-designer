import { Readable, Writable } from 'node:stream';

// Share the authenticated Node middleware between Vite and Netlify's Request API.
export function nodeMiddlewareHandler(middlewares) {
  return async (request, context = {}) => {
    const url = new URL(request.url);
    const incoming = request.body ? Readable.fromWeb(request.body) : Readable.from([]);
    incoming.url = `${url.pathname}${url.search}`;
    incoming.method = request.method;
    incoming.headers = Object.fromEntries(request.headers);
    incoming.headers.host = url.host;
    incoming.socket = { encrypted: url.protocol === 'https:', remoteAddress: context.ip || 'unknown' };
    incoming.netlifyContext = context;
    const chunks = []; const headers = new Headers(); let status = 200;
    return new Promise((resolve, reject) => {
      const outgoing = new Writable({ write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
      outgoing.setHeader = (key, value) => { headers.set(key, String(value)); };
      outgoing.writeHead = (code, values = {}) => { status = code; for (const [key, value] of Object.entries(values)) outgoing.setHeader(key, value); };
      outgoing.once('finish', () => resolve(new Response(Buffer.concat(chunks), { status, headers })));
      outgoing.once('error', reject);
      const disconnect = () => { incoming.destroy(); outgoing.destroy(); reject(request.signal.reason || new Error('Request aborted')); };
      request.signal.addEventListener('abort', disconnect, { once: true });
      outgoing.once('finish', () => request.signal.removeEventListener('abort', disconnect));
      let index = 0;
      function next() {
        const middleware = middlewares[index++];
        if (!middleware) { outgoing.writeHead(404, { 'Content-Type': 'application/json' }); outgoing.end(JSON.stringify({ error: '接口不存在。' })); return; }
        return Promise.resolve(middleware(incoming, outgoing, next)).catch(reject);
      }
      void next();
    });
  };
}
