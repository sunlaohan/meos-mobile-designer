import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { designerAiPlugin } from './server/ai-plugin.mjs';
import { designerAccountPlugin } from './server/account-plugin.mjs';

export default defineConfig(({ mode }) => ({
  plugins: [vue(), designerAccountPlugin(mode), designerAiPlugin(mode)],
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
