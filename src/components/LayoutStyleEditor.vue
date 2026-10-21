<script setup lang="ts">
import { computed } from 'vue';
import DesignTokenControl from './DesignTokenControl.vue';
import type { CanvasNode, DesignTokenKind, PropertySchema } from '../types';

const props = defineProps<{ node: CanvasNode }>();
const emit = defineEmits<{ (event: 'patch', value: Record<string, unknown>): void }>();
const background = computed(() => props.node.type === 'background');
const prefix = computed(() => background.value ? '背景' : '容器');
const idPrefix = computed(() => `${background.value ? 'background' : 'container'}-${props.node.id}`);
const sides = [{ key: 'Left', label: '左' }, { key: 'Right', label: '右' }, { key: 'Top', label: '上' }, { key: 'Bottom', label: '下' }];

function schema(key: string, label: string, tokenKind: DesignTokenKind): PropertySchema {
  return { key, label, control: 'text', tokenKind, allowGradient: key === 'fill', min: /margin|fill/i.test(key) ? undefined : 0 };
}
</script>

<template>
  <section class="property-group">
    <h3>外观</h3>
    <div class="property-row">
      <span class="property-label">{{ background ? '背景颜色' : '填充颜色' }}</span>
      <DesignTokenControl :id="`${idPrefix}-fill`" :schema="schema('fill', background ? '背景颜色' : '容器填充颜色', 'color')" component-type="container-group" :model-value="node.props.fill" @update:model-value="emit('patch', { fill: $event })" />
    </div>
    <div class="property-row">
      <span class="property-label">圆角</span>
      <DesignTokenControl :id="`${idPrefix}-borderRadius`" :schema="schema('borderRadius', `${prefix}圆角`, 'radius')" component-type="container-group" :model-value="node.props.borderRadius" @update:model-value="emit('patch', { borderRadius: $event })" />
    </div>
  </section>
  <section class="property-group">
    <h3>内边距</h3>
    <div class="container-edge-grid">
      <div v-for="side in sides" :key="side.key" class="property-row">
        <span class="property-label">{{ side.label }}</span>
        <DesignTokenControl :id="`${idPrefix}-padding${side.key}`" :schema="schema(`padding${side.key}`, `${prefix}${side.label}内边距`, 'spacing')" component-type="container-group" :model-value="node.props[`padding${side.key}`]" @update:model-value="emit('patch', { [`padding${side.key}`]: $event })" />
      </div>
    </div>
  </section>
  <section class="property-group">
    <h3>外边距</h3>
    <div class="container-edge-grid">
      <div v-for="side in sides" :key="side.key" class="property-row">
        <span class="property-label">{{ side.label }}</span>
        <DesignTokenControl :id="`${idPrefix}-margin${side.key}`" :schema="schema(`margin${side.key}`, `${prefix}${side.label}外边距`, 'spacing')" component-type="container-group" :model-value="node.props[`margin${side.key}`]" @update:model-value="emit('patch', { [`margin${side.key}`]: $event })" />
      </div>
    </div>
  </section>
  <section class="property-group">
    <h3>自动布局</h3>
    <div class="property-row">
      <span class="property-label">组件之间间距</span>
      <DesignTokenControl :id="`${idPrefix}-gap`" :schema="schema('gap', `${prefix}组件间距`, 'spacing')" component-type="container-group" :model-value="node.props.gap" @update:model-value="emit('patch', { gap: $event })" />
    </div>
    <p class="panel-description">子组件从上至下排列，间距仅作用于本{{ background ? '背景' : '容器' }}的直接子图层。</p>
  </section>
</template>
