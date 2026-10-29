<script setup lang="ts">
import { useI18n, propertyName } from '../utils/i18n';
const { t } = useI18n();
import { computed, ref, watch } from 'vue';
import { ChevronDown, ChevronRight, Plus, Puzzle, Trash2, X } from 'lucide-vue-next';
import type { CanvasNode, ContainerExtensionKind, ContainerExtensions } from '../types';
import { containerExtensionDefinitions, extensionConflict, normalizedExtensions } from '../utils/containerExtensions';
const props = defineProps<{ node: CanvasNode; nodes: CanvasNode[] }>();
const emit = defineEmits<{ (event: 'update', value: ContainerExtensions): void }>();
const adding = ref(false);
const expanded = ref(new Set<ContainerExtensionKind>());
const configs = computed(() => normalizedExtensions(props.node));
const entries = computed(() => containerExtensionDefinitions.filter(({ kind }) => configs.value[kind]));
watch(() => props.node.id, () => { adding.value = false; expanded.value = new Set(); });
function add(kind: ContainerExtensionKind) {
  if (configs.value[kind] || extensionConflict(props.nodes, props.node.id, kind)) return;
  const definition = containerExtensionDefinitions.find((item) => item.kind === kind)!;
  expanded.value = new Set([...expanded.value, kind]);
  adding.value = false;
  emit('update', { ...configs.value, [kind]: { enabled: true, props: { ...definition.defaults } } });
}
function patch(kind: ContainerExtensionKind, patch: Record<string, any>) {
  const current = configs.value[kind]!;
  emit('update', { ...configs.value, [kind]: { ...current, props: { ...current.props, ...patch } } });
}
function toggle(kind: ContainerExtensionKind) {
  const current = configs.value[kind]!;
  if (!current.enabled && extensionConflict(props.nodes, props.node.id, kind)) return;
  emit('update', { ...configs.value, [kind]: { ...current, enabled: !current.enabled } });
}
function remove(kind: ContainerExtensionKind) {
  const next = { ...configs.value }; delete next[kind]; emit('update', next);
}
function expand(kind: ContainerExtensionKind) {
  const next = new Set(expanded.value); next.has(kind) ? next.delete(kind) : next.add(kind); expanded.value = next;
}
</script>

<template>
  <section class="property-group container-extension-editor" :aria-label="t('容器扩展')">
    <div class="extension-section-heading"><h3><Puzzle :size="15" />{{ t("容器扩展") }}</h3><button type="button" class="extension-add" :aria-expanded="adding" :aria-label="adding ? t('关闭扩展选择') : t('添加扩展')" :title="adding ? t('关闭扩展选择') : t('添加扩展')" @click="adding = !adding"><X v-if="adding" :size="14" aria-hidden="true" /><Plus v-else :size="14" aria-hidden="true" />{{ t("添加扩展") }}</button></div>
    <div v-if="adding" class="extension-picker" :aria-label="t('可添加的容器扩展')">
      <button v-for="item in containerExtensionDefinitions" :key="item.kind" type="button" :disabled="!!configs[item.kind] || !!extensionConflict(nodes, node.id, item.kind)" :aria-label="t('添加{0}扩展', [t(item.name)])" @click="add(item.kind)">
        <span><strong>{{ t(item.name) }}</strong><small>{{ t(item.description) }}</small></span><small>{{ configs[item.kind] ? t('已添加') : t(extensionConflict(nodes, node.id, item.kind)) || item.component }}</small>
      </button>
    </div>
    <p v-if="!entries.length" class="panel-description extension-empty">{{ t("为本容器添加刷新、加载或滚动行为，不改变子图层。") }}</p>
    <article v-for="item in entries" :key="item.kind" class="extension-card" :data-extension-kind="item.kind" :class="{ 'extension-card--disabled': !configs[item.kind]!.enabled }">
      <header>
        <button type="button" class="extension-expand" :aria-label="t('配置{0}扩展', [t(item.name)])" :aria-expanded="expanded.has(item.kind)" @click="expand(item.kind)"><ChevronDown v-if="expanded.has(item.kind)" :size="14" /><ChevronRight v-else :size="14" /><span><strong>{{ t(item.name) }}</strong><small>{{ item.component }}</small></span></button>
        <button type="button" role="switch" class="property-switch" :class="{ checked: configs[item.kind]!.enabled }" :aria-label="t('启用{0}扩展', [t(item.name)])" :aria-checked="configs[item.kind]!.enabled" :disabled="!configs[item.kind]!.enabled && !!extensionConflict(nodes, node.id, item.kind)" :title="!configs[item.kind]!.enabled ? t(extensionConflict(nodes, node.id, item.kind)) : ''" @click="toggle(item.kind)"><span /></button>
        <button type="button" class="extension-remove" :aria-label="t('移除{0}扩展', [t(item.name)])" :title="t('移除扩展，保留容器和子图层')" @click="remove(item.kind)"><Trash2 :size="14" /></button>
      </header>
      <div v-if="expanded.has(item.kind)" class="extension-settings">
        <p class="panel-description">{{ t(item.description) }}</p>
        <div v-for="field in item.fields" :key="field.key" class="property-row" :class="`control-${field.control}`">
          <component :is="field.control === 'select' ? 'div' : 'label'" class="property-label" :for="field.control === 'select' ? undefined : `extension-${node.id}-${item.kind}-${field.key}`" :id="`extension-label-${node.id}-${item.kind}-${field.key}`">{{ propertyName(field) }}<small v-if="field.help">{{ t(field.help) }}</small></component>
          <input v-if="field.control === 'text' || field.control === 'number'" :id="`extension-${node.id}-${item.kind}-${field.key}`" :type="field.control === 'number' ? 'number' : 'text'" :min="field.min" :max="field.max" :value="configs[item.kind]!.props[field.key]" @input="patch(item.kind, { [field.key]: field.control === 'number' ? Number(($event.target as HTMLInputElement).value) : ($event.target as HTMLInputElement).value })" />
          <select v-else-if="field.control === 'select'" :id="`extension-${node.id}-${item.kind}-${field.key}`" :aria-labelledby="`extension-label-${node.id}-${item.kind}-${field.key}`" :value="configs[item.kind]!.props[field.key]" @change="patch(item.kind, { [field.key]: ($event.target as HTMLSelectElement).value })"><option v-for="option in field.options" :key="String(option.value)" :value="option.value">{{ t(option.label) }}</option></select>
          <button v-else-if="field.control === 'boolean'" :id="`extension-${node.id}-${item.kind}-${field.key}`" type="button" role="switch" :aria-label="propertyName(field)" :aria-checked="!!configs[item.kind]!.props[field.key]" class="property-switch" :class="{ checked: !!configs[item.kind]!.props[field.key] }" @click="patch(item.kind, { [field.key]: !configs[item.kind]!.props[field.key] })"><span /></button>
        </div>
        <p v-if="item.kind === 'sticky' && node.type === 'background'" class="panel-description">{{ t("整页背景通常不需要吸附，建议用于筛选栏等小分组。") }}</p>
      </div>
    </article>
    <p v-if="entries.length" class="panel-description">{{ t("编辑时完整显示；预览时生效。刷新与触底加载使用本地模拟，真实数据接口在导出代码中接入。") }}</p>
  </section>
</template>
