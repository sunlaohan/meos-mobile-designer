<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue';
import PhoneCanvas from './PhoneCanvas.vue';
import type { CanvasArtboard, CanvasNode } from '../types';
import { flattenNodes } from '../utils/nodeTree';
const board = ref<CanvasArtboard>();
const host = ref<HTMLElement>();
let sequence = 0, disposed = false;
const key = ref(0);
onBeforeUnmount(() => { disposed = true; sequence++; });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
function patch(id: string, value: Record<string, unknown>) {
  function visit(nodes: CanvasNode[]) { for (const node of nodes) { if (node.id === id) Object.assign(node.props, value); if (node.children) visit(node.children); } }
  if (board.value) visit(board.value.nodes);
}
async function capture(value: CanvasArtboard, signal?: AbortSignal) {
  const current = ++sequence;
  const check = () => { signal?.throwIfAborted(); if (disposed || current !== sequence) throw new Error('截图已取消'); };
  check(); board.value = JSON.parse(JSON.stringify(value)); key.value++;
  // Exporting a design must not request camera access or start media playback.
  for (const node of flattenNodes(board.value!.nodes)) {
    if (node.type === 'qr-scanner') node.props.paused = true;
    if ('autoplay' in node.props) node.props.autoplay = false;
  }
  try {
  await nextTick(); await frame(); await frame(); check();
  const element = host.value?.querySelector<HTMLElement>('.phone-frame');
  if (!element) throw new Error('参考画板未能渲染');
  await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 2500))]);
  await Promise.all([...element.querySelectorAll('img')].map(image => Promise.race([image.decode().catch(() => undefined), new Promise(resolve => setTimeout(resolve, 2500))])));
  await frame(); check();
  if ([...element.querySelectorAll('img')].some(image => !image.naturalWidth)) throw new Error('页面含未加载的图片，未生成不完整效果图');
  const { toPng } = await import('html-to-image');
  const result = await toPng(element, { width: 390, height: 844, pixelRatio: 1, backgroundColor: '#ffffff',
    style: { transform: 'none', boxShadow: 'none', transition: 'none' } });
  check(); return result;
  } finally { if (current === sequence) board.value = undefined; }
}
defineExpose({ capture });
</script>
<template><div ref="host" class="delivery-capture" aria-hidden="true" inert><PhoneCanvas v-if="board" :key="key" :nodes="board.nodes" preview @patch="patch" /></div></template>
<style scoped>.delivery-capture { position: fixed; left: 0; top: 0; width: 390px; height: 844px; pointer-events: none; opacity: 0; z-index: -1; }</style>
