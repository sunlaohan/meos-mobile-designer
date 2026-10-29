import { createApp } from 'vue';
import MarketingApp from './MarketingApp.vue';
import ProductBootstrap from './components/ProductBootstrap.vue';
import { isProductUrl } from './utils/siteRouting';
import { initializeTheme } from './utils/useTheme';
import { initializeLanguage } from './utils/i18n';
import './theme.css';

const surface = isProductUrl(new URL(location.href)) ? 'product' : 'marketing';
document.documentElement.dataset.surface = surface;
initializeTheme(surface);
initializeLanguage(surface);
if (surface === 'product') {
  const bootstrap = createApp(ProductBootstrap, { onReady(mountProduct: () => void) { bootstrap.unmount(); mountProduct(); } });
  bootstrap.mount('#app');
} else {
  createApp(MarketingApp).mount('#app');
}
