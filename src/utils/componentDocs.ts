import libraryPackage from 'persagy-vant/package.json';

export function getComponentDocsUrl(docsPath: string) {
  const url = new URL(libraryPackage.homepage);
  url.hash = `/zh-CN/${docsPath.replace(/^\/+/, '')}`;
  return url.href;
}
