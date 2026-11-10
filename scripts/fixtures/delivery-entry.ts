import { createApp } from 'vue';
import PersagyVant from 'persagy-vant';
import Lazyload from 'persagy-vant/es/lazyload/index.mjs';
import Harness from './DeliveryHarness.vue';
import 'persagy-vant/lib/index.css';
import '../../src/styles.css';
import '../../src/theme.css';
createApp(Harness).use(PersagyVant).use(Lazyload, { lazyComponent: true }).mount('#app');
