import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { designerAiPlugin } from './server/ai-plugin.mjs';
import { designerAccountPlugin } from './server/account-plugin.mjs';

export default defineConfig(({ mode, command }) => ({
  // Keep the live server's optimized modules separate from build/SSR tooling.
  cacheDir: command === 'serve' ? 'node_modules/.vite-designer-dev' : 'node_modules/.vite-designer-build',
  plugins: [vue(), designerAccountPlugin(mode), designerAiPlugin(mode)],
  resolve: { dedupe: ['vue'] },
  optimizeDeps: {
    include: ['vue', 'lucide-vue-next', '@supabase/supabase-js', 'persagy-vant', 'persagy-vant/es/lazyload/index.mjs'],
    // The linked library also uses extensionless imports of emitted .mjs files.
    esbuildOptions: { resolveExtensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'] },
  },
  server: {
    port: 4173,
    fs: {
      allow: ['/Users/sunlei/project/meos-mobile-designer', '/Users/sunlei/Component/persagy-vant'],
    },
  },
  preview: {
    port: 4173,
  },
}));
