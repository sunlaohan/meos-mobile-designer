<script setup lang="ts">
import { computed } from 'vue';
import { GripVertical, Layers3 } from 'lucide-vue-next';
import ComponentRenderer from './ComponentRenderer.vue';
import ContainerExtensionsRenderer from './ContainerExtensionsRenderer.vue';
import { getDefinition } from '../data/componentCatalog';
import { canHaveChildren, findNode, getContainerStyle, isContainer } from '../utils/nodeTree';
import type { CanvasNode, ComponentType } from '../types';
import { componentDragState } from '../utils/componentDragState';

const props = withDefaults(defineProps<{
  node: CanvasNode;
  index: number;
  parentId?: string | null;
  selectedIds?: string[];
  preview?: boolean;
  docked?: boolean;
  sourceNodes?: CanvasNode[];
  fixedTopIds?: string[];
}>(), { parentId: null, selectedIds: () => [], preview: false });

const emit = defineEmits<{
  (event: 'select', id: string, additive?: boolean): void;
  (event: 'add', type: ComponentType, index: number, parentId: string | null): void;
  (event: 'reorder', id: string, index: number, parentId: string | null): void;
  (event: 'patch', id: string, value: Record<string, unknown>): void;
  (event: 'action', message: string): void;
}>();
const container = computed(() => isContainer(props.node));
const selected = computed(() => !props.preview && props.selectedIds.includes(props.node.id));
const label = computed(() => container.value ? props.node.props.name || '容器组' : getDefinition(props.node.type).englishName);
const sourceLocation = computed(() => props.sourceNodes ? findNode(props.sourceNodes, props.node.id) : null);
const originalIndex = computed(() => sourceLocation.value?.index ?? props.index);
const originalChildCount = computed(() => sourceLocation.value?.node.children?.length ?? props.node.children?.length ?? 0);

function drop(event: DragEvent, index: number, parentId: string | null) {
  if (props.preview) return;
  event.preventDefault();
  const canvasId = event.dataTransfer?.getData('application/x-canvas-node');
  if (canvasId) emit('reorder', canvasId, index, parentId);
  else {
    const type = event.dataTransfer?.getData('application/x-component-type');
    if (type) emit('add', type, index, parentId);
  }
}

function trigger(event: string, message: string) {
  const action = props.node.actions?.[event];
  if (action?.type === 'open-panel') {
    if (props.sourceNodes && !findNode(props.sourceNodes, action.targetId)) emit('action', '关联面板已删除，请重新配置交互');
    else emit('patch', action.targetId, { show: true });
  }
  else emit('action', message);
}
</script>

<template>
  <div v-if="!docked && fixedTopIds?.includes(node.id)" class="canvas-fixed-top-placeholder" :data-node-placeholder="node.id" aria-hidden="true" />
  <div
    v-else
    class="canvas-node"
    :class="{ selected, 'canvas-node--group': container, 'canvas-node--background': node.type === 'background', 'canvas-node--preview': preview, 'canvas-node--dragging': !preview && componentDragState.sourceId === node.id }"
    :data-node-id="node.id"
    :data-node-type="node.type"
    :data-parent-id="parentId || ''"
    :draggable="false"
    @dragstart.prevent.stop
    @dragover.prevent.stop
    @drop.stop="drop($event, originalIndex, parentId)"
    @click.stop="!preview && emit('select', node.id, $event.shiftKey)"
  >
    <button
      v-if="!preview && (selected || (container && node.layoutRole !== 'spacer'))"
      type="button"
      class="selection-label"
      :class="{ 'group-selection-label': container }"
      :title="container ? '选择容器组' : '选择组件'"
      @click.stop="emit('select', node.id, $event.shiftKey)"
    ><Layers3 v-if="container" :size="12" />{{ label }}</button>
    <button v-if="selected" class="drag-handle" title="拖动排序" tabindex="-1"><GripVertical :size="14" /></button>

    <ContainerExtensionsRenderer :node="node" :nodes="sourceNodes" :interactive="preview" @action="emit('action', $event)">
    <div
      v-if="container"
      class="canvas-group-body"
      :data-canvas-children="node.id"
      :style="getContainerStyle(node)"
      @dragover.prevent.stop
      @drop.stop="drop($event, originalChildCount, node.id)"
    >
      <TransitionGroup name="canvas-reorder">
      <CanvasTreeNode
        v-for="(child, childIndex) in node.children || []"
        :key="child.id"
        :node="child"
        :index="childIndex"
        :parent-id="node.id"
        :selected-ids="selectedIds"
        :preview="preview"
        :source-nodes="sourceNodes"
        :fixed-top-ids="fixedTopIds"
        @select="(id, additive) => emit('select', id, additive)"
        @add="(type, position, parent) => emit('add', type, position, parent)"
        @reorder="(id, position, parent) => emit('reorder', id, position, parent)"
        @patch="(id, patch) => emit('patch', id, patch)"
        @action="emit('action', $event)"
      />
      </TransitionGroup>
      <div v-if="!originalChildCount && !preview && node.layoutRole !== 'spacer'" class="empty-container">拖入组件到此容器</div>
    </div>
    <ComponentRenderer
      v-else
      :node="node"
      :interactive="preview"
      :docked="docked"
      @patch="emit('patch', node.id, $event)"
      @action="emit('action', $event)"
      @trigger="trigger"
    >
      <div v-if="canHaveChildren(node) && node.children?.length" class="component-slot-content" :class="{ 'component-slot-content--background': node.type === 'background' }" :data-canvas-children="node.id">
        <TransitionGroup name="canvas-reorder">
        <CanvasTreeNode
          v-for="(child, childIndex) in node.children"
          :key="child.id"
          :node="child"
          :index="childIndex"
          :parent-id="node.id"
          :selected-ids="selectedIds"
          :preview="preview"
          :source-nodes="sourceNodes"
          :fixed-top-ids="fixedTopIds"
          @select="(id, additive) => emit('select', id, additive)"
          @add="(type, position, parent) => emit('add', type, position, parent)"
          @reorder="(id, position, parent) => emit('reorder', id, position, parent)"
          @patch="(id, patch) => emit('patch', id, patch)"
          @action="emit('action', $event)"
        />
        </TransitionGroup>
      </div>
    </ComponentRenderer>
    </ContainerExtensionsRenderer>
  </div>
</template>
