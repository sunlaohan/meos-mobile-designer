export type DesignLoadingVariant = 'workspace' | 'editor' | 'preview';

export function designLoadingVariant(url: URL): DesignLoadingVariant {
  if (!url.searchParams.get('page')) return 'workspace';
  return url.searchParams.get('preview') === '1' || url.hash === '#preview' ? 'preview' : 'editor';
}
