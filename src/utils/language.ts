export type Language = 'zh' | 'en';
export const LANGUAGE_STORAGE_KEY = 'compose:language';
export const LEGACY_LANGUAGE_STORAGE_KEY = 'meri:website-language';
export const isLanguage = (value: unknown): value is Language => value === 'zh' || value === 'en';

export function createLanguageController(host: Window, apply: (language: Language) => void) {
  function savedLanguage() {
    try { return host.localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? host.localStorage.getItem(LEGACY_LANGUAGE_STORAGE_KEY); } catch { return null; }
  }
  const query = new URL(host.location.href).searchParams.get('lang');
  const saved = savedLanguage();
  let current: Language = isLanguage(query) ? query : isLanguage(saved) ? saved : /^en\b/i.test(host.navigator.language) ? 'en' : 'zh';
  function updateUrl() {
    const url = new URL(host.location.href);
    url.searchParams.set('lang', current);
    host.history.replaceState(host.history.state, '', url.pathname + url.search + url.hash);
  }
  function setLanguage(language: Language) {
    current = language;
    try { host.localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* Language switching also works without storage. */ }
    updateUrl(); apply(current);
  }
  function onStorage(event: StorageEvent) {
    if (event.key !== LANGUAGE_STORAGE_KEY || !isLanguage(event.newValue)) return;
    current = event.newValue; updateUrl(); apply(current);
  }
  host.addEventListener('storage', onStorage);
  try { host.localStorage.setItem(LANGUAGE_STORAGE_KEY, current); } catch { /* Use the in-memory preference. */ }
  apply(current);
  return { get language() { return current; }, setLanguage, dispose() { host.removeEventListener('storage', onStorage); } };
}
