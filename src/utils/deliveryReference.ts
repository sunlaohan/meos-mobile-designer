// Deliberate allowlist: package the SAME preview renderer, never account, auth,
// AI clients, environment files, or the designer's application entry point.
const sources = import.meta.glob<string>([
  '../components/{PhoneCanvas,CanvasTreeNode,ComponentRenderer,DynamicPanelRenderer,AssociatedEditBar,ContainerExtensionsRenderer}.vue',
  './{i18n,language,canvasPresentation,nodeTree,componentStyles,containerExtensions,componentDragState,canvasDrop,canvasDrag,pointerDrag,designTokens,propertyLabels}.ts',
  '../data/{componentCatalog,componentStyles}.ts', '../data/{generatedComponentMetadata,generatedComponentStyles,generatedDesignTokens}.json', '../locales/en.json', '../types.ts',
  '../../shared/{association-controls,container-extension-runtime}.{mjs,d.mts}', '../styles.css',
], { query: '?raw', import: 'default', eager: true });

export function referenceSources(): Record<string, string> {
  return Object.fromEntries(Object.entries(sources).map(([key, value]) => {
    const path = key.startsWith('../../shared/') ? key.slice(6) : key.startsWith('../') ? `src/${key.slice(3)}` : `src/utils/${key.slice(2)}`;
    return [path, value];
  }));
}

export const referenceApp = `<script setup lang="ts">
import { computed, ref } from 'vue';
import PhoneCanvas from './components/PhoneCanvas.vue';
import design from './design.json';
import { findNode } from './utils/nodeTree';
const boards = ref(design.artboards);
const active = ref(design.activeArtboardId);
const board = computed(() => boards.value.find(item => item.id === active.value) || boards.value[0]);
function patch(id: string, value: Record<string, unknown>) { const node = findNode(board.value.nodes, id)?.node; if (node) Object.assign(node.props, value); }
</script>
<template><header class="reference-toolbar"><strong>设计效果参考 · 非生产页面</strong><select v-model="active"><option v-for="item in boards" :key="item.id" :value="item.id">{{ item.title }}</option></select></header><main class="reference-stage"><PhoneCanvas :key="board.id" :nodes="board.nodes" preview @patch="patch" /></main></template>
`;

export const referenceCss = `html,body,#app{height:100%;overflow:auto}body{background:#e9edf2;color:#1b2129}.reference-toolbar{display:flex;align-items:center;justify-content:center;gap:16px;padding:16px;font-size:14px}.reference-toolbar select{padding:8px;border:1px solid #d9dfe8;border-radius:6px;background:white;color:#1b2129}.reference-stage{display:flex;justify-content:center;padding:16px 0 48px}`;

export const referenceEntry = `import { createApp } from 'vue';
import PersagyVant from 'persagy-vant';
import Lazyload from 'persagy-vant/es/lazyload/index.mjs';
import App from './ReferenceApp.vue';
import 'persagy-vant/lib/index.css';
import './styles.css';
import './reference.css';
createApp(App).use(PersagyVant).use(Lazyload, { lazyComponent: true }).mount('#app');
`;
