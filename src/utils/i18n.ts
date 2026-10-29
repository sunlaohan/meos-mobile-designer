import { readonly, ref } from 'vue';
import translations from '../locales/en.json';
import { createLanguageController, type Language } from './language';

const currentLanguage = ref<Language>('zh');
const english: Record<string, string> = translations;
let controller: ReturnType<typeof createLanguageController> | undefined;
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.entries(english).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => {
  const indices: string[] = [];
  const pattern = key.split(/(\{\d+\})/).map(part => /^\{\d+\}$/.test(part) ? (indices.push(part.slice(1, -1)), '([\\s\\S]*?)') : escape(part)).join('');
  return { regex: new RegExp(`^${pattern}$`), indices, value };
});

// This function is used only at UI boundaries, never to rewrite document data.
export function t(source: unknown, parameters: readonly unknown[] = []): string {
  const text = String(source ?? '');
  let translated = text;
  let values: readonly unknown[] | Record<string, unknown> = parameters;
  if (currentLanguage.value === 'en') {
    if (Object.prototype.hasOwnProperty.call(english, text)) translated = english[text];
    else if (/[\p{Script=Han}]/u.test(text)) {
      for (const pattern of patterns) {
        const match = text.match(pattern.regex);
        if (match) { translated = pattern.value; values = Object.fromEntries(pattern.indices.map((key, i) => [key, match[i + 1]])); break; }
      }
    }
  }
  return translated.replace(/\{(\d+)\}/g, (placeholder, key) => String((values as Record<string, unknown>)[key] ?? placeholder));
}

export function humanize(value: string) {
  const text = value.replace(/^--van-/, '').replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/[-_]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
export function componentName(definition: { name: string; englishName: string }) {
  return currentLanguage.value === 'en' ? english[definition.name] || humanize(definition.englishName) : definition.name;
}
export function propertyName(schema: { label: string; key: string }) {
  return currentLanguage.value === 'en' ? english[schema.label] || humanize(schema.key) : schema.label;
}
export function uiDescription(text: string | undefined, fallback = 'See the component API documentation for details.') {
  if (!text || currentLanguage.value === 'zh') return text || '';
  return english[text] || (/[\p{Script=Han}]/u.test(text) ? fallback : text);
}
export function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleString(currentLanguage.value === 'en' ? 'en-US' : 'zh-CN', options);
}
export function initializeLanguage(surface: 'marketing' | 'product') {
  controller?.dispose();
  controller = createLanguageController(window, language => {
    currentLanguage.value = language;
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    document.documentElement.dataset.language = language;
    if (surface === 'product') document.title = new URL(location.href).searchParams.get('admin') === '1' ? `Compose · ${t('激活码管理')}` : 'Compose';
  });
}
export function useI18n() {
  return { language: readonly(currentLanguage), t, setLanguage: (language: Language) => controller?.setLanguage(language) };
}
