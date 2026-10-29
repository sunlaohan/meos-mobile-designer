import { createApp } from 'vue';
import PersagyVant from 'persagy-vant';
import Lazyload from 'persagy-vant/es/lazyload/index.mjs';
import AccountApp from './AccountApp.vue';
import 'persagy-vant/lib/index.css';
import './styles.css';
import './account.css';
import './feedback.css';

export function mountProduct() {
  createApp(AccountApp).use(PersagyVant).use(Lazyload, { lazyComponent: true }).mount('#app');
}
