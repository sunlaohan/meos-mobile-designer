<script setup lang="ts">
import { useI18n, componentName } from '../utils/i18n';
const { t } = useI18n();
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Plus } from 'lucide-vue-next';
import CanvasTreeNode from './CanvasTreeNode.vue';
import DynamicPanelRenderer from './DynamicPanelRenderer.vue';
import AssociatedEditBar from './AssociatedEditBar.vue';
import { getDefinition } from '../data/componentCatalog';
import type { CanvasNode, ComponentType } from '../types';
import { canvasPresentation, panelForSelection, reconcilePanelStack } from '../utils/canvasPresentation';
import { canHaveChildren, findNode, flattenNodes } from '../utils/nodeTree';
import { createCanvasDrag } from '../utils/canvasDrag';

const props = withDefaults(
  defineProps<{
    nodes: CanvasNode[];
    selectedIds?: string[];
    zoom?: number;
    preview?: boolean;
    editingPanelId?: string;
    editingSourceId?: string;
  }>(),
  { selectedIds: () => [], zoom: 100, preview: false },
);

const emit = defineEmits<{
  (event: 'select', id: string | null, additive?: boolean): void;
  (event: 'add', type: ComponentType, index?: number, parentId?: string | null): void;
  (event: 'reorder', id: string, index: number, parentId?: string | null): void;
  (event: 'patch', id: string, value: Record<string, unknown>): void;
  (event: 'action', message: string): void;
  (event: 'exit-associated-edit'): void;
}>();

const scale = computed(() => props.zoom / 100);
const presentation = computed(() => canvasPresentation(props.nodes));
const treeOrder = computed(() => flattenNodes(props.nodes).map((node) => `${node.id}:${node.children?.length || 0}`).join(','));
const fixedTopIds = computed(() => presentation.value.topFixed.map(({ node }) => node.id));
const contentElement = ref<HTMLElement>();
const fixedElement = ref<HTMLElement>();
const topFixedElement = ref<HTMLElement>();
const fixedHeight = ref(0);
const topFixedHeight = ref(0);
const inspectedPanelId = ref('');
const panelLayerElement = ref<HTMLElement>();
const panelAnchor = ref<{ left: number; top: number; width: number; height: number }>();
const editingPanel = computed(() => props.preview ? undefined : presentation.value.panels.find(({ node }) => node.id === props.editingPanelId)?.node);
const openPanelStack = ref<string[]>([]);
watch(() => presentation.value.panels.filter(({ node }) => node.props.show).map(({ node }) => node.id), (ids) => {
  openPanelStack.value = reconcilePanelStack(openPanelStack.value, ids);
}, { immediate: true });
const activePanelId = computed(() => editingPanel.value?.id || (!props.preview && inspectedPanelId.value) || openPanelStack.value[openPanelStack.value.length - 1] || '');
let fixedObserver: ResizeObserver | undefined;
let topFixedObserver: ResizeObserver | undefined;
const stageStyle = computed(() => ({ width: `${390 * scale.value}px`, height: `${844 * scale.value}px` }));
const phoneStyle = computed(() => ({
  transform: `scale(${scale.value})`,
  '--phone-fixed-height': `${fixedHeight.value}px`,
  '--phone-top-fixed-height': `${topFixedHeight.value}px`,
  '--van-background-min-height': 'var(--phone-viewport-height)',
  '--van-action-sheet-max-height': editingPanel.value ? 'calc(var(--phone-viewport-height) - var(--phone-associated-bar-height))' : 'var(--phone-viewport-height)',
}));

watch(fixedElement, (element) => {
  fixedObserver?.disconnect();
  fixedHeight.value = element?.offsetHeight || 0;
  if (element) {
    fixedObserver = new ResizeObserver(() => { fixedHeight.value = element.offsetHeight; });
    fixedObserver.observe(element);
  }
}, { flush: 'post' });
watch(topFixedElement, (element) => {
  topFixedObserver?.disconnect();
  topFixedHeight.value = element?.offsetHeight || 0;
  if (element) {
    topFixedObserver = new ResizeObserver(() => { topFixedHeight.value = element.offsetHeight; });
    topFixedObserver.observe(element);
  }
}, { flush: 'post' });
onBeforeUnmount(() => { fixedObserver?.disconnect(); topFixedObserver?.disconnect(); });

function openPanelPreview(id: string) {
  if (!props.preview) {
    inspectedPanelId.value = panelForSelection(props.nodes, id);
    const sources = flattenNodes(props.nodes).filter((node) => Object.values(node.actions || {}).some((action) => action.targetId === id));
    const source = sources.find((node) => props.selectedIds.includes(node.id)) || sources[0];
    if (source) captureAnchor(source.id);
  }
}
defineExpose({ openPanelPreview });

function captureAnchor(id: string) {
  const layer = panelLayerElement.value;
  const source = layer?.parentElement?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
  if (!source || !layer) { panelAnchor.value = undefined; return; }
  const box = layer.getBoundingClientRect(); const target = source.getBoundingClientRect();
  panelAnchor.value = { left: Math.max(0, (target.left - box.left) / scale.value), top: Math.max(0, (target.top - box.top) / scale.value), width: target.width / scale.value, height: target.height / scale.value };
}
const canvasPointer = createCanvasDrag({
  nodes: () => props.nodes,
  onDrop({ sourceId }, intent) {
    if (!sourceId) return;
    if (intent.kind === 'canvas') emit('reorder', sourceId, intent.target.index, intent.target.parentId);
  },
});
onBeforeUnmount(canvasPointer.cancel);

function startCanvasDrag(event: PointerEvent) {
  if (props.preview) return;
  canvasPointer.resetClick();
  const source = (event.target as Element).closest<HTMLElement>('[data-node-id]');
  const node = source && findNode(props.nodes, source.dataset.nodeId!)?.node;
  if (source && node) canvasPointer.start(event, { type: node.type, sourceId: node.id }, source);
}

function captureTrigger(event: MouseEvent) {
  if (!props.preview && !canvasPointer.allowsClick(event)) {
    event.preventDefault(); event.stopPropagation();
    return;
  }
  if (!props.preview) return;
  const source = (event.target as Element).closest<HTMLElement>('[data-node-id]');
  if (source) captureAnchor(source.dataset.nodeId!);
}

function updatePanelShow(node: CanvasNode, show: boolean) {
  if (editingPanel.value?.id === node.id) {
    if (!show) emit('exit-associated-edit');
    return;
  }
  if (!show) inspectedPanelId.value = '';
  if (props.preview || node.props.show === true) emit('patch', node.id, { show });
}

watch(() => `${props.preview}:${props.editingPanelId || ''}:${props.selectedIds.join(',')}:${treeOrder.value}:${topFixedHeight.value}`, async (_value, _previous, onCleanup) => {
  let active = true;
  onCleanup(() => { active = false; });
  if (props.preview) return;
  if (editingPanel.value) {
    await nextTick();
    if (props.editingSourceId) captureAnchor(props.editingSourceId);
    return;
  }
  const id = props.selectedIds.length === 1 ? props.selectedIds[0] : '';
  openPanelPreview(id);
  if (!id || inspectedPanelId.value) return;
  await nextTick();
  // Let recursive layers register their reorder transitions before measuring.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  if (!active) return;
  const content = contentElement.value;
  const node = content?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`);
  if (!content || !node) return;
  const moving: Promise<unknown>[] = [];
  for (let ancestor: HTMLElement | null = node; ancestor && ancestor !== content; ancestor = ancestor.parentElement) {
    for (const animation of ancestor.getAnimations()) {
      if (animation instanceof CSSTransition && animation.transitionProperty === 'transform') moving.push(animation.finished.catch(() => undefined));
    }
  }
  await Promise.all(moving);
  if (!active || !node.isConnected) return;
  const box = content.getBoundingClientRect();
  const target = node.getBoundingClientRect();
  const top = box.top + topFixedHeight.value * scale.value;
  const bottom = box.bottom - fixedHeight.value * scale.value;
  const delta = target.top < top || target.height > bottom - top
    ? target.top - top
    : target.bottom > bottom ? target.bottom - bottom : 0;
  if (delta) content.scrollTo({ top: Math.max(0, content.scrollTop + delta / scale.value), behavior: 'smooth' });
}, { immediate: true, flush: 'post' });

function drop(event: DragEvent, index = props.nodes.length, parentId: string | null = null) {
  event.preventDefault();
  const canvasId = event.dataTransfer?.getData('application/x-canvas-node');
  if (canvasId) {
    emit('reorder', canvasId, index, parentId);
    return;
  }
  const type = (event.dataTransfer?.getData('application/x-component-type') || event.dataTransfer?.getData('text/plain')) as ComponentType;
  if (type) emit('add', type, index, parentId);
}

</script>

<template>
  <div class="phone-stage" :class="{ 'phone-stage--preview': preview }" :style="stageStyle">
    <div class="phone-frame" :class="{ 'phone-frame--preview': preview, 'phone-frame--editing-associated': !!editingPanel }" :style="phoneStyle" @click.self="emit('select', null)" @click.capture="captureTrigger" @pointerdown="startCanvasDrag" @dragstart.prevent>
      <div class="status-bar" aria-hidden="true">
        <span>9:41</span>
        <div class="status-icons"><span>▮▮▮</span><span>◒</span><span class="battery" /></div>
      </div>
      <AssociatedEditBar v-if="editingPanel" :name="componentName(getDefinition(editingPanel.type))" surface="phone" @exit="emit('exit-associated-edit')" />
      <div ref="contentElement" class="phone-content" @click.self="!preview && emit('select', null)" @dragover.prevent @drop="!preview && drop($event)">
        <TransitionGroup name="canvas-reorder">
        <CanvasTreeNode
          v-for="(node, index) in presentation.flow"
          :key="node.id"
          :node="node"
          :index="index"
          :selected-ids="selectedIds"
          :preview="preview"
          :source-nodes="nodes"
          :fixed-top-ids="fixedTopIds"
          @select="(id, additive) => emit('select', id, additive)"
          @add="(type, position, parent) => emit('add', type, position, parent)"
          @reorder="(id, position, parent) => emit('reorder', id, position, parent)"
          @patch="(id, patch) => emit('patch', id, patch)"
          @action="emit('action', $event)"
        />
        </TransitionGroup>

        <div v-if="!nodes.length" class="empty-canvas">
          <span><Plus :size="22" /></span>
          <strong>{{ t("拖入第一个组件") }}</strong>
          <small>{{ t("组件会按纵向自动布局排列") }}</small>
        </div>
      </div>
      <div v-if="presentation.topFixed.length" ref="topFixedElement" class="phone-top-fixed-layer">
        <CanvasTreeNode
          v-for="item in presentation.topFixed"
          :key="item.node.id"
          :node="item.node"
          :index="item.index"
          :parent-id="item.parentId"
          :selected-ids="selectedIds"
          :preview="preview"
          :source-nodes="nodes"
          docked
          @select="(id, additive) => emit('select', id, additive)"
          @add="(type, position, parent) => emit('add', type, position, parent)"
          @reorder="(id, position, parent) => emit('reorder', id, position, parent)"
          @patch="(id, patch) => emit('patch', id, patch)"
          @action="emit('action', $event)"
        />
      </div>
      <div v-if="presentation.fixed.length" ref="fixedElement" class="phone-fixed-layer">
        <CanvasTreeNode
          v-for="item in presentation.fixed"
          :key="item.node.id"
          :node="item.node"
          :index="item.index"
          :parent-id="item.parentId"
          :selected-ids="selectedIds"
          :preview="preview"
          :source-nodes="nodes"
          docked
          @select="(id, additive) => emit('select', id, additive)"
          @reorder="(id, position, parent) => emit('reorder', id, position, parent)"
          @patch="(id, patch) => emit('patch', id, patch)"
          @action="emit('action', $event)"
        />
      </div>
      <div ref="panelLayerElement" class="phone-panel-layer">
        <DynamicPanelRenderer
          v-for="item in presentation.panels"
          :key="item.node.id"
          :node="item.node"
          :show="activePanelId === item.node.id"
          :anchor="panelAnchor"
          :editing="editingPanel?.id === item.node.id"
          @update:show="updatePanelShow(item.node, $event)"
          @patch="emit('patch', item.node.id, $event)"
          @action="emit('action', $event)"
        >
          <template v-if="canHaveChildren(item.node) && (item.node.children?.length || item.node.content || !preview)" #default>
            <div class="panel-slot-editor" :data-slot-parent="item.node.id" @dragover.prevent.stop @drop.prevent.stop="!preview && drop($event, item.node.children?.length || 0, item.node.id)">
            <CanvasTreeNode
              v-for="(child, index) in item.node.children"
              :key="child.id"
              :node="child"
              :index="index"
              :parent-id="item.node.id"
              :selected-ids="selectedIds"
              :preview="preview"
              :source-nodes="nodes"
              @select="(id, additive) => emit('select', id, additive)"
              @patch="(id, patch) => emit('patch', id, patch)"
              @add="(type, position, parent) => emit('add', type, position, parent)"
              @reorder="(id, position, parent) => emit('reorder', id, position, parent)"
              @action="emit('action', $event)"
            />
            <p v-if="!item.node.children?.length && item.node.content" class="panel-text-content">{{ item.node.content }}</p>
            <div v-else-if="!item.node.children?.length && !preview" class="empty-container">{{ t("从左侧拖入组件，或将图层移入此面板") }}</div>
            </div>
          </template>
        </DynamicPanelRenderer>
      </div>
      <div class="phone-bottom-safe-area" aria-hidden="true">
        <div class="home-indicator" />
      </div>
    </div>
  </div>
</template>
