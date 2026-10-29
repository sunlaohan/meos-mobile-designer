import { readonly, ref } from 'vue';
import { createThemeController, type ColorTheme } from './theme';

const theme = ref<ColorTheme>('dark');
let controller: ReturnType<typeof createThemeController>;

export function initializeTheme(surface: 'marketing' | 'product') {
  controller?.dispose();
  controller = createThemeController(window, value => {
    theme.value = value;
    document.documentElement.dataset.theme = value;
    document.documentElement.style.colorScheme = value;
    document.documentElement.style.backgroundColor = value === 'light' ? '#f7f9fc' : surface === 'marketing' ? '#090909' : '#181a1d';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'light' ? '#f7f9fc' : surface === 'marketing' ? '#090909' : '#181a1d');
  });
}

export function useTheme() {
  return { theme: readonly(theme), toggleTheme: () => controller.toggle() };
}
