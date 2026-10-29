<script setup lang="ts">
import { computed, onBeforeUnmount, resolveComponent, watch, type Component } from 'vue';
import type { CanvasNode } from '../types';
import { anchoredPanelTypes, canvasPanelTypes } from '../../shared/association-controls.mjs';

const props = defineProps<{ node: CanvasNode; show: boolean; editing?: boolean; anchor?: { left: number; top: number; width: number; height: number } }>();
const emit = defineEmits<{
  (event: 'update:show', value: boolean): void;
  (event: 'patch', value: Record<string, unknown>): void;
  (event: 'action', message: string): void;
}>();
// Resolve registered Vue components rather than calling function-style services
// such as Dialog/Toast, which would mount outside the simulated phone.
const panels: Record<string, Component | string> = Object.fromEntries(canvasPanelTypes.map((type) => [type, resolveComponent(`van-${type}`)]));
const component = computed(() => panels[props.node.type]);
const anchored = computed(() => anchoredPanelTypes.includes(props.node.type));
const anchorStyle = computed(() => {
  if (!anchored.value) return undefined;
  const box = props.anchor || { left: 170, top: 120, width: 48, height: 24 };
  return { position: 'absolute' as const, left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` };
});
const panelProps = computed(() => ({
  ...props.node.props,
  teleport: null,
  ...(props.node.type === 'calendar' ? { poppable: true } : {}),
  ...(props.editing && props.node.type === 'qr-scanner' ? { paused: true } : {}),
  ...(props.editing ? { closeOnClickOverlay: false, closeOnClickOutside: false, hideOnClickOutside: false, closeOnClickAction: false, ...(props.node.type === 'toast' ? { duration: 0 } : {}) } : {}),
}));
function close() { emit('update:show', false); }
let notifyTimer: ReturnType<typeof setTimeout> | undefined;
watch(() => [props.show, props.editing, props.node.props.duration, props.node.type], () => {
  clearTimeout(notifyTimer);
  const duration = Number(props.node.props.duration ?? 3000);
  if (props.show && !props.editing && props.node.type === 'notify' && duration > 0 && Number.isFinite(duration)) notifyTimer = setTimeout(close, duration);
}, { immediate: true });
onBeforeUnmount(() => clearTimeout(notifyTimer));
function confirm() {
  if (props.node.type === 'calendar') close();
  emit('action', '已记录控件操作，业务提交接口待接入');
}
</script>

<template>
  <div class="dynamic-panel-renderer" :class="{ 'dynamic-panel-renderer--anchored': anchored }" :style="anchorStyle" :data-panel-id="node.id">
    <component
      :is="component"
      v-if="component && (!anchored || show)"
      v-bind="panelProps"
      :show="show"
      @update:show="$emit('update:show', $event)"
      @update:model-value="$emit('patch', { modelValue: $event })"
      @update:loading="$emit('patch', { loading: $event })"
      @update:error="$emit('patch', { error: $event })"
      @update:expanded-keys="$emit('patch', { expandedKeys: $event })"
      @confirm="confirm"
      @blur="node.type === 'number-keyboard' && close()"
      @close="node.type === 'number-keyboard' && close()"
      @click="node.type === 'overlay' && close()"
    >
      <template v-if="anchored" #reference><span class="panel-reference-anchor" aria-hidden="true" /></template>
      <template v-if="$slots.default || node.content" #default><slot>{{ node.content }}</slot></template>
    </component>
  </div>
</template>
