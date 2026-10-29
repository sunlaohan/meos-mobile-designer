// Development-only fixture: no account client, tokens or real cloud requests.
import { createApp } from 'vue';
import PersagyVant from 'persagy-vant';
import Lazyload from 'persagy-vant/es/lazyload/index.mjs';
import Harness from './AutosaveHarness.vue';
import 'persagy-vant/lib/index.css';
import '../../src/theme.css';
import '../../src/styles.css';
import '../../src/account.css';
import '../../src/feedback.css';
document.documentElement.dataset.theme = 'dark';
document.documentElement.dataset.surface = 'product';
createApp(Harness).use(PersagyVant).use(Lazyload, { lazyComponent: true }).mount('#fixture');
