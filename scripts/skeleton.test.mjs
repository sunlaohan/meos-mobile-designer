import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';

const server = await createServer({ configFile: false, plugins: [vue()], server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' });
let designLoadingVariant, Skeleton, Grid;
try {
  ({ designLoadingVariant } = await server.ssrLoadModule('/src/utils/designLoading.ts'));
  ({ default: Skeleton } = await server.ssrLoadModule('/src/components/DesignSkeleton.vue'));
  ({ default: Grid } = await server.ssrLoadModule('/src/components/PageGridSkeleton.vue'));
} finally { await server.close(); }

test('直接打开工作空间、设计和交互预览使用对应骨架布局', () => {
  for (const [path, variant] of [
    ['/login?lang=zh', 'workspace'], ['/app', 'workspace'], ['/app?page=', 'workspace'],
    ['/app?page=document-id', 'editor'], ['/?page=document-id', 'editor'],
    ['/?page=document-id&preview=1', 'preview'], ['/app?page=document-id#preview', 'preview'],
  ]) assert.equal(designLoadingVariant(new URL(path, 'https://compose.example')), variant);
});
test('工作空间骨架宣布加载状态，不展示空列表或伪造用户数据', async () => {
  const html = await renderToString(createSSRApp(Skeleton));
  assert.match(html, /aria-busy="true"/); assert.match(html, /role="status"/);
  assert.match(html, /design-skeleton--workspace/); assert.match(html, /design-skeleton-grid/);
  assert.equal((html.match(/class="design-skeleton-card"/g) || []).length, 3);
  assert.doesNotMatch(html, /从你的第一张画布开始|没有找到相关页面|@qq\.com|新建页面<\/button>/);
});
test('编辑器与预览骨架保留画布位置，不渲染可操作的假组件', async () => {
  for (const variant of ['editor', 'preview']) {
    const html = await renderToString(createSSRApp(Skeleton, { variant }));
    assert.match(html, /skeleton-phone/); assert.doesNotMatch(html, /design-skeleton-grid|v-model|保存<\/button>/);
    assert.equal(html.includes('skeleton-library'), variant === 'editor');
  }
});
test('列表占位仅用于视觉过渡，不把占位卡片当作可打开文档', async () => {
  const html = await renderToString(createSSRApp(Grid));
  assert.match(html, /aria-hidden="true"/); assert.doesNotMatch(html, /<button|<a\b|tabindex=/);
});
