import { createApp } from 'vue';
import PersagyVant from 'persagy-vant';
import Lazyload from 'persagy-vant/es/lazyload/index.mjs';
import App from './App.vue';
import 'persagy-vant/lib/index.css';
import './styles.css';

createApp(App).use(PersagyVant).use(Lazyload, { lazyComponent: true }).mount('#app');
