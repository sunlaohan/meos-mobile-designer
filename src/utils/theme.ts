export type ColorTheme = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'compose:theme';

const validTheme = (value: unknown): value is ColorTheme => value === 'dark' || value === 'light';

// A manual choice takes precedence over the OS. Removing it restores OS updates.
export function createThemeController(host: Window, apply: (theme: ColorTheme) => void) {
  const media = host.matchMedia('(prefers-color-scheme: dark)');
  function readPreference(): ColorTheme | null {
    try { const value = host.localStorage.getItem(THEME_STORAGE_KEY); return validTheme(value) ? value : null; }
    catch { return null; }
  }
  let preference = readPreference();
  let current: ColorTheme;
  function update() { current = preference ?? (media.matches ? 'dark' : 'light'); apply(current); }
  function setTheme(value: ColorTheme) {
    preference = value;
    try { host.localStorage.setItem(THEME_STORAGE_KEY, value); } catch { /* Still switch in private or restricted storage. */ }
    update();
  }
  function onSystemChange() { if (!preference) update(); }
  function onStorage(event: StorageEvent) {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    preference = validTheme(event.newValue) ? event.newValue : null;
    update();
  }
  media.addEventListener('change', onSystemChange);
  host.addEventListener('storage', onStorage);
  update();
  return {
    get theme() { return current; },
    setTheme,
    toggle() { setTheme(current === 'dark' ? 'light' : 'dark'); },
    dispose() { media.removeEventListener('change', onSystemChange); host.removeEventListener('storage', onStorage); },
  };
}
