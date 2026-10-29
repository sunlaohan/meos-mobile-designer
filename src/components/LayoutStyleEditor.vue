<script setup lang="ts">
import { useI18n } from '../utils/i18n';
const { t } = useI18n();
import { computed } from 'vue';
import DesignTokenControl from './DesignTokenControl.vue';
import type { CanvasNode, DesignTokenKind, PropertySchema } from '../types';

const props = defineProps<{ node: CanvasNode }>();
const emit = defineEmits<{ (event: 'patch', value: Record<string, unknown>): void }>();
const background = computed(() => props.node.type === 'background');
const prefix = computed(() => background.value ? t('背景') : t('容器'));
const idPrefix = computed(() => `${background.value ? 'background' : 'container'}-${props.node.id}`);
const sides = [{ key: 'Left', label: '左' }, { key: 'Right', label: '右' }, { key: 'Top', label: '上' }, { key: 'Bottom', label: '下' }];

function schema(key: string, label: string, tokenKind: DesignTokenKind): PropertySchema {
  return { key, label, control: 'text', tokenKind, allowGradient: key === 'fill', min: /margin|fill/i.test(key) ? undefined : 0 };
}
</script>

<template>
  <section class="property-group">
    <h3>{{ t("外观") }}</h3>
    <div class="property-row">
      <span class="property-label">{{ background ? t('背景颜色') : t('填充颜色') }}</span>
      <DesignTokenControl :id="`${idPrefix}-fill`" :schema="schema('fill', background ? t('背景颜色') : t('容器填充颜色'), 'color')" component-type="container-group" :model-value="node.props.fill" @update:model-value="emit('patch', { fill: $event })" />
    </div>
    <div class="property-row">
      <span class="property-label">{{ t("圆角") }}</span>
      <DesignTokenControl :id="`${idPrefix}-borderRadius`" :schema="schema('borderRadius', t('{0}圆角', [prefix]), 'radius')" component-type="container-group" :model-value="node.props.borderRadius" @update:model-value="emit('patch', { borderRadius: $event })" />
    </div>
  </section>
  <section class="property-group">
    <h3>{{ t("内边距") }}</h3>
    <div class="container-edge-grid">
      <div v-for="side in sides" :key="side.key" class="property-row">
        <span class="property-label">{{ t(side.label) }}</span>
        <DesignTokenControl :id="`${idPrefix}-padding${side.key}`" :schema="schema(`padding${side.key}`, t('{0}{1}内边距', [prefix, t(side.label)]), 'spacing')" component-type="container-group" :model-value="node.props[`padding${side.key}`]" @update:model-value="emit('patch', { [`padding${side.key}`]: $event })" />
      </div>
    </div>
  </section>
  <section class="property-group">
    <h3>{{ t("外边距") }}</h3>
    <div class="container-edge-grid">
      <div v-for="side in sides" :key="side.key" class="property-row">
        <span class="property-label">{{ t(side.label) }}</span>
        <DesignTokenControl :id="`${idPrefix}-margin${side.key}`" :schema="schema(`margin${side.key}`, t('{0}{1}外边距', [prefix, t(side.label)]), 'spacing')" component-type="container-group" :model-value="node.props[`margin${side.key}`]" @update:model-value="emit('patch', { [`margin${side.key}`]: $event })" />
      </div>
    </div>
  </section>
  <section class="property-group">
    <h3>{{ t("自动布局") }}</h3>
    <div class="property-row">
      <span class="property-label">{{ t("组件之间间距") }}</span>
      <DesignTokenControl :id="`${idPrefix}-gap`" :schema="schema('gap', t('{0}组件间距', [prefix]), 'spacing')" component-type="container-group" :model-value="node.props.gap" @update:model-value="emit('patch', { gap: $event })" />
    </div>
    <p class="panel-description">{{ t('子组件从上至下排列，间距仅作用于本{0}的直接子图层。', [prefix]) }}</p>
  </section>
</template>
