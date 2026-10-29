<script setup lang="ts">
import { useI18n, componentName } from '../utils/i18n';
const { t } = useI18n();
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ChevronDown, ChevronRight, Layers3 } from 'lucide-vue-next';
import LayerDragOverlay from './LayerDragOverlay.vue';
import { getDefinition } from '../data/componentCatalog';
import { findNode, flattenNodes, isContainer } from '../utils/nodeTree';
import { isCanvasPanel } from '../utils/canvasPresentation';
import { containerExtensionDefinitions, normalizedExtensions } from '../utils/containerExtensions';
import { selectLayerInterval } from '../utils/layerSelection';
import { layerDragState as drag } from '../utils/layerDragState';
import { advanceLayerHover, flattenLayers, LAYER_INDENT, layerScrollVelocity, projectLayerDrop, type FlatLayer } from '../utils/layerDrop';
import type { CanvasNode, ComponentType } from '../types';

const props = defineProps<{ nodes: CanvasNode[]; selectedIds: string[] }>();
const emit = defineEmits<{
  (event: 'selection', ids: string[]): void;
  (event: 'reorder', id: string, index: number, parentId: string | null): void;
  (event: 'add', type: ComponentType, index: number, parentId: string | null): void;
  (event: 'associate', sourceId: string, name: string, targetId: string): void;
}>();
const treeElement = ref<HTMLElement>();
const collapsed = ref(new Set<string>());
const rows = computed(() => flattenLayers(props.nodes, collapsed.value));
const selectionAnchor = ref('');
let requestedSelection: string | null = null;
function visibleSelectionAnchor() {
  const visible = new Set(rows.value.map((row) => row.node.id));
  return [...props.selectedIds].reverse().find((id) => visible.has(id)) || '';
}
watch(() => JSON.stringify(props.selectedIds), (value) => {
  if (requestedSelection === value) { requestedSelection = null; return; }
  requestedSelection = null;
  selectionAnchor.value = visibleSelectionAnchor();
}, { immediate: true });
watch(() => rows.value.map((row) => row.node.id).join(','), () => {
  if (!rows.value.some((row) => row.node.id === selectionAnchor.value)) selectionAnchor.value = visibleSelectionAnchor();
});
const draggedIds = computed(() => {
  const source = drag.sourceId ? findNode(props.nodes, drag.sourceId)?.node : null;
  return new Set(source ? flattenNodes([source]).map((node) => node.id) : []);
});
let session: { id: string; startX: number; startY: number; x: number; y: number; depth: number; list: HTMLElement; capture: HTMLElement; pointerId: number; dragging: boolean; lastFrame: number } | null = null;
let frame = 0;
let suppressClick = false;
let hover = { id: '', since: 0 };

function name(node: CanvasNode) { return isContainer(node) ? String(node.props.name || t('容器组')) : componentName(getDefinition(node.type)); }
function description(node: CanvasNode) { return String(node.props.name || node.props.title || node.props.label || name(node)); }
function toggle(id: string) {
  const next = new Set(collapsed.value);
  next.has(id) ? next.delete(id) : next.add(id);
  collapsed.value = next;
}

function targetAt(x: number, y: number, sourceId: string, requestedDepth: number) {
  const list = treeElement.value?.closest<HTMLElement>('.layers-list');
  if (!list) return { target: null, indicator: null };
  const box = list.getBoundingClientRect();
  if (x < box.left - 12 || x > box.right + 12) return { target: null, indicator: null };
  if (y < box.top - 24 || y > box.bottom + 24) return { target: null, indicator: null };
  const excluded = sourceId ? new Set(flattenNodes([findNode(props.nodes, sourceId)?.node].filter(Boolean) as CanvasNode[]).map((node) => node.id)) : new Set<string>();
  const eligible = rows.value.filter(({ node }) => !excluded.has(node.id));
  if (!eligible.length) return { target: { id: '', parentId: null, index: props.nodes.length, depth: 0, position: 'inside' as const, root: true }, indicator: null };
  const elements = new Map(Array.from(list.querySelectorAll<HTMLElement>('.layer-row')).map((row) => [row.dataset.layerId!, row]));
  let hovered = eligible[0];
  let rowBox = elements.get(hovered.node.id)!.getBoundingClientRect();
  let distance = Infinity;
  for (const row of eligible) {
    const bounds = elements.get(row.node.id)?.getBoundingClientRect();
    if (!bounds) continue;
    const delta = y < bounds.top ? bounds.top - y : y > bounds.bottom ? y - bounds.bottom : 0;
    if (delta < distance) { hovered = row; rowBox = bounds; distance = delta; }
    if (!delta) break;
  }
  const relative = (y - rowBox.top) / rowBox.height;
  const outdenting = !!session && x < session.startX - LAYER_INDENT * 0.75;
  const position = hovered.acceptsChildren && relative >= 0.25 && relative <= 0.75 && !outdenting
    ? 'inside' : relative < 0.5 ? 'before' : 'after';
  const target = projectLayerDrop(props.nodes, rows.value, sourceId, hovered.node.id, position, requestedDepth);
  if (!target || target.position === 'inside') return { target, indicator: null };
  let lineTop = target.position === 'before' ? rowBox.top : rowBox.bottom;
  // The projected parent may be an ancestor of the row under the pointer.
  if (target.position === 'after' && target.depth <= hovered.depth) {
    const start = eligible.findIndex((row) => row.node.id === hovered.node.id);
    for (let index = start + 1; index < eligible.length && eligible[index].depth > hovered.depth; index += 1) {
      const bottom = elements.get(eligible[index].node.id)?.getBoundingClientRect().bottom;
      if (bottom !== undefined) lineTop = bottom;
    }
  }
  const left = box.left + 16 + target.depth * LAYER_INDENT;
  return { target, indicator: { left, top: Math.max(box.top + 1, Math.min(box.bottom - 1, lineTop)), width: Math.max(24, box.right - left - 12) } };
}

function updateTarget(now: number) {
  if (!session) return;
  const { x, y, id } = session;
  const requestedDepth = session.depth + Math.round((x - session.startX) / LAYER_INDENT);
  const { target, indicator } = targetAt(x, y, id, requestedDepth);
  const association = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-panel-trigger]');
  const associationSource = association?.dataset.panelTrigger || '';
  if (drag.association?.sourceId !== associationSource) drag.association = associationSource ? { sourceId: associationSource, event: association!.dataset.triggerEvent! } : null;
  if (JSON.stringify(drag.target) !== JSON.stringify(target)) drag.target = target;
  drag.indicator = indicator;
  drag.x = x; drag.y = y;
  const parent = target?.parentId ? findNode(props.nodes, target.parentId)?.node : null;
  drag.detail = drag.association ? '松手关联此控件，替换当前关联' : target ? `${target.position === 'inside' && !target.root ? '移入' : '放入'} ${parent ? description(parent) : '页面根级'} · 第 ${target.depth + 1} 层` : '拖到图层间或分组中，Esc 取消';
  const expandable = target?.position === 'inside' ? target.id : '';
  const advanced = advanceLayerHover(hover, expandable, now);
  hover = advanced.hover;
  if (advanced.ready && collapsed.value.has(hover.id)) {
    const next = new Set(collapsed.value); next.delete(hover.id); collapsed.value = next;
  }
}

function animate(now: number) {
  if (!session?.dragging) return;
  const { list, x, y } = session;
  const box = list.getBoundingClientRect();
  const elapsed = Math.min(32, session.lastFrame ? now - session.lastFrame : 16);
  session.lastFrame = now;
  if (x >= box.left - 12 && x <= box.right + 12) list.scrollTop += layerScrollVelocity(y, box.top, box.bottom) * elapsed / 1000;
  updateTarget(now);
  frame = requestAnimationFrame(animate);
}
function pointerDown(event: PointerEvent, row: FlatLayer) {
  if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || (event.target as Element).closest('button')) return;
  const capture = event.currentTarget as HTMLElement;
  const list = capture.closest<HTMLElement>('.layers-list');
  if (!list) return;
  session = { id: row.node.id, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, depth: row.depth, list, capture, pointerId: event.pointerId, dragging: false, lastFrame: 0 };
  capture.setPointerCapture(event.pointerId);
  window.addEventListener('keydown', cancelOnEscape, true);
  window.addEventListener('blur', cancelPointer);
}
function pointerMove(event: PointerEvent) {
  if (!session) return;
  session.x = event.clientX; session.y = event.clientY;
  if (!session.dragging && Math.hypot(session.x - session.startX, session.y - session.startY) < 4) return;
  if (!session.dragging) {
    session.dragging = true;
    drag.sourceId = session.id;
    drag.label = description(findNode(props.nodes, session.id)!.node);
    document.documentElement.classList.add('is-layer-dragging');
    frame = requestAnimationFrame(animate);
  }
  event.preventDefault();
}
function pointerUp(event: PointerEvent) {
  if (!session) return;
  const id = session.id;
  if (session.dragging) {
    session.x = event.clientX; session.y = event.clientY;
    updateTarget(performance.now());
    const target = drag.target;
    const association = drag.association;
    suppressClick = true;
    window.setTimeout(() => { suppressClick = false; }, 0);
    event.preventDefault();
    cancelPointer();
    if (association) emit('associate', association.sourceId, association.event, id);
    else if (target) {
      if (target.position === 'inside' && collapsed.value.has(target.id)) toggle(target.id);
      emit('reorder', id, target.index, target.parentId);
    }
  } else cancelPointer();
}
function cancelOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); suppressClick = true; cancelPointer(); window.setTimeout(() => { suppressClick = false; }, 0); }
}
function cancelPointer() {
  cancelAnimationFrame(frame);
  const previous = session;
  session = null;
  if (previous?.capture.hasPointerCapture(previous.pointerId)) previous.capture.releasePointerCapture(previous.pointerId);
  drag.sourceId = ''; drag.target = null; drag.indicator = null;
  drag.association = null;
  hover = { id: '', since: 0 };
  document.documentElement.classList.remove('is-layer-dragging');
  window.removeEventListener('keydown', cancelOnEscape, true);
  window.removeEventListener('blur', cancelPointer);
}
onBeforeUnmount(cancelPointer);
function select(event: MouseEvent | KeyboardEvent, id: string) {
  if (suppressClick) return;
  const result = selectLayerInterval(props.nodes, rows.value.map((row) => row.node.id), props.selectedIds, selectionAnchor.value, id, { shift: event.shiftKey, toggle: event.metaKey || event.ctrlKey });
  selectionAnchor.value = result.anchorId;
  requestedSelection = JSON.stringify(result.selectedIds);
  emit('selection', result.selectedIds);
}
function dragOver(event: DragEvent, row: FlatLayer) {
  drag.target = targetAt(event.clientX, event.clientY, event.dataTransfer?.getData('application/x-canvas-node') || '', row.depth).target;
}
function drop(event: DragEvent, row: FlatLayer) {
  const id = event.dataTransfer?.getData('application/x-canvas-node');
  const type = event.dataTransfer?.getData('application/x-component-type');
  const target = targetAt(event.clientX, event.clientY, id || '', row.depth).target;
  if (target) {
    if (id) emit('reorder', id, target.index, target.parentId);
    else if (type) emit('add', type, target.index, target.parentId);
    if (target.position === 'inside' && collapsed.value.has(target.id)) toggle(target.id);
  }
  drag.target = null;
}
</script>

<template>
  <div ref="treeElement" class="layer-tree" role="group">
    <TransitionGroup name="layer-reorder" tag="div" class="layer-tree-rows">
    <div v-for="row in rows" :key="row.node.id" class="layer-tree-item">
      <div
        class="layer-row"
        :class="{ selected: selectedIds.includes(row.node.id), 'layer-row--group': isContainer(row.node), 'layer-row--dragging': draggedIds.has(row.node.id), 'drop-inside': drag.target?.id === row.node.id && drag.target.position === 'inside' }"
        :style="{ paddingLeft: `${8 + row.depth * LAYER_INDENT}px` }"
        :data-layer-id="row.node.id" :data-parent-id="row.parentId || ''" :data-index="row.index" :data-depth="row.depth"
        :data-container="row.acceptsChildren" :data-child-count="row.node.children?.length || 0"
        role="treeitem" tabindex="0" :aria-level="row.depth + 1" :aria-selected="selectedIds.includes(row.node.id)"
        :aria-expanded="row.acceptsChildren ? !collapsed.has(row.node.id) : undefined" :aria-label="name(row.node)" :draggable="false"
        @click="select($event, row.node.id)"
        @keydown.enter.self.prevent="select($event, row.node.id)" @keydown.space.self.prevent="select($event, row.node.id)"
        @pointerdown="pointerDown($event, row)" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="cancelPointer" @lostpointercapture="session && cancelPointer()"
        @dragstart.prevent @dragover.prevent.stop="dragOver($event, row)" @dragleave="!drag.sourceId && (drag.target = null)" @drop.prevent.stop="drop($event, row)"
      >
        <span v-for="level in row.depth" :key="level" class="layer-indent-guide" :style="{ left: `${16 + (level - 1) * LAYER_INDENT}px` }" aria-hidden="true" />
        <button v-if="row.acceptsChildren" class="layer-expander" :title="collapsed.has(row.node.id) ? t('展开子图层') : t('折叠子图层')" @pointerdown.stop @click.stop="toggle(row.node.id)">
          <ChevronRight v-if="collapsed.has(row.node.id)" :size="14" /><ChevronDown v-else :size="14" />
        </button>
        <span v-else class="layer-index">{{ String(row.index + 1).padStart(2, '0') }}</span>
        <Layers3 v-if="isContainer(row.node)" :size="16" class="layer-group-icon" />
        <span class="layer-copy"><strong>{{ name(row.node) }}</strong><small>{{ isContainer(row.node) ? t('{0} 个子图层', [row.node.children?.length || 0]) : `${getDefinition(row.node.type).englishName}${isCanvasPanel(row.node) ? t(' · 弹层预览') : ''}` }}</small><small v-if="Object.values(normalizedExtensions(row.node)).some(config => config?.enabled)" class="layer-extension-label">{{ containerExtensionDefinitions.filter(item => normalizedExtensions(row.node)[item.kind]?.enabled).map(item => t(item.name)).join(' · ') }}</small></span>
      </div>
    </div>
    </TransitionGroup>
    <LayerDragOverlay />
  </div>
</template>
