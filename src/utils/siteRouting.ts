// Keep existing email callbacks, admin links and saved-page links working when / becomes the website.
export function isProductUrl(url: URL): boolean {
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const query = url.searchParams;
  const fragment = new URLSearchParams(url.hash.slice(1));
  return path === '/login' || path === '/app'
    || query.get('admin') === '1' || query.get('recovery') === '1' || query.get('app') === '1'
    || query.has('page') || query.has('code') || query.has('error_description')
    || fragment.has('access_token') || fragment.has('refresh_token')
    || fragment.has('error_description') || fragment.get('type') === 'recovery';
}

export function workspaceUrl(pageId?: string): string {
  return pageId ? `/app?page=${encodeURIComponent(pageId)}` : '/app';
}
