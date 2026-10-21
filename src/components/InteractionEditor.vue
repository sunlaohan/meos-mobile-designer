<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Layers3, Link2, PencilLine, Plus, Trash2 } from 'lucide-vue-next';
import type { CanvasNode } from '../types';
import { getDefinition } from '../data/componentCatalog';
import { isCanvasPanel } from '../utils/canvasPresentation';
import { panelTargets, triggerEvents } from '../utils/panelInteractions';
import { componentDragState } from '../utils/componentDragState';
import { layerDragState } from '../utils/layerDragState';
import AssociationPicker from './AssociationPicker.vue';

const props = defineProps<{ node: CanvasNode; nodes: CanvasNode[] }>();
const emit = defineEmits<{
  (event: 'bind', name: string, targetId: string): void;
  (event: 'create', name: string, type: string): void;
  (event: 'edit', name: string): void;
  (event: 'remove', name: string): void;
  (event: 'error', message: string): void;
}>();
const events = computed(() => triggerEvents(props.node));
const eventName = ref('');
const dragging = ref(false);
const pickerOpen = ref(false);
const targets = computed(() => panelTargets(props.nodes, props.node));
const binding = computed(() => props.node.actions?.[eventName.value]);
const target = computed(() => targets.value.find((node) => node.id === binding.value?.targetId));
watch(() => props.node.id, () => {
  eventName.value = events.value.find((event) => props.node.actions?.[event.value])?.value || events.value[0]?.value || '';
  dragging.value = false;
  pickerOpen.value = false;
}, { immediate: true });
watch(eventName, () => { pickerOpen.value = false; });
function zoneClick(event: MouseEvent) {
  if (!(event.target as Element).closest('button')) pickerOpen.value = true;
}
function choose(id: string) {
  pickerOpen.value = false;
  emit('bind', eventName.value, id);
}
function create(type: string) {
  pickerOpen.value = false;
  emit('create', eventName.value, type);
}
function dragOver(event: DragEvent) {
  event.preventDefault();
  dragging.value = true;
}
function dragLeave(event: DragEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) dragging.value = false;
}
function drop(event: DragEvent) {
  dragging.value = false;
  pickerOpen.value = false;
  const id = event.dataTransfer?.getData('application/x-canvas-node');
  const type = event.dataTransfer?.getData('application/x-component-type');
  if (id && targets.value.some((node) => node.id === id)) emit('bind', eventName.value, id);
  else if (!id && type && isCanvasPanel({ type } as CanvasNode)) emit('create', eventName.value, type);
  else emit('error', '此控件不支持关联，请点击虚线框选择支持的控件');
}
</script>

<template>
  <section v-if="events.length" class="property-group interaction-editor">
    <h3><Link2 :size="15" />交互</h3>
    <label class="property-row"><span class="property-label">触发时机</span>
      <select v-model="eventName" aria-label="触发时机"><option v-for="event in events" :key="event.value" :value="event.value">{{ event.label }}</option></select>
    </label>
    <div class="interaction-drop-zone" :data-panel-trigger="node.id" :data-trigger-event="eventName" :data-associated-id="target?.id || ''" :class="{ active: dragging || componentDragState.associationId === node.id || layerDragState.association?.sourceId === node.id, 'has-association': !!target, 'has-binding': !!binding }" @click="zoneClick" @dragover.stop="dragOver" @dragleave="dragLeave" @drop.prevent.stop="drop">
      <button type="button" class="interaction-association-trigger" :aria-label="binding ? '更换关联控件' : '选择关联控件'" aria-haspopup="dialog" :aria-expanded="pickerOpen" @click="pickerOpen = true">
        <template v-if="target"><span class="association-bound-icon"><Layers3 :size="22" /></span><span class="association-bound-copy"><strong>{{ getDefinition(target.type).name }}</strong><span>点击更换，或拖入控件替换</span></span></template>
        <template v-else-if="binding"><Link2 :size="22" /><strong>关联控件已不可用</strong><small>点击重新选择，或拖入控件替换</small></template>
        <template v-else><Plus :size="23" /><strong>点击选择或拖入关联控件</strong><small>从左侧组件库或图层拖入</small></template>
      </button>
      <div v-if="binding" class="association-card-actions">
        <button v-if="target" type="button" class="association-edit" title="编辑关联组件" aria-label="编辑关联组件" @click="emit('edit', eventName)"><PencilLine :size="14" /></button>
        <button type="button" class="association-remove" :title="target ? '删除关联控件及对应图层（可撤销）' : '清除失效关联'" aria-label="删除关联控件" @click="emit('remove', eventName)"><Trash2 :size="14" /></button>
      </div>
    </div>
    <p class="panel-description">编辑时点击组件用于选中；在右上角「预览」中点击，才会触发关联面板。</p>
    <AssociationPicker v-if="pickerOpen" :targets="targets" :current-id="binding?.targetId" @select="choose" @create="create" @close="pickerOpen = false" />
  </section>
</template>
